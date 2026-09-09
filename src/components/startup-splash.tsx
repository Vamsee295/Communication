import { useEffect, useState, useRef } from "react";
import { GhostMark } from "@/components/app-shell";
import { authService } from "@/lib/auth/session";

interface StartupSplashProps {
  onReady?: () => void;
}

export function StartupSplash({ onReady }: StartupSplashProps) {
  const [isMounted, setIsMounted] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const dismissedRef = useRef(false);

  useEffect(() => {
    // 1. Remove initial static HTML boot splash from DOM to prevent duplicate rendering
    const staticSplash = document.getElementById("ghostline-boot-splash");
    if (staticSplash) {
      staticSplash.remove();
    }

    const dismissSplash = () => {
      if (dismissedRef.current) return;
      dismissedRef.current = true;

      // Trigger smooth fade out
      setIsFadingOut(true);

      // Hide native Capacitor splash screen if present
      if (typeof window !== "undefined" && "Capacitor" in window) {
        const capacitor = (window as unknown as { Capacitor?: { isPluginAvailable: (name: string) => boolean; Plugins?: { SplashScreen?: { hide: () => Promise<void> } } } }).Capacitor;
        if (capacitor?.isPluginAvailable?.("SplashScreen") && capacitor.Plugins?.SplashScreen?.hide) {
          void capacitor.Plugins.SplashScreen.hide().catch(() => {});
        }
      }

      onReady?.();

      // Completely unmount after transition completes
      setTimeout(() => {
        setIsMounted(false);
      }, 380);
    };

    // 2. Check auth initialization
    let isSubscribed = true;
    const startTime = Date.now();

    authService
      .getSession()
      .then(() => {
        if (!isSubscribed) return;
        // Ensure at least a brief 120ms frame to avoid microscopic flicker
        const elapsed = Date.now() - startTime;
        const delay = Math.max(0, 120 - elapsed);
        setTimeout(dismissSplash, delay);
      })
      .catch((err) => {
        console.warn("[Ghostline] Startup auth check error:", err);
        dismissSplash();
      });

    // 3. Safety fallback timer (max 4.5 seconds) so user is never stuck
    const safetyTimer = setTimeout(() => {
      if (isSubscribed) {
        dismissSplash();
      }
    }, 4500);

    return () => {
      isSubscribed = false;
      clearTimeout(safetyTimer);
    };
  }, [onReady]);

  if (!isMounted) return null;

  return (
    <div
      id="ghostline-active-splash"
      className={`ghostline-splash-screen ${isFadingOut ? "ghostline-splash-hidden" : ""}`}
      aria-hidden="true"
    >
      <div className="ghostline-splash-container">
        <div className="ghostline-splash-badge">
          <GhostMark className="ghostline-splash-icon" />
        </div>
        <h1 className="ghostline-splash-title">Ghostline</h1>
        <p className="ghostline-splash-subtitle">Private Chats. Real Connections.</p>
        <div className="ghostline-splash-loader">
          <div className="ghostline-splash-loader-bar" />
        </div>
      </div>
    </div>
  );
}
