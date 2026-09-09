import { describe, expect, it, beforeEach, vi } from "vitest";
import { authService, resetPasswordForEmail, updateUserPassword } from "@/lib/auth/session";
import { supabase } from "@/integrations/supabase/client";
import { rotateDeviceKey, getDeviceKey } from "@/lib/device-key";
import { clearRevocationReason, popRevocationReason } from "@/lib/auth/session-revocation";

describe("Ghostline Password Recovery / Forgot Password Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Password Reset Request (resetPasswordForEmail)", () => {
    it("delegates password recovery request to supabase.auth.resetPasswordForEmail", async () => {
      const resetSpy = vi.spyOn(supabase.auth, "resetPasswordForEmail").mockResolvedValue({
        data: {},
        error: null,
      } as never);

      const email = "user@ghostline.app";
      const redirectTo = "https://ghostline.app/reset-password";

      const res = await resetPasswordForEmail(email, redirectTo);

      expect(resetSpy).toHaveBeenCalledWith(email, { redirectTo });
      expect(res.error).toBeNull();
    });

    it("authService includes resetPasswordForEmail method", () => {
      expect(typeof authService.resetPasswordForEmail).toBe("function");
    });
  });

  describe("2. Password Update (updateUserPassword)", () => {
    it("delegates password update to supabase.auth.updateUser", async () => {
      const updateSpy = vi.spyOn(supabase.auth, "updateUser").mockResolvedValue({
        data: { user: { id: "test-user-id" } },
        error: null,
      } as never);

      const newPassword = "SuperSecretNewPassword123!";
      const res = await updateUserPassword(newPassword);

      expect(updateSpy).toHaveBeenCalledWith({ password: newPassword });
      expect(res.error).toBeNull();
    });

    it("authService includes updateUserPassword method", () => {
      expect(typeof authService.updateUserPassword).toBe("function");
    });
  });

  describe("3. Security & Device Key Rotation", () => {
    it("rotates device key after password reset so fresh login registers cleanly", () => {
      let storage: Record<string, string> = {};
      vi.stubGlobal("window", {});
      vi.stubGlobal("localStorage", {
        getItem: (k: string) => storage[k] ?? null,
        setItem: (k: string, v: string) => {
          storage[k] = v;
        },
        removeItem: (k: string) => {
          delete storage[k];
        },
        clear: () => {
          storage = {};
        },
        key: (i: number) => Object.keys(storage)[i] ?? null,
        get length() {
          return Object.keys(storage).length;
        },
      });

      const userId = "test-user-uuid";
      const oldKey = getDeviceKey(userId);
      expect(oldKey).toBeTruthy();

      // Upon successful password reset
      rotateDeviceKey();

      const newKey = getDeviceKey(userId);
      expect(newKey).toBeTruthy();
      expect(newKey).not.toBe(oldKey);
    });

    it("isolates password recovery flow from any stale device logout notice", () => {
      let sessionStorageStore: Record<string, string> = {
        "ghostline.logout_reason": "Your session was signed out from another device.",
      };

      vi.stubGlobal("sessionStorage", {
        getItem: (k: string) => sessionStorageStore[k] ?? null,
        setItem: (k: string, v: string) => {
          sessionStorageStore[k] = v;
        },
        removeItem: (k: string) => {
          delete sessionStorageStore[k];
        },
      });

      // When entering /forgot-password or submitting
      clearRevocationReason();

      expect(sessionStorageStore["ghostline.logout_reason"]).toBeUndefined();
      expect(popRevocationReason()).toBeNull();
    });
  });
});
