// @ts-nocheck
import { describe, it, expect, vi } from "vitest";
import {
  GENERIC_SIGNUP_ERROR_TITLE,
  GENERIC_SIGNUP_ERROR_MESSAGE,
  getSignupErrorMessage,
  isDuplicateUserSignup,
  getSigninErrorMessage,
} from "@/lib/auth/auth-error";

describe("Ghostline Signup Enumeration Protection & Error Sanitization", () => {
  describe("1. Signup Error Sanitization", () => {
    it("maps duplicate email error 'User already registered' to the generic signup failure message", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("User already registered");

      const result = getSignupErrorMessage(error);

      expect(result.title).toBe("Something went wrong");
      expect(result.message).toBe("We couldn't create your account. Please check your details and try again.");
      expect(result.message).not.toContain("already registered");
      expect(result.message).not.toContain("already exists");
      expect(consoleErrorSpy).toHaveBeenCalledWith("[auth signup failure]", error);
      consoleErrorSpy.mockRestore();
    });

    it("maps provider-specific errors like 'user_already_exists' to the generic message", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = { message: "user_already_exists", status: 400, code: "user_already_exists" };

      const result = getSignupErrorMessage(error);

      expect(result.title).toBe(GENERIC_SIGNUP_ERROR_TITLE);
      expect(result.message).toBe(GENERIC_SIGNUP_ERROR_MESSAGE);
      expect(result.message).not.toContain("user_already_exists");
      consoleErrorSpy.mockRestore();
    });

    it("maps database errors to the generic message without leaking internals", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const dbError = new Error("duplicate key value violates unique constraint auth_users_email_key");

      const result = getSignupErrorMessage(dbError);

      expect(result.title).toBe(GENERIC_SIGNUP_ERROR_TITLE);
      expect(result.message).toBe(GENERIC_SIGNUP_ERROR_MESSAGE);
      expect(result.message).not.toContain("violates unique constraint");
      expect(result.message).not.toContain("auth_users");
      consoleErrorSpy.mockRestore();
    });

    it("maps network/connection errors to connection check message", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const networkError = new TypeError("Failed to fetch");

      const result = getSignupErrorMessage(networkError);

      expect(result.title).toBe("Something went wrong");
      expect(result.message).toBe("Please check your connection and try again.");
      consoleErrorSpy.mockRestore();
    });
  });

  describe("2. Empty Identities Detection (Supabase Prevent Email Enumeration)", () => {
    it("detects an existing user when Supabase returns an empty identities array", () => {
      const duplicateResponse = {
        user: {
          id: "11111111-1111-1111-1111-111111111111",
          email: "existing@ghostline.test",
          identities: [],
        },
      };

      expect(isDuplicateUserSignup(duplicateResponse)).toBe(true);
    });

    it("identifies a genuine new user when identities array is non-empty", () => {
      const newResponse = {
        user: {
          id: "22222222-2222-2222-2222-222222222222",
          email: "fresh@ghostline.test",
          identities: [{ identity_id: "id-123" }],
        },
      };

      expect(isDuplicateUserSignup(newResponse)).toBe(false);
    });

    it("returns false when user is null or undefined", () => {
      expect(isDuplicateUserSignup(null)).toBe(false);
      expect(isDuplicateUserSignup(undefined)).toBe(false);
      expect(isDuplicateUserSignup({ user: null })).toBe(false);
    });
  });

  describe("3. Sign-in Error Sanitization", () => {
    it("maps invalid credential errors to 'Wrong email or password'", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(getSigninErrorMessage(new Error("Invalid login credentials"))).toBe("Wrong email or password");
      expect(getSigninErrorMessage(new Error("invalid_grant"))).toBe("Wrong email or password");
      expect(getSigninErrorMessage(new Error("Invalid email or password"))).toBe("Wrong email or password");

      consoleErrorSpy.mockRestore();
    });

    it("maps internal/provider errors to a safe fallback without leaking database dumps", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("Database connection refused at 5432");

      const result = getSigninErrorMessage(error);

      expect(result).toBe("Sign in failed. Please check your credentials.");
      expect(result).not.toContain("Database");
      expect(result).not.toContain("5432");

      consoleErrorSpy.mockRestore();
    });
  });
});
