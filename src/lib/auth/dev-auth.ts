import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { AuthUser } from "@/lib/domain/types";

/**
 * Deterministic Development User Identity
 * UUID format so Neon / PostgreSQL schema UUID constraints pass without error.
 */
export const DEV_USER: AuthUser = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "dev@ghostline.local",
};

export const DEV_USER_PROFILE = {
  id: DEV_USER.id,
  username: "devghost",
  display_name: "Ghostline Developer",
  bio: "Development identity for local verification",
  avatar_url: null,
};

export const DEV_DEVICE_KEY = "dev-device-ghostline";
export const DEV_AUTH_STORAGE_KEY = "ghostline.dev_auth_active";
export const DEV_AUTH_HEADER_PREFIX = "DEV_BYPASS_TOKEN_";

/**
 * Check if Development Auth Bypass is enabled.
 * Production Safety Guard: Fails closed in production.
 */
export function isDevAuthBypassEnabled(): boolean {
  const isEnvEnabled =
    import.meta.env.VITE_DEV_AUTH_BYPASS === "true" ||
    (typeof process !== "undefined" && process.env?.VITE_DEV_AUTH_BYPASS === "true");

  if (isEnvEnabled) {
    if (import.meta.env.PROD || (typeof process !== "undefined" && process.env?.NODE_ENV === "production")) {
      throw new Error("SECURITY FAULT: Development auth bypass cannot run in production environment");
    }
    return true;
  }
  return false;
}

/**
 * Check if the active session in browser is in Dev Auth mode.
 */
export function isDevAuthActive(): boolean {
  if (!isDevAuthBypassEnabled()) return false;
  if (typeof window === "undefined" || !window.localStorage) return false;
  return window.localStorage.getItem(DEV_AUTH_STORAGE_KEY) === "true";
}

export function setDevAuthActive(active: boolean): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  if (active) {
    window.localStorage.setItem(DEV_AUTH_STORAGE_KEY, "true");
  } else {
    window.localStorage.removeItem(DEV_AUTH_STORAGE_KEY);
  }
}

/**
 * Creates a mock session object for the development user.
 */
export function getDevSession(): Session {
  return {
    access_token: `${DEV_AUTH_HEADER_PREFIX}${DEV_USER.id}`,
    token_type: "bearer",
    expires_in: 3600 * 24 * 365,
    expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
    refresh_token: "dev-refresh-token",
    user: {
      id: DEV_USER.id,
      app_metadata: { provider: "dev_bypass" },
      user_metadata: { name: DEV_USER_PROFILE.display_name },
      aud: "authenticated",
      created_at: new Date().toISOString(),
      email: DEV_USER.email ?? undefined,
    },
  };
}

let devAuthListeners: ((event: AuthChangeEvent, session: Session | null) => void)[] = [];

export function notifyDevAuthChange(event: AuthChangeEvent, session: Session | null) {
  devAuthListeners.forEach((cb) => {
    try {
      cb(event, session);
    } catch (e) {
      console.warn("Dev auth listener failed", e);
    }
  });
}

export function onDevAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void | Promise<void>,
) {
  devAuthListeners.push(callback);
  return {
    data: {
      subscription: {
        unsubscribe: () => {
          devAuthListeners = devAuthListeners.filter((cb) => cb !== callback);
        },
      },
    },
  };
}
