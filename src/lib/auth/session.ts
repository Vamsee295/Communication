import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import type { AuthUser } from "@/lib/domain/types";

export async function getCurrentUser(): Promise<AuthUser | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export async function getSession() {
  return supabase.auth.getSession();
}

export type AuthChangeCallback = (
  event: AuthChangeEvent,
  session: Session | null,
) => void | Promise<void>;

export function onAuthStateChange(callback: AuthChangeCallback) {
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
  return supabase.auth.signOut();
}

export async function signInWithGoogle(redirectUri: string) {
  return lovable.auth.signInWithOAuth("google", { redirect_uri: redirectUri });
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
};
