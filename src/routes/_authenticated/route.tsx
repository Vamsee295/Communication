import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authService } from "@/lib/auth/session";
import { getMyProfile } from "@/lib/profile.functions";
import { validateDeviceSession } from "@/lib/devices.functions";
import { getDeviceKey } from "@/lib/device-key";
import { handleSessionRevocation } from "@/lib/auth/session-revocation";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const user = await authService.getCurrentUser();
    if (!user) throw redirect({ to: "/auth" });

    // Validate device session against authoritative database state
    try {
      const deviceKey = getDeviceKey(user.id);
      const validation = await validateDeviceSession({ data: { device_key: deviceKey } });
      if (validation && !validation.valid && validation.reason === "revoked") {
        await handleSessionRevocation("Your Ghostline session was signed out from another device.");
        throw redirect({ to: "/auth" });
      }
    } catch (err: unknown) {
      if ((err as { isRedirect?: boolean })?.isRedirect) throw err;
      const msg = (err as Error)?.message || "";
      if (msg.includes("revoked") || msg.includes("Unauthorized")) {
        await handleSessionRevocation("Your Ghostline session was signed out from another device.");
        throw redirect({ to: "/auth" });
      }
    }
    
    // Check if the user has a completed profile (username)
    const profile = await getMyProfile();
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
