import { authService } from "@/lib/auth/session";
import { rotateDeviceKey } from "@/lib/device-key";

let isRevoking = false;

export const REVOCATION_STORAGE_KEY = "ghostline.logout_reason";
export const DEFAULT_REVOCATION_REASON = "Your Ghostline session was signed out from another device.";

/**
 * Authoritatively handles remote or local session revocation:
 * 1. Sets the revocation notice in sessionStorage for display on /auth.
 * 2. Rotates the local device key so new logins start with a clean state.
 * 3. Tears down the Supabase auth session.
 * 4. Redirects the browser to /auth.
 */
export async function handleSessionRevocation(reason: string = DEFAULT_REVOCATION_REASON): Promise<void> {
  if (isRevoking) return;
  isRevoking = true;

  try {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(REVOCATION_STORAGE_KEY, reason);
      // Generate a fresh device key so a future login on this browser is an active, clean device
      rotateDeviceKey();
    }

    // Terminate Supabase authentication session
    await authService.signOut().catch(() => {});
  } finally {
    if (typeof window !== "undefined") {
      // Force navigation to /auth
      window.location.replace("/auth");
    }
  }
}

/**
 * Checks and clears any pending revocation notice from sessionStorage.
 */
export function popRevocationReason(): string | null {
  if (typeof window === "undefined") return null;
  const reason = sessionStorage.getItem(REVOCATION_STORAGE_KEY);
  if (reason) {
    sessionStorage.removeItem(REVOCATION_STORAGE_KEY);
  }
  return reason;
}
