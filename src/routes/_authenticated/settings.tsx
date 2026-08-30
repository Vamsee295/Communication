import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Smartphone,
  ShieldBan,
  Star,
  User,
  Info,
  Lock,
  LogOut,
  Palette,
  Bell,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings · Ghostline" },
      {
        name: "description",
        content: "Manage your Ghostline account, privacy, devices, blocked contacts and appearance.",
      },
      { property: "og:title", content: "Settings · Ghostline" },
      { property: "og:description", content: "Account, privacy and device settings for Ghostline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {title}
      </p>
      <div className="panel overflow-hidden rounded-2xl">{children}</div>
    </section>
  );
}

function Row({
  to,
  icon: Icon,
  label,
  hint,
}: {
  to: string;
  icon: typeof User;
  label: string;
  hint?: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 border-b border-border px-4 py-3.5 last:border-b-0 transition hover:bg-surface-2/70"
    >
      <Icon className="h-[18px] w-[18px] shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        {hint && <p className="truncate text-[12px] text-muted-foreground">{hint}</p>}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function SettingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-8 lg:pt-10">
        <h1 className="text-[28px] font-extrabold tracking-tight">Settings</h1>

        <Section title="Account">
          <Row to="/profile" icon={User} label="Profile" hint="Name, username and bio" />
          <Row to="/starred" icon={Star} label="Starred messages" hint="Your saved favorites" />
        </Section>

        <Section title="Privacy & Security">
          <Row to="/devices" icon={Smartphone} label="Active devices" hint="Where you're signed in" />
          <Row to="/blocked" icon={ShieldBan} label="Blocked contacts" hint="People who can't reach you" />
          <div className="flex items-start gap-3 px-4 py-3.5">
            <Lock className="mt-0.5 h-[18px] w-[18px] shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">How Ghostline protects you</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                Calls connect peer-to-peer and are encrypted in transit (DTLS-SRTP) — they are never
                recorded or stored. Messages are encrypted in transit and access is restricted to the
                people in the conversation. Message end-to-end encryption is not enabled yet.
              </p>
            </div>
          </div>
        </Section>

        <Section title="Notifications">
          <div className="flex items-start gap-3 px-4 py-3.5">
            <Bell className="mt-0.5 h-[18px] w-[18px] shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">Per-chat muting</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Mute individual conversations from the chat list menu. System push notifications
                aren't available yet.
              </p>
            </div>
          </div>
        </Section>

        <Section title="Appearance">
          <div className="flex items-start gap-3 px-4 py-3.5">
            <Palette className="mt-0.5 h-[18px] w-[18px] shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">Theme</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Ghostline uses a single dark, privacy-first theme.
              </p>
            </div>
          </div>
        </Section>

        <Section title="About">
          <div className="flex items-start gap-3 px-4 py-3.5">
            <Info className="mt-0.5 h-[18px] w-[18px] shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">Ghostline</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Version 0.4 · Private messaging with peer-to-peer voice and video calls.
              </p>
            </div>
          </div>
        </Section>

        <button
          onClick={signOut}
          className="press mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border text-sm font-semibold text-destructive"
        >
          <LogOut className="h-4 w-4" /> Log out
        </button>
      </div>
    </AppShell>
  );
}
