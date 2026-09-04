import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Ghost, Video, Lock, Sparkles } from "lucide-react";
import { authService } from "@/lib/auth/session";

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
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-20 h-80 w-80 rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute top-1/2 -right-20 h-96 w-96 rounded-full bg-accent/30 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pt-16 pb-10">
        <div className="flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground glow-primary">
            <Ghost className="h-5 w-5" />
          </div>
          <span className="text-lg font-black tracking-tight">Ghostline</span>
        </div>

        <div className="mt-16 flex-1">
          <h1 className="text-5xl font-black leading-[1.05] tracking-tight">
            Private by default.<br />
            <span className="text-primary">Loud when it matters.</span>
          </h1>
          <p className="mt-6 text-base text-muted-foreground">
            Fast messaging with peer-to-peer voice and video calls. Nothing recorded, nothing sold.
          </p>

          <div className="mt-10 grid gap-3">
            <FeatureRow icon={<Lock className="h-4 w-4" />} label="Encrypted in transit, private by policy" />
            <FeatureRow icon={<Video className="h-4 w-4" />} label="Peer-to-peer voice & video calls" />
            <FeatureRow icon={<Sparkles className="h-4 w-4" />} label="Reactions, replies, pins & stars" />
          </div>
        </div>

        <div className="mt-10 grid gap-3">
          <Link
            to="/auth"
            className="inline-flex h-14 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground glow-primary transition active:scale-95"
          >
            Get started
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signin" } as never}
            className="inline-flex h-14 items-center justify-center rounded-full border border-border text-base font-semibold transition active:scale-95"
          >
            I already have an account
          </Link>
        </div>
      </div>
    </main>
  );
}

function FeatureRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
      <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-primary">
        {icon}
      </div>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
