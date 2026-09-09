import { describe, expect, it, beforeEach, vi } from "vitest";
import { getDeviceKey, rotateDeviceKey, clearDeviceKey } from "@/lib/device-key";
import { handleSessionRevocation, popRevocationReason, REVOCATION_STORAGE_KEY } from "@/lib/auth/session-revocation";
import { authService } from "@/lib/auth/session";

describe("Ghostline Device Sign-out & Fresh Login Verification", () => {
  let localStorageStore: Record<string, string> = {};
  let sessionStorageStore: Record<string, string> = {};

  beforeEach(() => {
    localStorageStore = {};
    sessionStorageStore = {};

    vi.stubGlobal("localStorage", {
      getItem: (k: string) => localStorageStore[k] ?? null,
      setItem: (k: string, v: string) => {
        localStorageStore[k] = v;
      },
      removeItem: (k: string) => {
        delete localStorageStore[k];
      },
      clear: () => {
        localStorageStore = {};
      },
      key: (i: number) => Object.keys(localStorageStore)[i] ?? null,
      get length() {
        return Object.keys(localStorageStore).length;
      },
    });

    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => sessionStorageStore[k] ?? null,
      setItem: (k: string, v: string) => {
        sessionStorageStore[k] = v;
      },
      removeItem: (k: string) => {
        delete sessionStorageStore[k];
      },
      clear: () => {
        sessionStorageStore = {};
      },
    });

    vi.stubGlobal("window", {
      location: {
        replace: vi.fn(),
      },
    });
  });

  it("CASE 1: User signs out current device -> generates fresh device key and allows immediate login", async () => {
    const userId = "user-123";
    const initialDeviceKey = getDeviceKey(userId);
    expect(initialDeviceKey).toBeTruthy();

    // User signs out (calling rotateDeviceKey)
    rotateDeviceKey();

    // All previous keys are purged
    expect(localStorageStore[`ghostline.device_key.${userId}`]).toBeUndefined();

    // When logging back in with correct password
    const newDeviceKey = getDeviceKey(userId);
    expect(newDeviceKey).toBeTruthy();
    expect(newDeviceKey).not.toBe(initialDeviceKey);
  });

  it("CASE 2: Remote device revocation -> sets user-friendly notice and rotates device key", async () => {
    vi.spyOn(authService, "signOut").mockResolvedValue({ error: null });

    const userId = "user-123";
    const oldKey = getDeviceKey(userId);
    expect(oldKey).toBeTruthy();

    // Session is revoked remotely
    await handleSessionRevocation();

    // Pop revocation reason for toast
    const reason = popRevocationReason();
    expect(reason).toBe("Your session was signed out from another device.");
    expect(sessionStorageStore[REVOCATION_STORAGE_KEY]).toBeUndefined();

    // On fresh login, new key is generated
    const newKey = getDeviceKey(userId);
    expect(newKey).not.toBe(oldKey);
  });

  it("CASE 3: Pop revocation reason is single-use and does not linger to block future logins", () => {
    sessionStorageStore[REVOCATION_STORAGE_KEY] = "Your session was signed out from another device.";

    const firstRead = popRevocationReason();
    expect(firstRead).toBe("Your session was signed out from another device.");

    const secondRead = popRevocationReason();
    expect(secondRead).toBeNull();
  });
});
