import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
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
  BellRing,
  Loader2,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { authService } from "@/lib/auth/session";
import { getVapidPublicKey, savePushSubscription, removePushSubscription } from "@/lib/chat.functions";

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

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

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
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        throw new Error("Notification permission denied");
      }
      const reg = await navigator.serviceWorker.register("/ghostline-push-sw.js");
      await navigator.serviceWorker.ready;
      const { public_key } = await fetchVapidKey();
      const applicationServerKey = urlBase64ToUint8Array(public_key);
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey.buffer as ArrayBuffer });
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not enable push");
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
          await sub.unsubscribe();
          await removeSub({ data: { endpoint } });
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
    await authService.signOut();
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
          <WebPushToggle />
          <div className="border-t border-border flex items-start gap-3 px-4 py-3.5">
            <Bell className="mt-0.5 h-[18px] w-[18px] shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">Per-chat muting</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Mute individual conversations directly from the chat options menu.
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
                Version 1.0 · Private messaging with peer-to-peer voice and video calls.
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
