import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ChevronRight,
  Smartphone,
  ShieldBan,
  ShieldCheck,
  Star,
  User,
  Info,
  Lock,
  LogOut,
  Palette,
  Bell,
  BellRing,
  Loader2,
  CheckCircle2,
  KeyRound,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { authService } from "@/lib/auth/session";
import { rotateDeviceKey } from "@/lib/device-key";
import { clearMediaCache } from "@/lib/authenticated-media";
import { getVapidPublicKey, savePushSubscription, removePushSubscription } from "@/lib/chat.functions";
import { useTheme, type ThemeMode, type AccentColor } from "@/hooks/use-theme";

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

// ── Utilities ────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const clean = base64String.trim();
  const padding = "=".repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function areKeyBuffersEqual(buf1: ArrayBuffer | null | undefined, arr2: Uint8Array): boolean {
  if (!buf1) return false;
  const arr1 = new Uint8Array(buf1);
  if (arr1.length !== arr2.length) return false;
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) return false;
  }
  return true;
}

// ── Shared layout primitives ─────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </p>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">{children}</div>
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
      className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 transition hover:bg-surface-2/70"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
        <Icon className="h-[16px] w-[16px] shrink-0 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-foreground">{label}</p>
        {hint && <p className="truncate text-[12px] text-muted-foreground">{hint}</p>}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

// ── Notifications ─────────────────────────────────────────────────────────────

function WebPushToggle() {
  const fetchVapidKey = useServerFn(getVapidPublicKey);
  const saveSub = useServerFn(savePushSubscription);
  const removeSub = useServerFn(removePushSubscription);

  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);
      return;
    }
    setPermission(Notification.permission);
    navigator.serviceWorker.getRegistration("/ghostline-push-sw.js").then((reg) => {
      if (reg) {
        reg.pushManager.getSubscription().then((sub) => {
          setSubscribed(!!sub);
        });
      }
    });
  }, []);

  const enablePush = async () => {
    setLoading(true);
    try {
      if (!supported) throw new Error("Push notifications are not supported in this browser");
      if (window.isSecureContext === false) {
        throw new Error("Push notifications require a secure (HTTPS) connection");
      }
      
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        throw new Error("Notifications are blocked for Ghostline. Allow notifications in your browser settings and try again.");
      }

      const reg = await navigator.serviceWorker.register("/ghostline-push-sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      const { public_key } = await fetchVapidKey();
      if (!public_key) {
        throw new Error("Push notifications are temporarily unavailable.");
      }
      const applicationServerKey = urlBase64ToUint8Array(public_key);

      // Check existing subscription
      const existingSub = await reg.pushManager.getSubscription();
      let sub = existingSub;

      const isSameKey = existingSub && areKeyBuffersEqual(existingSub.options?.applicationServerKey, applicationServerKey);

      if (!existingSub || !isSameKey) {
        if (existingSub) {
          try {
            await existingSub.unsubscribe();
          } catch (unsubErr) {
            console.warn("[WebPush] Stale subscription unsubscribe ignored:", unsubErr);
          }
        }
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey as unknown as BufferSource,
        });
      }

      if (!sub) {
        throw new Error("Ghostline couldn't register this device for notifications. Please try again.");
      }

      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Invalid push subscription format from browser");
      }

      await saveSub({
        data: {
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          user_agent: navigator.userAgent.slice(0, 500),
        },
      });

      setSubscribed(true);
      toast.success("Web Push enabled successfully");
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      const errName = error.name;
      const errMsg = error.message.toLowerCase();

      console.error("[WebPush] Registration failed:", error);

      if (errName === "NotAllowedError" || errMsg.includes("permission") || errMsg.includes("blocked")) {
        toast.error("Notifications are blocked. Allow them in browser settings.");
      } else if (errMsg.includes("not configured") || errMsg.includes("unavailable") || errMsg.includes("vapid")) {
        toast.error("Push notifications are temporarily unavailable.");
      } else if (errName === "AbortError" || errMsg.includes("push service error")) {
        toast.error("Ghostline couldn't register this device for notifications. If using Brave, enable 'Google Services for push' in browser settings.");
      } else if (errName === "InvalidAccessError" || errName === "InvalidCharacterError") {
        toast.error("Ghostline encountered an invalid key format. Please try again.");
      } else if (errMsg.includes("network") || errMsg.includes("fetch") || errMsg.includes("connect")) {
        toast.error("Couldn't connect to the notification service. Please try again.");
      } else if (errMsg.includes("service worker") || errMsg.includes("serviceworker")) {
        toast.error("Ghostline couldn't start its notification service. Please reload and try again.");
      } else {
        toast.error(error.message || "Ghostline couldn't register this device for notifications. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const disablePush = async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/ghostline-push-sw.js");
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe().catch(() => {});
          await removeSub({ data: { endpoint } }).catch(() => {});
        }
      }
      setSubscribed(false);
      toast.success("Web Push disabled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disable push");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 h-[18px] w-[18px] shrink-0 text-primary" />
        <div>
          <p className="text-sm font-semibold">Web Push Notifications</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {!supported
              ? "Unsupported in this browser"
              : permission === "denied"
              ? "Permission blocked in browser settings"
              : subscribed
              ? "Receiving push alerts for new messages"
              : "Receive background alerts when Ghostline is closed"}
          </p>
        </div>
      </div>
      {supported && permission !== "denied" && (
        <button
          onClick={subscribed ? disablePush : enablePush}
          disabled={loading}
          className={[
            "press flex h-9 shrink-0 items-center justify-center rounded-xl px-3.5 text-xs font-semibold transition",
            subscribed
              ? "border border-border hover:bg-surface-2 text-foreground"
              : "bg-primary text-primary-foreground glow-primary",
          ].join(" ")}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : subscribed ? (
            "Disable"
          ) : (
            "Enable"
          )}
        </button>
      )}
    </div>
  );
}

