// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";
import { authService, changePassword } from "@/lib/auth/session";
import { supabase } from "@/integrations/supabase/client";

describe("Change Password Flow with Supabase Auth Verification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("exports changePassword on authService and standalone", () => {
    expect(typeof authService.changePassword).toBe("function");
    expect(typeof changePassword).toBe("function");
  });

  it("fails if no active session is found", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const result = await changePassword("oldPassword123", "newPassword123");
    expect(result.error).toBeTruthy();
    expect(result.error?.message).toContain("No active authenticated session");
  });

  it("rejects when the current password is incorrect (signInWithPassword fails)", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: {
        session: {
          user: { id: "user-123", email: "alice@ghostline.app" },
        },
      },
      error: null,
    });

    const signInSpy = vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials", status: 400 },
    });

    const updateUserSpy = vi.spyOn(supabase.auth, "updateUser");

    const result = await changePassword("wrongCurrentPassword", "newValidPassword123");

    expect(signInSpy).toHaveBeenCalledWith({
      email: "alice@ghostline.app",
      password: "wrongCurrentPassword",
    });
    expect(result.error).toBeTruthy();
    expect(result.error?.message).toBe("Current password is incorrect.");
    // updateUser MUST NOT be called if current password verification fails
    expect(updateUserSpy).not.toHaveBeenCalled();
  });

  it("updates password in Supabase Auth when current password verifies successfully", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: {
        session: {
          user: { id: "user-123", email: "alice@ghostline.app" },
        },
      },
      error: null,
    });

    const signInSpy = vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
      data: {
        user: { id: "user-123", email: "alice@ghostline.app" },
        session: { access_token: "tok123" },
      },
      error: null,
    });

    const updateUserSpy = vi.spyOn(supabase.auth, "updateUser").mockResolvedValue({
      data: {
        user: { id: "user-123", email: "alice@ghostline.app" },
      },
      error: null,
    });

    const result = await changePassword("correctOldPassword123", "brandNewPassword456");

    expect(signInSpy).toHaveBeenCalledWith({
      email: "alice@ghostline.app",
      password: "correctOldPassword123",
    });
    expect(updateUserSpy).toHaveBeenCalledWith({
      password: "brandNewPassword456",
    });
    expect(result.error).toBeNull();
    expect(result.data?.user?.id).toBe("user-123");
  });

  it("handles Supabase updateUser error safely without leaking secrets", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: {
        session: {
          user: { id: "user-123", email: "alice@ghostline.app" },
        },
      },
      error: null,
    });

    vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
      data: { user: { id: "user-123" }, session: {} },
      error: null,
    });

    vi.spyOn(supabase.auth, "updateUser").mockResolvedValue({
      data: { user: null },
      error: { message: "Password should be at least 8 characters", status: 422 },
    });

    const result = await changePassword("correctOldPassword123", "weak");

    expect(result.error).toBeTruthy();
    expect(result.error?.message).toBe("Password should be at least 8 characters");
  });
});
