import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authService } from "@/lib/auth/session";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const user = await authService.getCurrentUser();
    if (!user) throw redirect({ to: "/auth" });
    return { user };
  },
  component: () => <Outlet />,
});
