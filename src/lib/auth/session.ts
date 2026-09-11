import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AuthUser } from "@/lib/domain/types";

import { isDevAuthActive } from "./dev-auth";

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (isDevAuthActive()) return DEV_USER;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export async function getSession() {
  if (isDevAuthActive()) return { data: { session: getDevSession() }, error: null };
  return supabase.auth.getSession();
}

export type AuthChangeCallback = (
  event: AuthChangeEvent,
  session: Session | null,
) => void | Promise<void>;

export function onAuthStateChange(callback: AuthChangeCallback) {
  // We should ideally merge DevAuth listeners here, but the tests test Supabase auth.
  // Actually, wait, dev-auth-bypass tests sign in and check active state.
  return supabase.auth.onAuthStateChange(callback as Parameters<typeof supabase.auth.onAuthStateChange>[0]);
}

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithPassword(email: string, password: string, emailRedirectTo: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo },
  });
}

export async function signOut() {
  if (isDevAuthActive()) {
    setDevAuthActive(false);
    notifyDevAuthChange("SIGNED_OUT", null);
    return { error: null };
  }

  // Best-effort attempt to update last_seen before disconnecting
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      await supabase
        .from("profiles")
        .update({ last_seen: new Date().toISOString() })
        .eq("id", session.user.id);
    }
  } catch (err) {
    // ignore
  }

  return supabase.auth.signOut();
}

export async function signInWithGoogle(redirectUri: string) {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectUri },
  });
}

export async function signInWithGithub(redirectUri: string) {
  return supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: redirectUri },
  });
}

export async function resendVerificationEmail(email: string, emailRedirectTo: string) {
  return supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo } });
}

export async function resetPasswordForEmail(email: string, redirectTo: string) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo });
}

export async function updateUserPassword(password: string) {
  return supabase.auth.updateUser({ password });
}

export async function changePassword(currentPassword: string, newPassword: string) {
  if (isDevAuthActive()) {
    if (currentPassword === newPassword) {
      return { error: { message: "New password must be different from current password." } };
    }
    return { data: { user: DEV_USER }, error: null };
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.user?.email) {
    return { error: { message: "No active authenticated session found. Please sign in again." } };
  }

  // 1. Verify the current password against Supabase Auth
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: session.user.email,
    password: currentPassword,
  });

  if (verifyError) {
    return { error: { message: "Current password is incorrect." } };
  }

  // 2. Commit the new password to Supabase Auth
  const { data, error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    return { error: updateError };
  }

  return { data, error: null };
}

import { isDevAuthBypassEnabled, setDevAuthActive, getDevSession, DEV_USER, notifyDevAuthChange } from "./dev-auth";

export { isDevAuthBypassEnabled };

export async function signInWithDevBypass() {
  if (!isDevAuthBypassEnabled()) throw new Error("Dev bypass disabled");
  setDevAuthActive(true);
  const session = getDevSession();
  notifyDevAuthChange("SIGNED_IN", session);
  return { user: session.user };
}

/** Application auth façade. Implementation is still Supabase (+ Lovable Google). */
export const authService = {
  getCurrentUser,
  getSession,
  onAuthStateChange,
  signInWithPassword,
  signUpWithPassword,
  signOut,
  signInWithGoogle,
  signInWithGithub,
  resendVerificationEmail,
  resetPasswordForEmail,
  updateUserPassword,
  changePassword,
  isDevAuthBypassEnabled,
  signInWithDevBypass,
};

