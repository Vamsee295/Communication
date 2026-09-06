import { describe, it, expect, vi } from "vitest";
import {
  isDuplicateUserSignup,
  getSignupErrorMessage,
  DUPLICATE_SIGNUP_ERROR,
  NETWORK_SIGNUP_ERROR,
} from "@/lib/auth/auth-error";

describe("Ghostline Signup Flow Result Contracts", () => {
  describe("Case 1: Genuine New Account (with active session)", () => {
    it("identifies valid user with session and non-empty identities", () => {
      const response = {
        data: {
          user: {
            id: "usr_123",
            email: "newuser@example.com",
            identities: [{ id: "identity_1", provider: "email" }],
          },
          session: {
            access_token: "jwt_token",
            refresh_token: "refresh_token",
          },
        },
        error: null,
      };

      const isError = Boolean(response.error);
      const isDuplicate = !response.data?.user || isDuplicateUserSignup(response.data);
      const needsVerification = !response.data?.session;

      expect(isError).toBe(false);
      expect(isDuplicate).toBe(false);
      expect(needsVerification).toBe(false);
    });
  });

  describe("Case 2: Existing Account Details (Prevent Email Enumeration)", () => {
    it("detects duplicate user when Supabase returns empty identities array with no error", () => {
      // Supabase with Prevent Email Enumeration enabled returns data.user with identities: []
      const response = {
        data: {
          user: {
            id: "existing_usr_id",
            email: "existing@example.com",
            identities: [], // Empty identities signals existing account
          },
          session: null,
        },
        error: null,
      };

      const isError = Boolean(response.error);
      const isDuplicate = !response.data?.user || isDuplicateUserSignup(response.data);

      expect(isError).toBe(false);
      expect(isDuplicate).toBe(true);
      // Ensure duplicate attempt maps to generic neutral error
      expect(DUPLICATE_SIGNUP_ERROR.title).toBe("Something went wrong");
      expect(DUPLICATE_SIGNUP_ERROR.message).toBe("Please verify your details and try again.");
    });

    it("detects failure if data.user is missing or null even if error is null", () => {
      const response = {
        data: {
          user: null,
          session: null,
        },
        error: null,
      };

      const isDuplicate = !response.data?.user || isDuplicateUserSignup(response.data);
      expect(isDuplicate).toBe(true);
    });

    it("sanitizes error if Supabase enumeration prevention is disabled and returns raw error", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const response = {
        data: { user: null, session: null },
        error: new Error("User already registered"),
      };

      const errInfo = getSignupErrorMessage(response.error);
      expect(errInfo.title).toBe("Something went wrong");
      expect(errInfo.message).not.toContain("already registered");
      spy.mockRestore();
    });
  });

  describe("Case 3 & 4 & 5: Client-side Validation Rules", () => {
    const validateClientInput = (
      email: string,
      pass: string,
      confirmPass: string,
      mode: "signin" | "signup",
    ): { valid: boolean; error?: string } => {
      const trimmed = email.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!trimmed || !emailRegex.test(trimmed)) {
        return { valid: false, error: "Enter a valid email address." };
      }
      if (!pass || pass.length < 8) {
        return { valid: false, error: "Password does not meet the required requirements." };
      }
      if (mode === "signup" && pass !== confirmPass) {
        return { valid: false, error: "Passwords do not match." };
      }
      return { valid: true };
    };

    it("Case 3: rejects invalid emails with specific friendly message", () => {
      expect(validateClientInput("not-an-email", "password123", "password123", "signup")).toEqual({
        valid: false,
        error: "Enter a valid email address.",
      });
      expect(validateClientInput("", "password123", "password123", "signup")).toEqual({
        valid: false,
        error: "Enter a valid email address.",
      });
    });

    it("Case 4: rejects mismatched passwords on signup", () => {
      expect(validateClientInput("user@ghostline.test", "password123", "password999", "signup")).toEqual({
        valid: false,
        error: "Passwords do not match.",
      });
    });

    it("Case 5: rejects weak/short passwords (<8 chars)", () => {
      expect(validateClientInput("user@ghostline.test", "short", "short", "signup")).toEqual({
        valid: false,
        error: "Password does not meet the required requirements.",
      });
    });

    it("accepts valid credentials with matching confirmation", () => {
      expect(validateClientInput("user@ghostline.test", "securepassword123", "securepassword123", "signup")).toEqual({
        valid: true,
      });
    });
  });

  describe("Case 6: Network Failure", () => {
    it("maps fetch/network errors to connection message", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const netErr = new TypeError("Failed to fetch");
      const result = getSignupErrorMessage(netErr);

      expect(result).toEqual(NETWORK_SIGNUP_ERROR);
      expect(result.title).toBe("Something went wrong");
      expect(result.message).toBe("Please check your connection and try again.");
      spy.mockRestore();
    });
  });

  describe("Case 7: Unexpected Supabase Error", () => {
    it("sanitizes unexpected technical error strings and never leaks stack or DB details", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const rawError = new Error("PGRST301: JWT expired or Neon connection dropped at line 42");
      const result = getSignupErrorMessage(rawError);

      expect(result.title).toBe("Something went wrong");
      expect(result.message).not.toContain("PGRST");
      expect(result.message).not.toContain("Neon");
      expect(result.message).not.toContain("line 42");
      spy.mockRestore();
    });
  });

  describe("Case 8: Email Verification Required", () => {
    it("identifies when genuine account is created but email verification is pending (no session)", () => {
      const response = {
        data: {
          user: {
            id: "usr_456",
            email: "unverified@example.com",
            identities: [{ id: "identity_2", provider: "email" }],
          },
          session: null, // No session yet = email confirmation required
        },
        error: null,
      };

      const isError = Boolean(response.error);
      const isDuplicate = !response.data?.user || isDuplicateUserSignup(response.data);
      const requiresEmailVerification = !response.data?.session;

      expect(isError).toBe(false);
      expect(isDuplicate).toBe(false);
      expect(requiresEmailVerification).toBe(true);
    });
  });
});
