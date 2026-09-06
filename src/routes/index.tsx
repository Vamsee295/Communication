import { createFileRoute, redirect } from "@tanstack/react-router";
import { authService } from "@/lib/auth/session";

import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingWhy } from "@/components/landing/landing-why";
import { LandingFeatures } from "@/components/landing/landing-features";
import { LandingShowcases } from "@/components/landing/landing-showcases";
import { LandingHowItWorks } from "@/components/landing/landing-how-it-works";
import { LandingPrivacy } from "@/components/landing/landing-privacy";
import { LandingCta } from "@/components/landing/landing-cta";
import { LandingFooter } from "@/components/landing/landing-footer";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await authService.getSession();
    if (data.session) throw redirect({ to: "/chats" });
  },
  component: Landing,
});

function Landing() {
  return (
    <main className="relative min-h-screen bg-background font-sans selection:bg-primary/20">
      <LandingNavbar />
      <LandingHero />
      <LandingWhy />
      <LandingFeatures />
      <LandingShowcases />
      <LandingHowItWorks />
      <LandingPrivacy />
      <LandingCta />
      <LandingFooter />
    </main>
  );
}
