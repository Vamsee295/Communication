import { Link, useRouterState } from "@tanstack/react-router";
import { MessageCircle, Phone, User, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { CommandPalette } from "@/components/command-palette";

const tabs = [
  { to: "/chats", label: "Chats", icon: MessageCircle },
  { to: "/calls", label: "Calls", icon: Phone },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function GhostMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M4 11a8 8 0 1 1 16 0v8.2c0 .9-1 1.4-1.7.9l-1.6-1.2a1.2 1.2 0 0 0-1.5.05l-1.1.9a1.2 1.2 0 0 1-1.6-.03l-1-.9a1.2 1.2 0 0 0-1.5-.04L8.2 20c-.7.5-1.7 0-1.7-.9V11Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9.5 10.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9.5 13.8h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  return (
    <div className="flex min-h-screen">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-sidebar/80 px-4 py-6 lg:flex">
        <div className="flex items-center gap-2.5 px-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/25">
            <GhostMark className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="brand-wordmark text-[11px] text-foreground">Ghostline</p>
            <p className="truncate text-[11px] text-muted-foreground">Private conversations</p>
          </div>
        </div>

        <nav className="mt-8 grid gap-1">
          {tabs.map((tab) => {
            const active = isActive(tab.to);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={[
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-150",
                  active
                    ? "bg-surface-2 text-foreground"
                    : "text-muted-foreground hover:translate-x-[2px] hover:bg-surface-2/60 hover:text-foreground",
                ].join(" ")}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary" />
                )}
                <Icon
                  className={["h-[18px] w-[18px]", active ? "text-primary" : ""].join(" ")}
                  strokeWidth={2.1}
                />
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary/80" />
          Messages stay private
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-24 lg:pb-0">{children}</div>

      {/* Mobile bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="glass flex items-center justify-around rounded-2xl px-2 py-1.5 shadow-2xl">
          {tabs.map((tab) => {
            const active = isActive(tab.to);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={[
                  "relative flex h-12 w-16 flex-col items-center justify-center gap-1 rounded-xl transition-all duration-150",
                  active ? "text-primary" : "text-muted-foreground active:scale-95",
                ].join(" ")}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
                <span className="text-[10px] font-semibold tracking-wide">{tab.label}</span>
                {active && (
                  <span className="absolute -top-0.5 h-1 w-1 rounded-full bg-primary shadow-[0_0_10px_2px_var(--glow)]" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