// ── Appearance ─────────────────────────────────────────────────────────────────

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: string; desc: string }[] = [
  { value: "light",    label: "Light",     icon: "☀️", desc: "Bright & clear" },
  { value: "dark",     label: "Dark",      icon: "🌙", desc: "Easy on the eyes" },
  { value: "system",   label: "System",    icon: "🖥️", desc: "Follows device" },
  { value: "blue-dim", label: "Blue / Dim", icon: "🔵", desc: "Navy comfort" },
];

const ACCENT_OPTIONS: { value: AccentColor; label: string; color: string }[] = [
  { value: "blue",   label: "Blue",   color: "#2587F5" },
  { value: "red",    label: "Red",    color: "#E53E3E" },
  { value: "green",  label: "Green",  color: "#16A34A" },
  { value: "yellow", label: "Yellow", color: "#D97706" },
  { value: "pink",   label: "Pink",   color: "#DB2777" },
  { value: "purple", label: "Purple", color: "#7C3AED" },
  { value: "grey",   label: "Grey",   color: "#475569" },
];

function AppearanceControls() {
  const { theme, accent, setTheme, setAccent } = useTheme();

  return (
    <div className="divide-y divide-border">
      {/* ── Theme picker ── */}
      <div className="px-4 py-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
            <Palette className="h-[16px] w-[16px] shrink-0 text-primary" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-foreground">Theme</p>
            <p className="text-[11px] text-muted-foreground">Controls the overall environment</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {THEME_OPTIONS.map((opt) => {
            const active = theme === opt.value;
            return (
              <button
                key={opt.value}
                id={`theme-${opt.value}`}
                onClick={() => setTheme(opt.value)}
                className={[
                  "relative flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  active
                    ? "border-primary bg-primary/8 shadow-sm"
                    : "border-border bg-surface-2/50 hover:border-primary/40 hover:bg-surface-2",
                ].join(" ")}
              >
                {active && (
                  <CheckCircle2 className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-primary" />
                )}
                <span className="text-xl leading-none" role="img" aria-label={opt.label}>{opt.icon}</span>
                <span className="text-[11px] font-semibold text-foreground">{opt.label}</span>
                <span className="text-[10px] leading-tight text-muted-foreground">{opt.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Accent colour picker ── */}
      <div className="px-4 py-4">
        <div className="mb-3">
          <p className="text-[14px] font-semibold text-foreground">Accent Color</p>
          <p className="text-[11px] text-muted-foreground">Personalise Ghostline's colour personality</p>
        </div>
        <div className="flex flex-wrap gap-4">
          {ACCENT_OPTIONS.map((opt) => {
            const active = accent === opt.value;
            return (
              <button
                key={opt.value}
                id={`accent-${opt.value}`}
                onClick={() => setAccent(opt.value)}
                title={opt.label}
                aria-label={`${opt.label} accent${active ? " (active)" : ""}`}
                className="group flex flex-col items-center gap-1.5 focus:outline-none"
              >
                <span
                  className={[
                    "flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200",
                    active ? "scale-110" : "hover:scale-105",
                  ].join(" ")}
                  style={{
                    background: opt.color,
                    outline: active ? `3px solid ${opt.color}` : undefined,
                    outlineOffset: active ? "3px" : undefined,
                    boxShadow: active ? `0 0 0 6px ${opt.color}22` : undefined,
                  }}
                >
                  {active && <CheckCircle2 className="h-4 w-4 text-white drop-shadow" />}
                </span>
                <span
                  className={[
                    "text-[10px] font-medium transition-colors",
                    active ? "text-foreground font-semibold" : "text-muted-foreground",
                  ].join(" ")}
                >
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Affects buttons, active navigation, links, and interactive highlights across the whole app.
        </p>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function SettingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    clearMediaCache();
    rotateDeviceKey();
    await authService.signOut();
    toast.success("Signed out successfully.");
    navigate({ to: "/auth", replace: true });
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-xl px-5 pb-16 pt-8 lg:pt-10">
        <h1 className="text-[22px] font-extrabold tracking-tight text-foreground">Settings</h1>

        <Section title="Account">
          <Row to="/profile" icon={User} label="Profile" hint="Name, username and bio" />
          <Row to="/starred" icon={Star} label="Starred messages" hint="Your saved favorites" />
        </Section>

        <Section title="Privacy & Security">
          <Row to="/devices" icon={Smartphone} label="Active devices" hint="Where you're signed in" />
          <Row to="/change-password" icon={KeyRound} label="Change Password" hint="Update your Ghostline account password" />
          <Row to="/blocked" icon={ShieldBan} label="Blocked contacts" hint="People who can't reach you" />
          <div className="flex items-start gap-3 px-4 py-3.5">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
              <Lock className="h-[16px] w-[16px] shrink-0 text-primary" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-foreground">How Ghostline protects you</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                Calls connect peer-to-peer and are encrypted in transit (DTLS-SRTP) — they are never
                recorded or stored. Messages are encrypted in transit and access is restricted to the
                people in the conversation.
              </p>
            </div>
          </div>
        </Section>

        <Section title="Notifications">
          <WebPushToggle />
          <div className="border-t border-border flex items-start gap-3 px-4 py-3.5">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
              <Bell className="h-[16px] w-[16px] shrink-0 text-primary" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-foreground">Per-chat muting</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Mute individual conversations directly from the chat options menu.
              </p>
            </div>
          </div>
        </Section>

        <Section title="Appearance">
          <AppearanceControls />
        </Section>

        <Section title="About">
          <div className="flex items-start gap-3 px-4 py-3.5">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
              <Info className="h-[16px] w-[16px] shrink-0 text-primary" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-foreground">Ghostline</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Version 1.0 · Private messaging with peer-to-peer voice and video calls.
              </p>
            </div>
          </div>
        </Section>

        <button
          onClick={signOut}
          className="mt-7 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 text-sm font-semibold text-destructive transition hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" /> Log out
        </button>
      </div>
    </AppShell>
  );
}
