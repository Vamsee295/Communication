import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Video,
  Search,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { listCalls, type CallHistoryItem } from "@/lib/calls.functions";
import { listConversations } from "@/lib/chat.functions";
import { useCalls } from "@/components/calls/call-provider";
import { formatDuration } from "@/lib/webrtc-config";

export const Route = createFileRoute("/_authenticated/calls")({
  head: () => ({
    meta: [
      { title: "Calls · Ghostline" },
      {
        name: "description",
        content: "Your private voice and video call history on Ghostline — encrypted, peer-to-peer, never recorded.",
      },
      { property: "og:title", content: "Calls · Ghostline" },
      { property: "og:description", content: "Private peer-to-peer voice and video calls." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CallsPage,
});

function label(c: CallHistoryItem) {
  if (c.status === "missed" || c.status === "declined") return "Missed";
  return c.direction === "incoming" ? "Incoming" : "Outgoing";
}

function when(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const yesterday = new Date(today.getTime() - 86400000).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Today, ${time}`;
  if (yesterday) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}

function CallsPage() {
  const fetchCalls = useServerFn(listCalls);
  const fetchConversations = useServerFn(listConversations);
  const { startCall } = useCalls();
  const [q, setQ] = useState("");

  const calls = useQuery({ queryKey: ["calls"], queryFn: () => fetchCalls(), refetchInterval: 20000 });
  const conversations = useQuery({ queryKey: ["conversations"], queryFn: () => fetchConversations() });

  const convByPeer = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of conversations.data ?? []) if (c.other?.id) map.set(c.other.id, c.id);
    return map;
  }, [conversations.data]);

  const items = useMemo(() => {
    const list = calls.data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((c) =>
      `${c.peer?.display_name ?? ""} ${c.peer?.username ?? ""}`.toLowerCase().includes(needle),
    );
  }, [calls.data, q]);

  const ring = (c: CallHistoryItem, type: "voice" | "video") => {
    const peerId = c.peer?.id;
    const conversationId = peerId ? convByPeer.get(peerId) ?? c.conversation_id : c.conversation_id;
    if (!peerId) return;
    void startCall({ conversationId, peerId, peer: c.peer, type });
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-5 pb-10 pt-8 lg:pt-10">
        <header>
          <h1 className="text-[28px] font-extrabold tracking-tight">Calls</h1>
          <div className="focus-glow mt-4 flex items-center gap-2.5 rounded-xl border border-border bg-surface-2/60 px-3.5 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search calls"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {q && (
              <button onClick={() => setQ("")} aria-label="Clear" className="text-muted-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </header>

        {items.length === 0 ? (
          <div className="panel mt-8 flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Phone className="h-6 w-6" />
            </div>
            <h2 className="text-base font-bold">No calls yet</h2>
            <p className="max-w-xs text-sm text-muted-foreground">
              Start a voice or video call from any conversation. Calls are peer-to-peer and never recorded.
            </p>
            <Link
              to="/chats"
              className="press mt-2 inline-flex h-10 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
            >
              Open chats
            </Link>
          </div>
        ) : (
          <ul className="mt-6 grid gap-0.5">
            {items.map((c) => {
              const name = c.peer?.display_name ?? c.peer?.username ?? "Ghost";
              const missed = c.status === "missed" || c.status === "declined";
              const Icon = missed
                ? PhoneMissed
                : c.direction === "incoming"
                  ? PhoneIncoming
                  : PhoneOutgoing;
              return (
                <li
                  key={c.id}
                  className="group flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-surface-2/70"
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold text-primary ring-1 ring-border">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[15px] font-semibold ${missed ? "text-destructive" : ""}`}>
                      {name}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      {label(c)} · {when(c.created_at)}
                      {c.status === "ended" && !!c.duration_seconds && c.duration_seconds > 0 && (
                        <span className="tabular-nums"> · {formatDuration(c.duration_seconds)}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      onClick={() => ring(c, "voice")}
                      className="grid h-9 w-9 place-items-center rounded-full hover:bg-secondary hover:text-primary"
                      aria-label={`Voice call ${name}`}
                    >
                      <Phone className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => ring(c, "video")}
                      className="grid h-9 w-9 place-items-center rounded-full hover:bg-secondary hover:text-primary"
                      aria-label={`Video call ${name}`}
                    >
                      <Video className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="shrink-0 text-muted-foreground lg:hidden">
                    {c.call_type === "video" ? (
                      <Video className="h-4 w-4" />
                    ) : (
                      <Phone className="h-4 w-4" />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
