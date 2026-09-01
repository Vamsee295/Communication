import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  UserPlus,
  Users,
  Search,
  X,
  Lock,
  CheckCheck,
  MoreVertical,
  Pin,
  PinOff,
  Bell,
  BellOff,
  Archive,
  Trash2,
  ShieldBan,
  MailOpen,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, GhostMark } from "@/components/app-shell";
import { registerDevice } from "@/lib/devices.functions";
import { getMyProfile } from "@/lib/profile.functions";
import {
  listConversations,
  searchMessagesGlobal,
  setConversationFlags,
  markConversationUnread,
  leaveConversation,
  blockContact,
  type ConversationSummary,
} from "@/lib/chat.functions";
import { getDeviceKey, guessDeviceName } from "@/lib/device-key";
import { usePresence, statusLabel } from "@/components/presence-provider";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/chats/")({
  head: () => ({
    meta: [
      { title: "Chats · Ghostline" },
      {
        name: "description",
        content: "Your private Ghostline conversations — pinned chats, unread counts and live presence.",
      },
      { property: "og:title", content: "Chats · Ghostline" },
      { property: "og:description", content: "Private conversations with live presence on Ghostline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatsPage,
});

type Confirm =
  | { kind: "delete"; conv: ConversationSummary }
  | { kind: "block"; conv: ConversationSummary }
  | null;

function ChatsPage() {
  const register = useServerFn(registerDevice);
  const fetchConversations = useServerFn(listConversations);
  const fetchProfile = useServerFn(getMyProfile);
  const doFlags = useServerFn(setConversationFlags);
  const doUnread = useServerFn(markConversationUnread);
  const doLeave = useServerFn(leaveConversation);
  const doBlock = useServerFn(blockContact);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { onlineIds } = usePresence();

  const profile = useQuery({
    queryKey: ["me"],
    queryFn: () => fetchProfile(),
  });

  useEffect(() => {
    register({
      data: {
        device_key: getDeviceKey(),
        device_name: guessDeviceName(),
        platform: "web",
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : undefined,
      },
    }).catch(() => {});
  }, [register]);

  useEffect(() => {
    if (profile.data && !profile.data.username) {
      window.location.replace("/onboarding");
    }
  }, [profile.data]);

  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => fetchConversations(),
    enabled: !!profile.data?.username,
  });

  // Realtime: any message insert refreshes conversation list
  useEffect(() => {
    if (!profile.data?.id) return;
    const channel = supabase
      .channel(`chat:global:${profile.data.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        qc.invalidateQueries({ queryKey: ["friendships"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile.data?.id, qc]);

  const [q, setQ] = useState("");
  const [mobileSearch, setMobileSearch] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const trimmed = q.trim();
  const items = conversations.data ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ["conversations"] });

  const flags = useMutation({
    mutationFn: (v: { conversation_id: string; pinned?: boolean; muted?: boolean; archived?: boolean }) =>
      doFlags({ data: v }),
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update chat"),
  });
  const unread = useMutation({
    mutationFn: (id: string) => doUnread({ data: { conversation_id: id } }),
    onSuccess: () => {
      toast.success("Marked as unread");
      refresh();
    },
  });
  const leave = useMutation({
    mutationFn: (id: string) => doLeave({ data: { conversation_id: id } }),
    onSuccess: () => {
      toast.success("Chat deleted");
      refresh();
    },
  });
  const block = useMutation({
    mutationFn: (userId: string) => doBlock({ data: { user_id: userId } }),
    onSuccess: () => {
      toast.success("Contact blocked");
      qc.invalidateQueries({ queryKey: ["friendships"] });
      qc.invalidateQueries({ queryKey: ["blocked"] });
      refresh();
    },
  });

  const filtered = useMemo(() => {
    const visible = items.filter((c) => !c.archived);
    if (!trimmed) return visible;
    const needle = trimmed.toLowerCase();
    return visible.filter((c) => {
      const n = (c.other?.display_name ?? "").toLowerCase();
      const u = (c.other?.username ?? "").toLowerCase();
      return n.includes(needle) || u.includes(needle);
    });
  }, [items, trimmed]);

  const pinned = filtered.filter((c) => c.pinned);
  const recent = filtered.filter((c) => !c.pinned);

  const fetchGlobalSearch = useServerFn(searchMessagesGlobal);
  const globalHits = useQuery({
    queryKey: ["global-search", trimmed],
    queryFn: () => fetchGlobalSearch({ data: { q: trimmed } }),
    enabled: trimmed.length >= 2,
  });

  const renderRow = (c: ConversationSummary) => (
    <ChatRow
      key={c.id}
      c={c}
      meId={profile.data?.id}
      online={!!c.other?.id && onlineIds.has(c.other.id)}
      menuOpen={menuFor === c.id}
      onOpenMenu={(open) => setMenuFor(open ? c.id : null)}
      onOpen={() => navigate({ to: "/chats/$conversationId", params: { conversationId: c.id } })}
      onUnread={() => unread.mutate(c.id)}
      onPin={() => flags.mutate({ conversation_id: c.id, pinned: !c.pinned })}
      onMute={() => flags.mutate({ conversation_id: c.id, muted: !c.muted })}
      onArchive={() => flags.mutate({ conversation_id: c.id, archived: true })}
      onDelete={() => setConfirm({ kind: "delete", conv: c })}
      onBlock={() => setConfirm({ kind: "block", conv: c })}
    />
  );

  const renderResults = () => (
    <>
            {filtered.length === 0 && !trimmed ? (
              <div className="px-2">
                <EmptyState />
              </div>
            ) : (
              <>
                {pinned.length > 0 && (
                  <>
                    <p className="mb-1 mt-1 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Pinned
                    </p>
                    <ul className="grid gap-0.5">{pinned.map(renderRow)}</ul>
                    {recent.length > 0 && (
                      <p className="mb-1 mt-4 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Recent
                      </p>
                    )}
                  </>
                )}
                <ul className="grid gap-0.5">{recent.map(renderRow)}</ul>
              </>
            )}

            {trimmed.length >= 2 && (globalHits.data ?? []).length > 0 && (
              <div className="mt-6">
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Messages
                </p>
                <ul className="grid gap-0.5">
                  {(globalHits.data ?? []).map((h) => {
                    const name = h.other?.display_name ?? h.other?.username ?? "Ghost";
                    return (
                      <li key={h.message.id}>
                        <button
                          onClick={() =>
                            navigate({
                              to: "/chats/$conversationId",
                              params: { conversationId: h.conversation_id },
                            })
                          }
                          className="w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-surface-2/70"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate text-[13px] font-semibold">{name}</p>
                            <p className="shrink-0 text-[10px] text-muted-foreground">
                              {new Date(h.message.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">
                            {h.message.body}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {trimmed.length >= 2 &&
              globalHits.isSuccess &&
              (globalHits.data ?? []).length === 0 &&
              filtered.length === 0 && (
                <p className="mt-10 text-center text-sm text-muted-foreground">No matches for "{trimmed}"</p>
              )}
    </>
  );

  return (
    <AppShell>
      <div className="flex min-h-screen w-full">
        {/* Conversation list column */}
        <section className="flex min-w-0 flex-1 flex-col lg:max-w-[400px] lg:border-r lg:border-border">
          <header className="sticky top-0 z-20 bg-background/85 px-5 pb-4 pt-8 backdrop-blur-xl lg:pt-6">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <p className="brand-wordmark text-[10px] text-muted-foreground lg:hidden">Ghostline</p>
                <h1 className="truncate text-[28px] font-extrabold tracking-tight">Chats</h1>
              </div>
              <Link
                to="/contacts"
                className="press grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground glow-primary"
                aria-label="Contacts"
              >
                <UserPlus className="h-[18px] w-[18px]" />
              </Link>
            </div>

            <div className="focus-glow mt-4 flex items-center gap-2.5 rounded-xl border border-border bg-surface-2/60 px-3.5 py-2.5 transition">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={(e) => {
                  if (window.matchMedia("(max-width: 1023px)").matches) {
                    e.currentTarget.blur();
                    setMobileSearch(true);
                  }
                }}
                placeholder="Search chats and messages"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {q ? (
                <button
                  onClick={() => setQ("")}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
                  aria-label="Clear"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground lg:block">
                  ⌘K
                </kbd>
              )}
            </div>
          </header>

          <div className="flex-1 px-3 pb-6">{renderResults()}</div>
        </section>

        {/* Desktop detail pane */}
        <section className="hidden flex-1 items-center justify-center px-10 lg:flex">
          <div className="max-w-sm animate-rise-in text-center">
            <div className="animate-breathe mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <GhostMark className="h-7 w-7" />
            </div>
            <h2 className="mt-6 text-lg font-bold">Select a conversation</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Your private messages live here. Pick a chat on the left, or start a new one.
            </p>
            <Link
              to="/contacts"
              className="press mt-6 inline-flex h-10 items-center justify-center rounded-xl border border-border px-5 text-sm font-semibold hover:bg-surface-2"
            >
              Start a conversation
            </Link>
            <p className="mt-8 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3" /> Messages are private
            </p>
          </div>
        </section>
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === "delete" ? "Delete this chat?" : "Block this contact?"}
          body={
            confirm.kind === "delete"
              ? "The conversation is removed from your list. Messages you already sent stay with the other person."
              : "They won't be able to message or call you until you unblock them."
          }
          action={confirm.kind === "delete" ? "Delete" : "Block"}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm.kind === "delete") leave.mutate(confirm.conv.id);
            else if (confirm.conv.other?.id) block.mutate(confirm.conv.other.id);
            setConfirm(null);
          }}
        />
      )}
      {mobileSearch && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-background lg:hidden">
          <header className="flex items-center gap-2 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              onClick={() => setMobileSearch(false)}
              className="press grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="focus-glow flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border bg-surface-2/60 px-3.5 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search chats and messages"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground"
                  aria-label="Clear"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </header>
          <div className="flex-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {trimmed ? (
              renderResults()
            ) : (
              <p className="mt-16 text-center text-sm text-muted-foreground">
                Search your chats and messages
              </p>
            )}
          </div>
        </div>
      )}

    </AppShell>
  );
}

function ChatRow({
  c,
  meId,
  online,
  menuOpen,
  onOpenMenu,
  onOpen,
  onUnread,
  onPin,
  onMute,
  onArchive,
  onDelete,
  onBlock,
}: {
  c: ConversationSummary;
  meId?: string;
  online: boolean;
  menuOpen: boolean;
  onOpenMenu: (open: boolean) => void;
  onOpen: () => void;
  onUnread: () => void;
  onPin: () => void;
  onMute: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onBlock: () => void;
}) {
  const name = c.other?.display_name ?? c.other?.username ?? "Ghost";
  const last = c.last_message;
  const mine = last?.sender_id === meId;
  const preview = last ? (last.deleted_at ? "Message deleted" : last.body) : "Say hi 👋";
  const ts = last
    ? new Date(last.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";
  const status = statusLabel(online, c.other?.last_seen);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);

  const item = (icon: React.ReactNode, label: string, run: () => void, danger = false) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onOpenMenu(false);
        run();
      }}
      className={[
        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition hover:bg-surface-2",
        danger ? "text-destructive" : "text-foreground",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <li className="relative">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenMenu(true);
        }}
        onTouchStart={() => {
          longPress.current = setTimeout(() => onOpenMenu(true), 500);
        }}
        onTouchEnd={() => {
          if (longPress.current) clearTimeout(longPress.current);
        }}
        className="group flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left transition-all duration-150 hover:translate-x-[3px] hover:bg-surface-2/70"
      >
        <div className="relative shrink-0">
          <div className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-sm font-bold text-primary ring-1 ring-border transition group-hover:ring-primary/30">
            {name.charAt(0).toUpperCase()}
          </div>
          {online && (
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 truncate text-[15px] font-semibold">
              {c.pinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />}
              <span className="truncate">{name}</span>
              {c.muted && <BellOff className="h-3 w-3 shrink-0 text-muted-foreground" />}
            </p>
            <span
              className={[
                "shrink-0 text-[11px] tabular-nums",
                c.unread > 0 ? "text-primary" : "text-muted-foreground",
              ].join(" ")}
            >
              {ts}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            {mine && !last?.deleted_at && (
              <CheckCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <p
              className={[
                "truncate text-[13px]",
                c.unread > 0 ? "text-foreground" : "text-muted-foreground",
              ].join(" ")}
            >
              {last ? preview : status}
            </p>
            {c.unread > 0 && (
              <span className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                {c.unread}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenMenu(!menuOpen);
          }}
          aria-label={`Options for ${name}`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition hover:bg-white/8 hover:text-foreground focus:opacity-100 group-hover:opacity-100"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => onOpenMenu(false)} />
          <div className="glass absolute right-3 top-12 z-40 w-52 overflow-hidden rounded-xl py-1 shadow-2xl">
            {item(<MailOpen className="h-4 w-4" />, "Mark as unread", onUnread)}
            {item(
              c.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />,
              c.pinned ? "Unpin" : "Pin",
              onPin,
            )}
            {item(
              c.muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />,
              c.muted ? "Unmute" : "Mute",
              onMute,
            )}
            {item(<Archive className="h-4 w-4" />, "Archive", onArchive)}
            <div className="my-1 h-px bg-border" />
            {item(<Trash2 className="h-4 w-4" />, "Delete chat", onDelete, true)}
            {item(<ShieldBan className="h-4 w-4" />, "Block contact", onBlock, true)}
          </div>
        </>
      )}
    </li>
  );
}

function ConfirmDialog({
  title,
  body,
  action,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  action: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="glass animate-rise-in w-full max-w-sm rounded-2xl p-5">
        <h2 className="text-base font-bold">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="press h-10 rounded-xl border border-border px-4 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="press h-10 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground"
          >
            {action}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="panel flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center">
      <div className="animate-breathe grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
        <Users className="h-6 w-6" />
      </div>
      <h2 className="text-base font-bold">No chats yet</h2>
      <p className="max-w-xs text-sm text-muted-foreground">Add a friend and start the conversation.</p>
      <Link
        to="/contacts"
        className="press mt-2 inline-flex h-10 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
      >
        Find friends
      </Link>
    </div>
  );
}
