import { Link, useRouterState } from "@tanstack/react-router";
import { MessageCircle, Camera, PlaySquare, User } from "lucide-react";
import type { ReactNode } from "react";

const tabs = [
  { to: "/chats", label: "Chats", icon: MessageCircle },
  { to: "/camera", label: "Camera", icon: Camera },
  { to: "/stories", label: "Stories", icon: PlaySquare },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="flex-1 pb-24">{children}</div>
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="glass flex items-center justify-around rounded-full px-2 py-2 shadow-2xl">
          {tabs.map((tab) => {
            const active = pathname === tab.to || pathname.startsWith(tab.to + "/");
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={[
                  "flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-full transition",
                  active
                    ? "bg-primary text-primary-foreground glow-primary"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                <Icon className="h-5 w-5" strokeWidth={2.4} />
                <span className="text-[10px] font-semibold">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
