import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { authService } from "@/lib/auth/session";
import { getDeviceKey } from "@/lib/device-key";
import { validateDeviceSession } from "@/lib/devices.functions";
import { handleSessionRevocation, DEFAULT_REVOCATION_REASON } from "@/lib/auth/session-revocation";
import type { SessionRevokedPayload } from "@/lib/realtime/security-events";

/**
 * Global Device Security Provider.
 * Enforces real-time cross-browser session revocation and periodic fallback validation.
 */
export function DeviceSecurityProvider({ children }: { children: React.ReactNode }) {
  const validateSessionFn = useServerFn(validateDeviceSession);
  const validateRef = useRef(validateSessionFn);
  validateRef.current = validateSessionFn;

  useEffect(() => {
    let activeChannel: ReturnType<typeof supabase.channel> | null = null;
    let isCancelled = false;
    let validationTimer: NodeJS.Timeout | null = null;

    const performValidation = async (userId: string) => {
      if (isCancelled) return;
      try {
        const deviceKey = getDeviceKey(userId);
        const res = await validateRef.current({ data: { device_key: deviceKey } });
        if (res && !res.valid && res.reason === "revoked") {
          console.warn("[Security] Device revocation detected via fallback validation.");
          await handleSessionRevocation(DEFAULT_REVOCATION_REASON);
        }
      } catch (err: unknown) {
        // Network, server, or unauthenticated errors must not trigger device revocation
        console.warn("[Security] Device validation check skipped:", err);
      }
    };

    const setupListener = async () => {
      const user = await authService.getCurrentUser();
      if (!user?.id || isCancelled) return;

      const userId = user.id;
      const deviceKey = getDeviceKey(userId);

      // Fast Path: Listen for Realtime security events
      activeChannel = supabase.channel(`security:user:${userId}`, {
        config: { broadcast: { self: false } },
      });

      activeChannel.on(
        "broadcast",
        { event: "session_revoked" },
        async ({ payload }: { payload: SessionRevokedPayload }) => {
          if (!payload) return;
          const targetKey = payload.deviceKey;
          const myKey = getDeviceKey(userId);

          if (targetKey && targetKey === myKey) {
            console.warn("[Security] Remote session revocation received via Realtime.");
            await handleSessionRevocation(DEFAULT_REVOCATION_REASON);
          }
        },
      );

      activeChannel.subscribe();

      // Fallback 1: Visibility change check
      const handleVisibility = () => {
        if (document.visibilityState === "visible") {
          void performValidation(userId);
        }
      };
      document.addEventListener("visibilitychange", handleVisibility);

      // Fallback 2: Online reconnect check
      const handleOnline = () => {
        void performValidation(userId);
      };
      window.addEventListener("online", handleOnline);

      // Fallback 3: Periodic session heartbeat (every 35s)
      validationTimer = setInterval(() => {
        void performValidation(userId);
      }, 35_000);

      return () => {
        document.removeEventListener("visibilitychange", handleVisibility);
        window.removeEventListener("online", handleOnline);
        if (validationTimer) clearInterval(validationTimer);
      };
    };

    let cleanupListeners: (() => void) | undefined;
    void setupListener().then((cleanup) => {
      cleanupListeners = cleanup;
    });

    // Also listen for auth state changes (SIGNED_OUT)
    const { data: sub } = authService.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        void setupListener();
      } else if (event === "SIGNED_OUT") {
        if (activeChannel) {
          void supabase.removeChannel(activeChannel);
          activeChannel = null;
        }
      }
    });

    return () => {
      isCancelled = true;
      if (cleanupListeners) cleanupListeners();
      if (validationTimer) clearInterval(validationTimer);
      if (activeChannel) void supabase.removeChannel(activeChannel);
      sub.subscription.unsubscribe();
    };
  }, []);

  return <>{children}</>;
}
