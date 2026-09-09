import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useTheme } from "@/hooks/use-theme";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { authService } from "@/lib/auth/session";
import { PresenceProvider } from "@/components/presence-provider";
import { CallProvider } from "@/components/calls/call-provider";
import { DeviceSecurityProvider } from "@/components/device-security-provider";
import { StartupSplash } from "@/components/startup-splash";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-black text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Nothing here</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This ghost slipped away.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Something broke</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Try again or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </button>
          <a href="/" className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#2587F5" },
      { title: "Ghostline — Private Chats. Real Connections." },
      { name: "description", content: "Private messaging with peer-to-peer voice and video calls. Nothing recorded, nothing sold. Built for people who value privacy." },
      { property: "og:title", content: "Ghostline — Private Chats. Real Connections." },
      { property: "og:description", content: "Private messaging with peer-to-peer voice and video calls. Nothing recorded, nothing sold." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/og-image.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "/og-image.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "icon", href: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { rel: "icon", href: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],

  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="ghostline-boot-splash" className="ghostline-splash-screen" aria-hidden="true">
          <div className="ghostline-splash-container">
            <div className="ghostline-splash-badge">
              <svg viewBox="0 0 24 24" className="ghostline-splash-icon" fill="none" aria-hidden="true">
                <path
                  d="M4 11a8 8 0 1 1 16 0v8.2c0 .9-1 1.4-1.7.9l-1.6-1.2a1.2 1.2 0 0 0-1.5.05l-1.1.9a1.2 1.2 0 0 1-1.6-.03l-1-.9a1.2 1.2 0 0 0-1.5-.04L8.2 20c-.7.5-1.7 0-1.7-.9V11Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path d="M9.5 10.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M9.5 13.8h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <h1 className="ghostline-splash-title">Ghostline</h1>
            <p className="ghostline-splash-subtitle">Private Chats. Real Connections.</p>
            <div className="ghostline-splash-loader">
              <div className="ghostline-splash-loader-bar" />
            </div>
          </div>
        </div>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/** Applies persisted theme + accent on every mount to prevent a flash. */
function ThemeBootstrap() {
  useTheme();
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data: sub } = authService.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        queryClient.invalidateQueries({ queryKey: ["me"] });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <StartupSplash />
      <ThemeBootstrap />
      <DeviceSecurityProvider>
        <PresenceProvider>
          <CallProvider>
            <Outlet />
          </CallProvider>
        </PresenceProvider>
      </DeviceSecurityProvider>
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
