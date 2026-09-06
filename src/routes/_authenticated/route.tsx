import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authService } from "@/lib/auth/session";
import { getMyProfile } from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const user = await authService.getCurrentUser();
    if (!user) throw redirect({ to: "/auth" });
    
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
