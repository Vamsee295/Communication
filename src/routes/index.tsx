import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Lock, Video, Sparkles, ShieldCheck } from "lucide-react";
import { authService } from "@/lib/auth/session";
import { GhostMark } from "@/components/app-shell";

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
    <main className="relative min-h-screen overflow-hidden bg-background">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-[400px] w-[400px] rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute bottom-0 -left-40 h-[400px] w-[400px] rounded-full bg-primary/6 blur-3xl" />
      </div>

      {/* Nav */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-md shadow-primary/30">
            <GhostMark className="h-5 w-5" />
          </div>
          <span className="text-[17px] font-extrabold tracking-tight text-foreground">Ghostline</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/auth"
            search={{ mode: "signin" } as never}
            className="text-sm font-semibold text-muted-foreground transition hover:text-foreground"
          >
            Sign In
          </Link>
          <Link
            to="/auth"
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-md shadow-primary/25 transition hover:bg-[#1467D8] active:scale-95"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto flex max-w-6xl flex-col items-center px-6 pb-20 pt-16 text-center lg:pt-24">
        {/* Trust pills */}
        <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
          {["Private", "Secure", "Fast", "Always With You"].map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold text-muted-foreground shadow-sm"
            >
              <ShieldCheck className="h-3 w-3 text-primary" />
              {t}
            </span>
          ))}
        </div>

        <h1 className="max-w-2xl text-5xl font-extrabold leading-[1.08] tracking-tight text-foreground lg:text-6xl">
          Private Chats.{" "}
          <span className="text-primary">Real Connections.</span>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
          Fast messaging with peer-to-peer voice and video calls.
          Nothing recorded, nothing sold. Built for people who value privacy.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            to="/auth"
            className="inline-flex h-13 items-center gap-2 rounded-2xl bg-primary px-8 text-base font-bold text-white shadow-lg shadow-primary/30 transition hover:bg-[#1467D8] active:scale-95"
          >
            Get Started →
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signin" } as never}
            className="inline-flex h-13 items-center gap-2 rounded-2xl border border-border bg-white px-8 text-base font-semibold text-foreground shadow-sm transition hover:bg-surface-2 active:scale-95"
          >
            Sign In
          </Link>
        </div>
      </section>

      {/* Phone Mockup / Chat Preview */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="relative mx-auto max-w-sm animate-[float_5s_ease-in-out_infinite]">
          <div className="card-elevated overflow-hidden rounded-[28px] bg-white p-0">
            {/* Chat header */}
            <div className="flex items-center gap-3 border-b border-border bg-white px-4 py-3.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">V</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Vamsee</p>
                <p className="text-[11px] text-success font-medium">● Online</p>
              </div>
              <div className="flex gap-1.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-primary">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 1h3a2 2 0 012 1.72c.13 1 .39 1.97.77 2.91a2 2 0 01-.45 2.11L6.09 9a16 16 0 006.9 6.9l1.27-1.27a2 2 0 012.11-.45c.94.38 1.91.64 2.91.77A2 2 0 0122 16.92z" /></svg>
                </div>
              </div>
            </div>
            {/* Messages */}
            <div className="flex flex-col gap-2 px-4 py-4">
              <div className="flex justify-end">
                <div className="bubble-out max-w-[75%] rounded-[20px_20px_6px_20px] px-4 py-2.5">
                  <p className="text-[13px] text-white">Good Job Antigravity.</p>
                  <p className="mt-0.5 text-right text-[10px] text-white/70">8:23 PM ✓✓</p>
                </div>
              </div>
              <div className="flex justify-start">
                <div className="bubble-in max-w-[75%] px-4 py-2.5">
                  <p className="text-[13px]">Anna deploy cheseyacha 🚀</p>
                  <p className="mt-0.5 text-right text-[10px] text-muted-foreground">8:17 PM</p>
                </div>
              </div>
              <div className="flex justify-start">
                <div className="bubble-in max-w-[75%] px-4 py-2.5">
                  <p className="text-[13px]">Inka chala cheyali 😊</p>
                  <p className="mt-0.5 text-right text-[10px] text-muted-foreground">8:39 PM</p>
                </div>
              </div>
              <div className="flex justify-end">
                <div className="bubble-out max-w-[75%] px-4 py-2.5">
                  <p className="text-[13px] text-white">IS IT WORKING ?? 🔥</p>
                  <p className="mt-0.5 text-right text-[10px] text-white/70">8:40 PM ✓✓</p>
                </div>
              </div>
            </div>
            {/* Composer */}
            <div className="border-t border-border px-3 py-3">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2/50 px-3 py-2">
                <p className="flex-1 text-[13px] text-muted-foreground">Message…</p>
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white shadow-sm">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-4 sm:grid-cols-3">
          <FeatureCard
            icon={<Lock className="h-5 w-5" />}
            title="Private by Design"
            desc="Messages encrypted in transit. Calls connect peer-to-peer. Nothing stored, nothing sold."
          />
          <FeatureCard
            icon={<Video className="h-5 w-5" />}
            title="Voice & Video Calls"
            desc="Crystal-clear peer-to-peer calls with DTLS-SRTP encryption. Free, always."
          />
          <FeatureCard
            icon={<Sparkles className="h-5 w-5" />}
            title="Rich Messaging"
            desc="Reactions, replies, pins, voice messages, and file sharing in one premium experience."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-[12px] text-muted-foreground">
        <div className="flex items-center justify-center gap-2 mb-2">
          <GhostMark className="h-4 w-4 text-primary" />
          <span className="font-bold text-foreground">Ghostline</span>
        </div>
        <p>Private · Secure · Fast · Always With You</p>
      </footer>
    </main>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="card-elevated rounded-2xl p-5 transition hover:-translate-y-1">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="font-bold text-foreground">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}

