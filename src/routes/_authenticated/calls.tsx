import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Video,
  Search,
  X,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { listCalls, deleteCallFromHistory, type CallHistoryItem } from "@/lib/calls.functions";
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
  const doDelete = useServerFn(deleteCallFromHistory);
  const { startCall } = useCalls();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const calls = useQuery({ queryKey: ["calls"], queryFn: () => fetchCalls(), refetchInterval: 20000 });
  const conversations = useQuery({ queryKey: ["conversations"], queryFn: () => fetchConversations() });

  const deleteMut = useMutation({
    mutationFn: (callId: string) => doDelete({ data: { call_id: callId } }),
    onSuccess: () => {
      toast.success("Call removed from history");
      qc.invalidateQueries({ queryKey: ["calls"] });
      setDeleteTargetId(null);
      setSelectedId(null);
    },
    onError: () => toast.error("Could not delete call"),
  });

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
              const isSelected = selectedId === c.id;

              return (
                <CallRow
                  key={c.id}
                  c={c}
                  name={name}
                  missed={missed}
                  Icon={Icon}
                  isSelected={isSelected}
                  onSelect={() => setSelectedId(isSelected ? null : c.id)}
                  onDeselect={() => setSelectedId(null)}
                  onRingVoice={() => ring(c, "voice")}
                  onRingVideo={() => ring(c, "video")}
                  onDelete={() => setDeleteTargetId(c.id)}
                />
              );
            })}
          </ul>
        )}
      </div>

      {/* Dismiss overlay when something selected */}
      {selectedId && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setSelectedId(null)}
          aria-hidden
        />
      )}

      {/* Delete confirmation sheet */}
      {deleteTargetId && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 animate-fade-in"
          onClick={() => setDeleteTargetId(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-popover p-5 shadow-2xl animate-rise-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[15px] font-bold text-foreground">Remove from history?</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              This call will be permanently removed from your call history.
            </p>
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                onClick={() => setDeleteTargetId(null)}
                className="h-10 rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMut.mutate(deleteTargetId)}
                disabled={deleteMut.isPending}
                className="h-10 rounded-xl bg-destructive px-4 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
              >
                {deleteMut.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function CallRow({
  c,
  name,
  missed,
  Icon,
  isSelected,
  onSelect,
  onDeselect,
  onRingVoice,
  onRingVideo,
  onDelete,
}: {
  c: CallHistoryItem;
  name: string;
  missed: boolean;
  Icon: React.ElementType;
  isSelected: boolean;
  onSelect: () => void;
  onDeselect: () => void;
  onRingVoice: () => void;
  onRingVideo: () => void;
  onDelete: () => void;
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const startLongPress = () => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onSelect();
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <li className="relative">
      {/* Long-press / right-click action menu */}
      {isSelected && (
        <>
          <div className="fixed inset-0 z-30" onClick={onDeselect} aria-hidden />
          <div className="absolute right-3 top-12 z-40 w-44 overflow-hidden rounded-2xl border border-border bg-popover py-1.5 shadow-xl shadow-black/10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeselect();
                onDelete();
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-destructive transition hover:bg-surface-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </>
      )}

      <div
        role="button"
        tabIndex={0}
        onContextMenu={(e) => {
          e.preventDefault();
          onSelect();
        }}
        onTouchStart={startLongPress}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
        onKeyDown={(e) => {
          if (e.key === "Delete" || e.key === "Backspace") onDelete();
        }}
        className={[
          "group flex items-center gap-3 rounded-xl px-3 py-3 transition select-none",
          isSelected ? "bg-surface-2" : "hover:bg-surface-2/70",
        ].join(" ")}
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
            onClick={onRingVoice}
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-secondary hover:text-primary"
            aria-label={`Voice call ${name}`}
          >
            <Phone className="h-4 w-4" />
          </button>
          <button
            onClick={onRingVideo}
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
      </div>
    </li>
  );
}
