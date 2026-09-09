import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authService } from "@/lib/auth/session";
import { getMyProfile } from "@/lib/profile.functions";
import { validateDeviceSession } from "@/lib/devices.functions";
import { getDeviceKey } from "@/lib/device-key";
import { handleSessionRevocation } from "@/lib/auth/session-revocation";

let cachedUser: { id: string; email: string | null } | null = null;
let cachedProfile: { id: string; username?: string | null } | null = null;
let lastValidationTime = 0;
const VALIDATION_THROTTLE_MS = 30_000;

// Reset cache on logout
if (typeof window !== "undefined") {
  authService.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      cachedUser = null;
      cachedProfile = null;
      lastValidationTime = 0;
    }
  });
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // 1. Fast local session verification
    const { data: { session } } = await authService.getSession();
    if (!session?.user) {
      cachedUser = null;
      cachedProfile = null;
      throw redirect({ to: "/auth" });
    }

    const user = cachedUser && cachedUser.id === session.user.id
      ? cachedUser
      : { id: session.user.id, email: session.user.email ?? null };
    cachedUser = user;

    // 2. Throttled background device validation (non-blocking for UI transitions)
    const now = Date.now();
    if (now - lastValidationTime > VALIDATION_THROTTLE_MS) {
      lastValidationTime = now;
      const deviceKey = getDeviceKey(user.id);
      void validateDeviceSession({ data: { device_key: deviceKey } })
        .then(async (validation) => {
          if (validation && !validation.valid && validation.reason === "revoked") {
            await handleSessionRevocation();
          }
        })
        .catch(() => {});
    }

    // 3. Fast cached profile check
    let profile = cachedProfile;
    if (!profile || profile.id !== user.id) {
      profile = await getMyProfile();
      if (profile) {
        cachedProfile = profile;
      }
    }

    const hasUsername = !!profile?.username;

    // Redirect to onboarding if they don't have a username and aren't already there
    if (!hasUsername && location.pathname !== "/onboarding") {
      throw redirect({ to: "/onboarding" });
    }

    // If they have a username but try to access onboarding, send them away
    if (hasUsername && location.pathname === "/onboarding") {
      throw redirect({ to: "/chats" });
    }

    return { user, profile };
  },
  component: () => <Outlet />,
});
