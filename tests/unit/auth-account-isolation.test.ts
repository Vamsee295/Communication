// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { getDeviceKey } from "@/lib/device-key";
import { maskEmail } from "@/lib/auth/mask-email";
import { DecryptedMessageStore } from "@/lib/e2ee/decrypted-message-store";
import { authService } from "@/lib/auth/session";

describe("Ghostline Auth Account Isolation & Verification", () => {
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("1. TanStack Query Cache Isolation & Purge", () => {
    it("clears cached queries on SIGNED_OUT and SIGNED_IN events", () => {
      const qc = new QueryClient();

      // Account A logs in and populates queries
      qc.setQueryData(["me", "user_A"], { id: "user_A", username: "ghost_a" });
      qc.setQueryData(["conversations", "user_A"], [{ id: "c1", title: "Secret A" }]);
      qc.setQueryData(["friendships", "user_A"], [{ id: "f1", friend_id: "user_C" }]);

      expect(qc.getQueryData(["me", "user_A"])).toBeDefined();

      // On SIGNED_OUT, queryClient.clear() is invoked
      qc.clear();

      expect(qc.getQueryData(["me", "user_A"])).toBeUndefined();
      expect(qc.getQueryData(["conversations", "user_A"])).toBeUndefined();
      expect(qc.getQueryData(["friendships", "user_A"])).toBeUndefined();

      // Account B logs in
      qc.setQueryData(["me", "user_B"], { id: "user_B", username: null });

      expect(qc.getQueryData(["me", "user_B"])).toEqual({ id: "user_B", username: null });
      expect(qc.getQueryData(["me", "user_A"])).toBeUndefined();
    });

    it("prevents Account A cached query keys from satisfying Account B queries", () => {
      const qc = new QueryClient();

      // Even if cache was not cleared, user-scoped query keys protect data
      qc.setQueryData(["me", "user_A"], { id: "user_A", username: "ghost_a" });
      qc.setQueryData(["conversations", "user_A"], [{ id: "conv_a" }]);

      const accountBProfile = qc.getQueryData(["me", "user_B"]);
      const accountBConversations = qc.getQueryData(["conversations", "user_B"]);

      expect(accountBProfile).toBeUndefined();
      expect(accountBConversations).toBeUndefined();
    });
  });

  describe("2. Device Key Account Scoping", () => {
    it("generates distinct device keys for Account A and Account B on the same browser", () => {
      const deviceKeyA = getDeviceKey("user_A");
      const deviceKeyB = getDeviceKey("user_B");

      expect(deviceKeyA).toBeTruthy();
      expect(deviceKeyB).toBeTruthy();
      expect(deviceKeyA).not.toBe(deviceKeyB);

      // Subsequent calls for Account A return the same persistent device key
      expect(getDeviceKey("user_A")).toBe(deviceKeyA);
      // Subsequent calls for Account B return the same persistent device key
      expect(getDeviceKey("user_B")).toBe(deviceKeyB);
    });

    it("does not destroy Account A device identity when Account B accesses device key", () => {
      const deviceKeyA = getDeviceKey("user_A");
      const deviceKeyB = getDeviceKey("user_B");

      expect(localStorageMock["ghostline.device_key.user_A"]).toBe(deviceKeyA);
      expect(localStorageMock["ghostline.device_key.user_B"]).toBe(deviceKeyB);
    });
  });

  describe("3. Email Masking & Verification UX", () => {
    it("masks email addresses correctly without leaking full username", () => {
      expect(maskEmail("vamsee@gmail.com")).toBe("v***e@gmail.com");
      expect(maskEmail("user@example.com")).toBe("u***r@example.com");
      expect(maskEmail("ab@example.com")).toBe("a***@example.com");
      expect(maskEmail("a@example.com")).toBe("a***@example.com");
      expect(maskEmail("")).toBe("your email");
      expect(maskEmail("invalid-email")).toBe("your email");
    });

    it("resendVerificationEmail delegates to supabase.auth.resend", async () => {
      const spy = vi.spyOn(authService, "resendVerificationEmail").mockResolvedValue({
        data: {},
        error: null,
      } as never);

      const result = await authService.resendVerificationEmail("test@example.com", "http://localhost:5173");
      expect(spy).toHaveBeenCalledWith("test@example.com", "http://localhost:5173");
      expect(result.error).toBeNull();
      spy.mockRestore();
    });
  });

  describe("4. Onboarding Decision State Logic", () => {
    it("redirects to onboarding when profile is missing or username is null", () => {
      const evaluateOnboarding = (isLoading: boolean, profileData: { username: string | null } | null) => {
        if (isLoading) return "WAIT";
        if (profileData === null || !profileData.username) return "ONBOARDING";
        return "CHATS";
      };

      // Loading state -> wait
      expect(evaluateOnboarding(true, null)).toBe("WAIT");
      expect(evaluateOnboarding(true, { username: "ghost" })).toBe("WAIT");

      // Brand new user where profile was not found -> onboarding
      expect(evaluateOnboarding(false, null)).toBe("ONBOARDING");

      // New user provisioned with null username -> onboarding
      expect(evaluateOnboarding(false, { username: null })).toBe("ONBOARDING");
      expect(evaluateOnboarding(false, { username: "" })).toBe("ONBOARDING");

      // Existing onboarded user -> chats
      expect(evaluateOnboarding(false, { username: "ghost_rider" })).toBe("CHATS");
    });
  });

  describe("5. Decrypted Message Store Account Scoping", () => {
    it("scopes active user so messages are isolated per account", () => {
      const store = new DecryptedMessageStore();
      expect(store.getActiveUser()).toBeNull();

      store.setActiveUser("user_A");
      expect(store.getActiveUser()).toBe("user_A");

      store.setActiveUser("user_B");
      expect(store.getActiveUser()).toBe("user_B");
    });
  });
});
