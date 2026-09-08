import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  UserPlus,
  Users,
  UsersRound,
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
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, GhostMark } from "@/components/app-shell";
import { registerDevice } from "@/lib/devices.functions";
import { getMyProfile } from "@/lib/profile.functions";
import {
  listConversations,
  createGroupConversation,
  searchMessagesGlobal,
  setConversationFlags,
  markConversationUnread,
  leaveConversation,
  blockContact,
  markRead,
  type ConversationSummary,
} from "@/lib/chat.functions";
import { listFriendships, type FriendshipRow } from "@/lib/friendships.functions";
import { getDeviceKey, guessDeviceName } from "@/lib/device-key";
import { usePresence } from "@/components/presence-provider";
import { realtimeService } from "@/lib/realtime/create-realtime";

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
  const fetchFriendships = useServerFn(listFriendships);
  const doCreateGroup = useServerFn(createGroupConversation);
  const doFlags = useServerFn(setConversationFlags);
  const doUnread = useServerFn(markConversationUnread);
  const doLeave = useServerFn(leaveConversation);
  const doBlock = useServerFn(blockContact);
  const doMarkRead = useServerFn(markRead);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isUserOnline } = usePresence();

  const [showNewGroup, setShowNewGroup] = useState(false);

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
    refetchInterval: 3000,
  });

  // Realtime: any message insert refreshes conversation list
  useEffect(() => {
    if (!profile.data?.id) return;
    return realtimeService.subscribeInbox(profile.data.id, {
      onMessageInsert: () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
      },
      onFriendshipChange: () => {
        qc.invalidateQueries({ queryKey: ["friendships"] });
      },
    });
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

  const createGroup = useMutation({
    mutationFn: (v: { title: string; member_ids: string[] }) => doCreateGroup({ data: v }),
    onSuccess: (res) => {
      refresh();
      setShowNewGroup(false);
      navigate({ to: "/chats/$conversationId", params: { conversationId: res.conversation_id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create group"),
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
      online={isUserOnline(c.other?.id)}
      menuOpen={menuFor === c.id}
      onOpenMenu={(open) => setMenuFor(open ? c.id : null)}
      onOpen={() => {
        qc.setQueryData<ConversationSummary[]>(["conversations"], (old) => {
          if (!old) return old;
          return old.map((conv) => (conv.id === c.id ? { ...conv, unread: 0 } : conv));
        });
        doMarkRead({ data: { conversation_id: c.id, up_to_created_at: new Date().toISOString() } })
          .then(() => qc.invalidateQueries({ queryKey: ["conversations"] }))
          .catch(() => {});
        navigate({ to: "/chats/$conversationId", params: { conversationId: c.id } });
      }}
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
        <section className="flex min-w-0 flex-1 flex-col bg-background lg:max-w-[400px] lg:border-r lg:border-border">
          <header className="sticky top-0 z-20 border-b border-border bg-background/80 px-4 pb-3 pt-6 backdrop-blur-xl lg:pt-5">
            <div className="flex items-center justify-between">
              <h1 className="text-[22px] font-extrabold tracking-tight text-foreground">Chats</h1>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowNewGroup(true)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-surface-2 text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                  aria-label="New Group"
                  title="New group chat"
                >
                  <UsersRound className="h-[17px] w-[17px]" />
                </button>
                <Link
                  to="/contacts"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-white shadow-sm shadow-primary/30 transition hover:bg-[#1467D8]"
                  aria-label="Add friend"
                >
                  <UserPlus className="h-[17px] w-[17px]" />
                </Link>
              </div>
            </div>

            <div className="focus-ring mt-3 flex items-center gap-2.5 rounded-xl border border-border bg-surface-2/50 px-3.5 py-2 transition">
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
                placeholder="Search chats, people, or messages..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {q ? (
                <button
                  onClick={() => setQ("")}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-border"
                  aria-label="Clear"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <kbd className="hidden shrink-0 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground lg:block">
                  ⌘K
                </kbd>
              )}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-2 pb-6 pt-1">{renderResults()}</div>
        </section>

        {/* Desktop detail pane */}
        <section className="hidden flex-1 flex-col items-center justify-center bg-background px-10 lg:flex">
          <div className="max-w-xs animate-rise-in text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
              <GhostMark className="h-8 w-8" />
            </div>
            <h2 className="text-[17px] font-bold text-foreground">Select a chat to start messaging</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Your private Ghostline conversations live here.
            </p>
            <Link
              to="/contacts"
              className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-white shadow-sm shadow-primary/25 transition hover:bg-[#1467D8]"
            >
              Start a conversation
            </Link>
          </div>
        </section>
      </div>

      {confirm && (
        <ConfirmDialog
          title={
            confirm.kind === "delete"
              ? (confirm.conv.kind === "group" ? "Leave this group?" : "Delete this chat?")
              : "Block this contact?"
          }
          body={
            confirm.kind === "delete"
              ? (confirm.conv.kind === "group"
                  ? "You will leave this group conversation. You will no longer receive new messages from this group."
                  : "The conversation is removed from your list. Messages you already sent stay with the other person.")
              : "They won't be able to message or call you until you unblock them."
          }
          action={confirm.kind === "delete" ? (confirm.conv.kind === "group" ? "Leave" : "Delete") : "Block"}
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

      {showNewGroup && (
        <NewGroupSheet
          fetchFriendships={fetchFriendships}
          onClose={() => setShowNewGroup(false)}
          onSubmit={(title, memberIds) => createGroup.mutate({ title, member_ids: memberIds })}
          isPending={createGroup.isPending}
        />
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
  const isGroup = c.kind === "group";
  const name = isGroup
    ? (c.title ?? "Group chat")
    : (c.other?.display_name ?? c.other?.username ?? "Ghost");
  const last = c.last_message;
  const mine = last?.sender_id === meId;

  // Prefix sender name in group message previews when sent by another member
  const sender = isGroup && !mine && !last?.deleted_at && c.members?.find((m) => m.id === last?.sender_id);
  const senderName = sender ? (sender.display_name ?? sender.username) : null;

  const preview = last
    ? (last.deleted_at
        ? "Message deleted"
        : (senderName ? `${senderName}: ${last.body}` : last.body))
    : null;

  const ts = last
    ? new Date(last.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  const { getUserStatusLabel } = usePresence();
  // Groups must NEVER display individual presence status or "Offline"
  const directStatus = !isGroup ? getUserStatusLabel(c.other?.id, c.id, c.other?.last_seen) : "";
  const memberCount = Math.max(c.member_count ?? 0, c.members?.length ?? 0);
  const groupMeta = `${memberCount} ${memberCount === 1 ? "member" : "members"}`;

  const subtitle = preview ?? (isGroup ? groupMeta : (directStatus || "Say hi 👋"));
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
        className="group flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150 hover:bg-surface-2/70 active:bg-surface-2"
      >
        {/* Avatar: Direct = Circular (rounded-full), Group = Rounded-Square (rounded-2xl) */}
        <div className="relative shrink-0">
          {isGroup ? (
            c.avatar_url ? (
              <img
                src={c.avatar_url}
                alt={name}
                className="h-12 w-12 rounded-2xl object-cover ring-1 ring-border shadow-sm"
              />
            ) : (
              <div
                className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/12 text-primary shadow-sm ring-1 ring-border/50"
                title={`Group: ${name}`}
              >
                <UsersRound className="h-6 w-6 text-primary" aria-hidden="true" />
              </div>
            )
          ) : (
            <>
              {c.other?.avatar_url ? (
                <img
                  src={c.other.avatar_url}
                  alt={name}
                  className="h-12 w-12 rounded-full object-cover ring-1 ring-border shadow-sm"
                />
              ) : (
                <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/12 text-[15px] font-bold text-primary shadow-sm ring-1 ring-border/50">
                  {name.charAt(0).toUpperCase()}
                </div>
              )}
              {online && (
                <span
                  className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-background bg-success"
                  aria-label="Online"
                />
              )}
            </>
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 truncate text-[14px] font-semibold text-foreground">
              {c.pinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />}
              {isGroup && (
                <UsersRound
                  className="h-3.5 w-3.5 shrink-0 text-primary/70"
                  aria-hidden="true"
                />
              )}
              <span className="truncate">{name}</span>
              {c.muted && <BellOff className="h-3 w-3 shrink-0 text-muted-foreground" />}
            </p>
            <span
              className={[
                "shrink-0 text-[11px] tabular-nums",
                c.unread > 0 ? "font-semibold text-primary" : "text-muted-foreground",
              ].join(" ")}
            >
              {ts}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            {mine && !last?.deleted_at && (
              <CheckCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <p
              className={[
                "truncate text-[13px] leading-snug",
                c.unread > 0 ? "font-medium text-foreground" : "text-muted-foreground",
              ].join(" ")}
            >
              {subtitle}
            </p>
            {c.unread > 0 && (
              <span
                title={c.unread > 9 ? "9+ new messages" : `${c.unread} new messages`}
                aria-label={c.unread > 9 ? "9+ new messages" : `${c.unread} new messages`}
                className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white shadow-sm"
              >
                {c.unread > 9 ? "9+" : c.unread}
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
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition hover:bg-border focus:opacity-100 group-hover:opacity-100"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => onOpenMenu(false)} />
          <div className="absolute right-3 top-12 z-40 w-52 overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground py-1.5 shadow-xl shadow-black/10">
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
            {isGroup ? (
              item(<Trash2 className="h-4 w-4" />, "Leave group", onDelete, true)
            ) : (
              <>
                {item(<Trash2 className="h-4 w-4" />, "Delete chat", onDelete, true)}
                {item(<ShieldBan className="h-4 w-4" />, "Block contact", onBlock, true)}
              </>
            )}
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
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="card-elevated animate-rise-in w-full max-w-sm rounded-2xl p-6">
        <h2 className="text-[15px] font-bold text-foreground">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
        <div className="mt-5 flex justify-end gap-2.5">
          <button
            onClick={onCancel}
            className="h-10 rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="h-10 rounded-xl bg-destructive px-4 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
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
    <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center">
      <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Users className="h-7 w-7" />
      </div>
      <h2 className="text-[15px] font-bold text-foreground">No chats yet</h2>
      <p className="max-w-[200px] text-[13px] leading-relaxed text-muted-foreground">Add a friend and start your first conversation.</p>
      <Link
        to="/contacts"
        className="mt-2 inline-flex h-10 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-white shadow-sm shadow-primary/25 transition hover:bg-[#1467D8]"
      >
        Find friends
      </Link>
    </div>
  );
}

function NewGroupSheet({
  fetchFriendships,
  onClose,
  onSubmit,
  isPending,
}: {
  fetchFriendships: () => Promise<{ friendships: FriendshipRow[]; profiles: Record<string, unknown> }>;
  onClose: () => void;
  onSubmit: (title: string, memberIds: string[]) => void;
  isPending: boolean;
}) {
  const fetchProfile = useServerFn(getMyProfile);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchProfile() });
  const friendships = useQuery({ queryKey: ["friendships-for-group"], queryFn: () => fetchFriendships() });
  
  const meId = me.data?.id;
  const accepted = (friendships.data?.friendships ?? []).filter((f) => f.status === "accepted");
  const profilesMap = (friendships.data?.profiles ?? {}) as Record<string, { display_name?: string | null; username?: string | null }>;

  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const canSubmit = title.trim().length > 0 && picked.size > 0 && !isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass w-full max-w-md rounded-t-3xl border border-border p-4 shadow-2xl animate-scale-in max-h-[85vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">New Group</h3>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Group name…"
            maxLength={100}
            className="w-full rounded-xl border border-border bg-surface-2/60 px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Add members ({picked.size} selected)
        </p>
        <ul className="mt-2 flex-1 overflow-y-auto grid gap-1 pb-2">
          {friendships.isPending && (
            <li className="py-8 text-center text-sm text-muted-foreground">Loading friends…</li>
          )}
          {!friendships.isPending && accepted.length === 0 && (
            <li className="py-8 text-center text-sm text-muted-foreground">No friends to add yet.</li>
          )}
          {accepted.map((f) => {
            const friendId = f.requester_id === meId ? f.addressee_id : f.requester_id;
            const prof = profilesMap[friendId];
            const name = prof?.display_name ?? prof?.username ?? "Ghost Friend";
            const handle = prof?.username ? `@${prof.username}` : undefined;
            const on = picked.has(friendId);

            return (
              <li key={f.id}>
                <button
                  onClick={() => toggle(friendId)}
                  className={[
                    "flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition",
                    on ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-secondary/70",
                  ].join(" ")}
                >
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/20 font-bold text-primary text-sm">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{name}</p>
                    {handle && <p className="truncate text-[11px] text-muted-foreground">{handle}</p>}
                  </div>
                  {on && <Check className="h-4 w-4 text-primary" />}
                </button>
              </li>
            );
          })}
        </ul>

        <button
          onClick={() => onSubmit(title.trim(), Array.from(picked))}
          disabled={!canSubmit}
          className="mt-3 h-11 rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-40"
        >
          {isPending ? "Creating…" : `Create group (${picked.size} member${picked.size === 1 ? "" : "s"})`}
        </button>
      </div>
    </div>
  );
}
