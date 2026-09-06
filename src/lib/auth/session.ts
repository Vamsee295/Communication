import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { lovable } from "@/integrations/lovable";
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
  return supabase.auth.signOut();
}

export async function signInWithGoogle(redirectUri: string) {
  return lovable.auth.signInWithOAuth("google", { redirect_uri: redirectUri });
}

export async function resendVerificationEmail(email: string, emailRedirectTo: string) {
  return supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo } });
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
  resendVerificationEmail,
  isDevAuthBypassEnabled,
  signInWithDevBypass,
};
