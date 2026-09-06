import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DEV_USER,
  DEV_USER_PROFILE,
  DEV_DEVICE_KEY,
  DEV_AUTH_HEADER_PREFIX,
  isDevAuthBypassEnabled,
  isDevAuthActive,
  setDevAuthActive,
  getDevSession,
} from "@/lib/auth/dev-auth";
import { authService } from "@/lib/auth/session";
import { getDeviceKey } from "@/lib/device-key";
import { DecryptedMessageStore } from "@/lib/e2ee/decrypted-message-store";

describe("Ghostline Development Auth Bypass & Safety Hardening", () => {
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    localStorageMock = {};
    const mockStorage = {
      getItem: (key: string) => localStorageMock[key] ?? null,
      setItem: (key: string, val: string) => {
        localStorageMock[key] = val;
      },
      removeItem: (key: string) => {
        delete localStorageMock[key];
      },
      clear: () => {
        localStorageMock = {};
      },
    };
    vi.stubGlobal("localStorage", mockStorage);
    vi.stubGlobal("window", {
      localStorage: mockStorage,
    });
    vi.stubEnv("VITE_DEV_AUTH_BYPASS", "true");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe("1. Environment Control & Production Safety", () => {
    it("is disabled by default when VITE_DEV_AUTH_BYPASS is not set", () => {
      vi.stubEnv("VITE_DEV_AUTH_BYPASS", "false");
      expect(isDevAuthBypassEnabled()).toBe(false);
      expect(authService.isDevAuthBypassEnabled()).toBe(false);
    });

    it("is enabled when VITE_DEV_AUTH_BYPASS is 'true'", () => {
      vi.stubEnv("VITE_DEV_AUTH_BYPASS", "true");
      expect(isDevAuthBypassEnabled()).toBe(true);
      expect(authService.isDevAuthBypassEnabled()).toBe(true);
    });

    it("FAILS CLOSED in production environment even if env var is true", () => {
      vi.stubEnv("VITE_DEV_AUTH_BYPASS", "true");
      vi.stubEnv("NODE_ENV", "production");
      expect(() => isDevAuthBypassEnabled()).toThrow(/SECURITY FAULT/);
    });
  });

  describe("2. Deterministic Development User Identity", () => {
    it("provides deterministic UUID user ID and mock session", () => {
      const session = getDevSession();
      expect(session.user.id).toBe(DEV_USER.id);
      expect(session.user.email).toBe(DEV_USER.email);
      expect(session.access_token).toBe(`${DEV_AUTH_HEADER_PREFIX}${DEV_USER.id}`);
      expect(DEV_USER_PROFILE.username).toBe("devghost");
      expect(DEV_USER_PROFILE.display_name).toBe("Ghostline Developer");
    });
  });

  describe("3. Development Auth Service Delegation", () => {
    it("signs in with dev bypass and sets active state", async () => {
      setDevAuthActive(false);
      expect(isDevAuthActive()).toBe(false);

      const result = await authService.signInWithDevBypass();
      expect(result.user.id).toBe(DEV_USER.id);
      expect(isDevAuthActive()).toBe(true);

      const currentUser = await authService.getCurrentUser();
      expect(currentUser?.id).toBe(DEV_USER.id);

      const { data } = await authService.getSession();
      expect(data.session?.user.id).toBe(DEV_USER.id);
    });

    it("signs out and clears dev bypass session", async () => {
      setDevAuthActive(true);
      expect(isDevAuthActive()).toBe(true);

      await authService.signOut();
      expect(isDevAuthActive()).toBe(false);
    });
  });

  describe("4. E2EE & Device Isolation Compatibility", () => {
    it("generates and scopes device key specifically for dev user", () => {
      const devDeviceKey = getDeviceKey(DEV_USER.id);
      expect(devDeviceKey).toBeTruthy();
      expect(localStorageMock[`ghostline.device_key.${DEV_USER.id}`]).toBe(devDeviceKey);

      // Distinct from another user
      const otherDeviceKey = getDeviceKey("other-user-uuid");
      expect(devDeviceKey).not.toBe(otherDeviceKey);
    });

    it("scopes E2EE decrypted message store to development user ID", () => {
      const store = new DecryptedMessageStore();
      store.setActiveUser(DEV_USER.id);
      expect(store.getActiveUser()).toBe(DEV_USER.id);
    });
  });
});
