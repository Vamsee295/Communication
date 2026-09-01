import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Send,
  Check,
  CheckCheck,
  Phone,
  Video,
  MoreVertical,
  Reply,
  Copy,
  Forward,
  Trash2,
  Info,
  Smile,
  Pencil,
  Pin,
  PinOff,
  Star,
  X,
  Search,
  ChevronUp,
  ChevronDown,
  CheckSquare,
  Lock,
} from "lucide-react";
import {
  getConversation,
  listMessages,
  sendMessage,
  markRead,
  listMyMessageReceipts,
  hideMessageForMe,
  deleteMessageForEveryone,
  editMessage,
  toggleReaction,
  listReactions,
  listPins,
  pinMessage,
  unpinMessage,
  toggleStar,
  listMyStarIds,
  listConversations,
  forwardMessages,
  getMessagesByIds,
  getMessageInfo,
  searchMessagesInConversation,
  type MessageRow,
  type ChatProfile,
} from "@/lib/chat.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";
import { usePresence, statusLabel } from "@/components/presence-provider";
import { useCalls } from "@/components/calls/call-provider";

export const Route = createFileRoute("/_authenticated/chats/$conversationId")({
  component: ChatRoom,
});

type OptimisticMsg = MessageRow & { pending?: boolean; failed?: boolean };
type MenuState = { id: string; mine: boolean; x: number; y: number; msg: MessageRow } | null;

const QUICK_EMOJI = ["❤️", "😂", "😮", "😢", "👍", "🔥"];

function ChatRoom() {
  const { conversationId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fetchConv = useServerFn(getConversation);
  const fetchMessages = useServerFn(listMessages);
  const fetchReceipts = useServerFn(listMyMessageReceipts);
  const fetchProfile = useServerFn(getMyProfile);
  const fetchReactions = useServerFn(listReactions);
  const fetchPins = useServerFn(listPins);
  const fetchStarIds = useServerFn(listMyStarIds);
  const fetchConversationsList = useServerFn(listConversations);
  const fetchMsgsByIds = useServerFn(getMessagesByIds);
  const fetchMessageInfo = useServerFn(getMessageInfo);
  const doSend = useServerFn(sendMessage);
  const doMarkRead = useServerFn(markRead);
  const doHide = useServerFn(hideMessageForMe);
  const doDeleteAll = useServerFn(deleteMessageForEveryone);
  const doEdit = useServerFn(editMessage);
  const doReact = useServerFn(toggleReaction);
  const doPin = useServerFn(pinMessage);
  const doUnpin = useServerFn(unpinMessage);
  const doStar = useServerFn(toggleStar);
  const doForward = useServerFn(forwardMessages);
  const doSearch = useServerFn(searchMessagesInConversation);

  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchProfile() });

  const conv = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => fetchConv({ data: { conversation_id: conversationId } }),
  });

  const messages = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => fetchMessages({ data: { conversation_id: conversationId, limit: 50 } }),
  });

  const receipts = useQuery({
    queryKey: ["receipts", conversationId],
    queryFn: () => fetchReceipts({ data: { conversation_id: conversationId } }),
    refetchInterval: 15000,
  });

  const reactions = useQuery({
    queryKey: ["reactions", conversationId],
    queryFn: () => fetchReactions({ data: { conversation_id: conversationId } }),
  });

  const pins = useQuery({
    queryKey: ["pins", conversationId],
    queryFn: () => fetchPins({ data: { conversation_id: conversationId } }),
  });

  const stars = useQuery({
    queryKey: ["stars-in-conv", conversationId],
    queryFn: () => fetchStarIds({ data: { conversation_id: conversationId } }),
  });

  const [optimistic, setOptimistic] = useState<OptimisticMsg[]>([]);
  const [typingOther, setTypingOther] = useState<number | null>(null);
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [locallyGone, setLocallyGone] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<MenuState>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; mine: boolean } | null>(null);
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<MessageRow | null>(null);
  const [editing, setEditing] = useState<MessageRow | null>(null);
  const [forwardFrom, setForwardFrom] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectMode = selected.size > 0;
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<string[]>([]);
  const [searchIdx, setSearchIdx] = useState(0);
  const [pinsCollapsed, setPinsCollapsed] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [headerMenu, setHeaderMenu] = useState(false);

  const composerRef = useRef<HTMLTextAreaElement>(null);
  const keyboardInset = useKeyboardInset();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bubbleRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  const meId = me.data?.id;
  const otherId = conv.data?.other?.id;
  const { onlineIds } = usePresence();
  const { startCall } = useCalls();

  // Preview cache for reply targets outside window
  const [previewCache, setPreviewCache] = useState<Map<string, MessageRow>>(new Map());

  const rendered = useMemo(() => {
    const server = (messages.data ?? []).filter((m) => !locallyGone.has(m.id));
    const seen = new Set(server.map((m) => m.client_id).filter(Boolean) as string[]);
    const pending = optimistic.filter((m) => !(m.client_id && seen.has(m.client_id)));
    return [...server, ...pending].sort((a, b) =>
      a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
    );
  }, [messages.data, optimistic, locallyGone]);

  const messageById = useMemo(() => {
    const m = new Map<string, MessageRow>();
    for (const r of rendered) m.set(r.id, r);
    for (const [k, v] of previewCache) if (!m.has(k)) m.set(k, v);
    return m;
  }, [rendered, previewCache]);

  // Fetch missing reply-target previews
  useEffect(() => {
    const missing = new Set<string>();
    for (const m of rendered) {
      if (m.reply_to_id && !messageById.has(m.reply_to_id)) missing.add(m.reply_to_id);
    }
    if (missing.size === 0) return;
    fetchMsgsByIds({ data: { ids: Array.from(missing) } })
      .then((rows) => {
        setPreviewCache((prev) => {
          const n = new Map(prev);
          for (const r of rows) n.set(r.id, r);
          return n;
        });
      })
      .catch(() => {});
  }, [rendered, messageById, fetchMsgsByIds]);

  const receiptByMsg = useMemo(() => {
    const map = new Map<string, { delivered_at: string | null; read_at: string | null }>();
    for (const r of receipts.data ?? []) {
      map.set(r.message_id, { delivered_at: r.delivered_at, read_at: r.read_at });
    }
    return map;
  }, [receipts.data]);

  const reactionsByMsg = useMemo(() => {
    const map = new Map<string, { emoji: string; count: number; mine: boolean }[]>();
    for (const r of reactions.data ?? []) {
      const bucket = map.get(r.message_id) ?? [];
      const found = bucket.find((b) => b.emoji === r.emoji);
      if (found) {
        found.count += 1;
        if (r.user_id === meId) found.mine = true;
      } else {
        bucket.push({ emoji: r.emoji, count: 1, mine: r.user_id === meId });
      }
      map.set(r.message_id, bucket);
    }
    return map;
  }, [reactions.data, meId]);

  const starSet = useMemo(() => new Set(stars.data ?? []), [stars.data]);
  const pinnedIds = useMemo(
    () => new Set((pins.data?.pins ?? []).map((p) => p.message_id)),
    [pins.data],
  );

  const collapseAndForget = useCallback(
    (id: string) => {
      setRemovingIds((s) => new Set(s).add(id));
      setTimeout(() => {
        setLocallyGone((s) => new Set(s).add(id));
        setRemovingIds((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
        qc.invalidateQueries({ queryKey: ["messages", conversationId] });
        qc.invalidateQueries({ queryKey: ["conversations"] });
      }, 260);
    },
    [conversationId, qc],
  );

  // Realtime
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [channelReady, setChannelReady] = useState(false);
  useEffect(() => {
    if (!meId) return;
    setChannelReady(false);
    const channel = supabase
      .channel(`chat:conv:${conversationId}`, {
        config: { presence: { key: meId }, broadcast: { self: false } },
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["messages", conversationId] });
          qc.invalidateQueries({ queryKey: ["conversations"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        () => qc.invalidateQueries({ queryKey: ["messages", conversationId] }),
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const oldId = (payload.old as { id?: string } | undefined)?.id;
          if (oldId) collapseAndForget(oldId);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_receipts" },
        () => qc.invalidateQueries({ queryKey: ["receipts", conversationId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        () => qc.invalidateQueries({ queryKey: ["reactions", conversationId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pinned_messages", filter: `conversation_id=eq.${conversationId}` },
        () => qc.invalidateQueries({ queryKey: ["pins", conversationId] }),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_hidden", filter: `user_id=eq.${meId}` },
        (payload) => {
          const mid = (payload.new as { message_id?: string } | undefined)?.message_id;
          if (mid) collapseAndForget(mid);
        },
      )
      .on("broadcast", { event: "typing" }, (payload) => {
        const uid = (payload.payload as { user_id?: string })?.user_id;
        if (uid && uid !== meId) setTypingOther(Date.now());
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, unknown>;
        setPresentIds(new Set(Object.keys(state).filter((k) => k !== meId)));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: meId, at: Date.now() });
          setChannelReady(true);
        }
      });

    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      setChannelReady(false);
      supabase.removeChannel(channel);
    };
  }, [conversationId, meId, qc, collapseAndForget]);

  useEffect(() => {
    if (!typingOther) return;
    const t = setTimeout(() => setTypingOther(null), 3000);
    return () => clearTimeout(t);
  }, [typingOther]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || searchOpen) return;
    el.scrollTop = el.scrollHeight;
  }, [rendered.length, searchOpen]);

  useEffect(() => {
    if (!rendered.length) return;
    const last = rendered[rendered.length - 1];
    doMarkRead({ data: { conversation_id: conversationId, up_to_created_at: last.created_at } })
      .then(() => qc.invalidateQueries({ queryKey: ["conversations"] }))
      .catch(() => {});
  }, [rendered.length, conversationId, doMarkRead, qc]);

  const send = useMutation({
    mutationFn: async (body: string) => {
      const client_id = crypto.randomUUID();
      const pending: OptimisticMsg = {
        id: client_id,
        conversation_id: conversationId,
        sender_id: meId!,
        body,
        client_id,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        reply_to_id: replyTo?.id ?? null,
        forwarded_from_id: null,
        pending: true,
      };
      setOptimistic((prev) => [...prev, pending]);
      const parentId = replyTo?.id ?? null;
      setReplyTo(null);
      try {
        const row = await doSend({
          data: {
            conversation_id: conversationId,
            body,
            client_id,
            reply_to_id: parentId,
          },
        });
        qc.invalidateQueries({ queryKey: ["messages", conversationId] });
        setOptimistic((prev) => prev.filter((m) => m.client_id !== client_id));
        return row;
      } catch (err) {
        setOptimistic((prev) =>
          prev.map((m) => (m.client_id === client_id ? { ...m, pending: false, failed: true } : m)),
        );
        throw err;
      }
    },
  });

  const commitEdit = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      await doEdit({ data: { message_id: id, body } });
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    },
    onSuccess: () => setEditing(null),
    onError: () => showToast("Couldn't save edit"),
  });

  const lastTypingAt = useRef(0);
  const notifyTyping = useCallback(() => {
    const ch = channelRef.current;
    if (!ch || !channelReady || !meId) return;
    const now = Date.now();
    if (now - lastTypingAt.current < 1500) return;
    lastTypingAt.current = now;
    ch.send({ type: "broadcast", event: "typing", payload: { user_id: meId } });
  }, [channelReady, meId]);

  const [text, setText] = useState("");

  useEffect(() => {
    if (editing) {
      setText(editing.body);
      composerRef.current?.focus();
    }
  }, [editing]);

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    if (editing) {
      commitEdit.mutate({ id: editing.id, body });
      setText("");
      return;
    }
    setText("");
    send.mutate(body);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const doDeleteForMe = async (ids: string[]) => {
    for (const id of ids) collapseAndForget(id);
    try {
      await Promise.all(ids.map((id) => doHide({ data: { message_id: id } })));
    } catch {
      showToast("Couldn't delete — try again");
    }
  };

  const doDeleteForAll = async (id: string) => {
    collapseAndForget(id);
    try {
      await doDeleteAll({ data: { message_id: id } });
    } catch {
      showToast("Couldn't delete for everyone");
    }
  };

  const scrollToMessage = (id: string) => {
    const el = bubbleRefs.current.get(id);
    if (!el) {
      showToast("Message not in view — scroll up");
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.animate(
      [
        { boxShadow: "0 0 0 3px oklch(0.92 0.19 100 / 0.6)" },
        { boxShadow: "0 0 0 0 transparent" },
      ],
      { duration: 1400, easing: "ease-out" },
    );
  };

  const openMenu = (e: React.MouseEvent, m: MessageRow) => {
    e.preventDefault();
    if (selectMode) {
      toggleSelect(m.id);
      return;
    }
    setMenu({ id: m.id, mine: m.sender_id === meId, x: e.clientX, y: e.clientY, msg: m });
  };

  const longPress = (m: MessageRow) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return {
      onTouchStart: (e: React.TouchEvent) => {
        const t = e.touches[0];
        timer = setTimeout(() => {
          if (selectMode) {
            toggleSelect(m.id);
          } else {
            setMenu({ id: m.id, mine: m.sender_id === meId, x: t.clientX, y: t.clientY, msg: m });
          }
        }, 450);
      },
      onTouchEnd: () => { if (timer) clearTimeout(timer); },
      onTouchMove: () => { if (timer) clearTimeout(timer); },
    };
  };

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const runSearch = async (q: string) => {
    if (!q.trim()) {
      setSearchHits([]);
      setSearchIdx(0);
      return;
    }
    try {
      const hits = await doSearch({ data: { conversation_id: conversationId, q } });
      const ids = hits.map((h) => h.id);
      setSearchHits(ids);
      setSearchIdx(0);
      if (ids[0]) scrollToMessage(ids[0]);
    } catch {
      showToast("Search failed");
    }
  };

  const nextHit = () => {
    if (searchHits.length === 0) return;
    const n = (searchIdx + 1) % searchHits.length;
    setSearchIdx(n);
    scrollToMessage(searchHits[n]);
  };
  const prevHit = () => {
    if (searchHits.length === 0) return;
    const n = (searchIdx - 1 + searchHits.length) % searchHits.length;
    setSearchIdx(n);
    scrollToMessage(searchHits[n]);
  };

  const otherProfile = conv.data?.other ?? null;
  const isOnline = (otherId ? presentIds.has(otherId) : false) || (!!otherId && onlineIds.has(otherId));
  const pinnedMessages = pins.data?.messages ?? [];

  const ring = (type: "voice" | "video") => {
    if (!otherId) return;
    void startCall({
      conversationId,
      peerId: otherId,
      peer: otherProfile
        ? {
            id: otherProfile.id,
            username: otherProfile.username,
            display_name: otherProfile.display_name,
            avatar_url: otherProfile.avatar_url,
          }
        : null,
      type,
    });
  };


  return (
    <div
      className="flex flex-col overscroll-none"
      style={{ height: `calc(100dvh - ${keyboardInset}px)` }}
    >
      <header className="glass sticky top-0 z-30 flex items-center gap-1 px-2 py-2.5 sm:gap-2 sm:px-3">
        <button
          onClick={() => navigate({ to: "/chats" })}
          className="press grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="relative shrink-0">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-surface-2 font-bold text-primary ring-1 ring-border">
            {(otherProfile?.display_name ?? otherProfile?.username ?? "?").charAt(0).toUpperCase()}
          </div>
          {isOnline && (
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">
            {otherProfile?.display_name ?? otherProfile?.username ?? "Ghost"}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {otherProfile?.username && <span>@{otherProfile.username} · </span>}
            <span className={isOnline ? "text-emerald-400" : ""}>
              {statusLabel(isOnline, otherProfile?.last_seen)}
            </span>
          </p>
        </div>

        <button
          onClick={() => setPrivacyOpen((v) => !v)}
          className="press hidden shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground sm:flex"
          aria-label="Privacy information"
        >
          <Lock className="h-3 w-3 text-primary" /> Private
        </button>
        <button
          onClick={() => {
            setSearchOpen((v) => !v);
            setSearchQ("");
            setSearchHits([]);
          }}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-white/10"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          onClick={() => ring("voice")}
          disabled={!otherId}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-white/10 disabled:opacity-40"
          aria-label="Voice call"
        >
          <Phone className="h-4 w-4" />
        </button>
        <button
          onClick={() => ring("video")}
          disabled={!otherId}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-white/10 disabled:opacity-40"
          aria-label="Video call"
        >
          <Video className="h-4 w-4" />
        </button>
        <button
          onClick={() => setHeaderMenu((v) => !v)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-white/10"
          aria-label="More"
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {privacyOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setPrivacyOpen(false)} />
            <div className="glass absolute right-3 top-14 z-50 w-72 rounded-xl p-4 text-[12px] leading-relaxed text-muted-foreground shadow-2xl">
              <p className="mb-1 text-[13px] font-bold text-foreground">How this chat is protected</p>
              Voice and video calls connect peer-to-peer and are encrypted in transit (DTLS-SRTP) — they
              are never recorded. Messages are encrypted in transit and only members of this
              conversation can read them. End-to-end encryption for messages is not enabled yet.
            </div>
          </>
        )}

        {headerMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setHeaderMenu(false)} />
            <div className="glass absolute right-3 top-14 z-50 w-52 overflow-hidden rounded-xl py-1 shadow-2xl">
              <button
                onClick={() => {
                  setHeaderMenu(false);
                  setPinsCollapsed((v) => !v);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-surface-2"
              >
                <Pin className="h-4 w-4" /> {pinsCollapsed ? "Show pinned" : "Hide pinned"}
              </button>
              <button
                onClick={() => {
                  setHeaderMenu(false);
                  setPrivacyOpen(true);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-surface-2"
              >
                <Lock className="h-4 w-4" /> Privacy details
              </button>
            </div>
          </>
        )}
      </header>

      {searchOpen && (
        <div className="glass sticky top-[68px] z-20 flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch(searchQ);
              if (e.key === "Escape") setSearchOpen(false);
            }}
            placeholder="Search in chat"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {searchHits.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {searchIdx + 1}/{searchHits.length}
            </span>
          )}
          <button onClick={prevHit} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10" aria-label="Prev">
            <ChevronUp className="h-4 w-4" />
          </button>
          <button onClick={nextHit} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10" aria-label="Next">
            <ChevronDown className="h-4 w-4" />
          </button>
          <button onClick={() => setSearchOpen(false)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {pinnedMessages.length > 0 && !pinsCollapsed && (
        <button
          onClick={() => scrollToMessage(pinnedMessages[0].id)}
          className="glass sticky top-[68px] z-20 flex w-full items-center gap-2 border-b border-border px-4 py-2 text-left"
        >
          <Pin className="h-4 w-4 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Pinned · {pinnedMessages.length}
            </p>
            <p className="truncate text-xs">{pinnedMessages[0].body}</p>
          </div>
          <span
            onClick={(e) => { e.stopPropagation(); setPinsCollapsed(true); }}
            className="grid h-7 w-7 cursor-pointer place-items-center rounded-full hover:bg-white/10"
            aria-label="Hide pins"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        </button>
      )}

      {selectMode && (
        <div className="glass sticky top-[68px] z-20 flex items-center gap-2 border-b border-border px-3 py-2">
          <button onClick={() => setSelected(new Set())} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
          <p className="flex-1 text-sm font-semibold">{selected.size} selected</p>
          <button
            onClick={() => setForwardFrom(Array.from(selected))}
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10"
            aria-label="Forward"
          >
            <Forward className="h-4 w-4" />
          </button>
          <button
            onClick={async () => {
              await Promise.all(Array.from(selected).map((id) => doStar({ data: { message_id: id } })));
              qc.invalidateQueries({ queryKey: ["stars-in-conv", conversationId] });
              setSelected(new Set());
              showToast("Starred");
            }}
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10"
            aria-label="Star"
          >
            <Star className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              const text = Array.from(selected)
                .map((id) => messageById.get(id)?.body ?? "")
                .filter(Boolean)
                .join("\n");
              navigator.clipboard.writeText(text).then(() => showToast("Copied")).catch(() => {});
              setSelected(new Set());
            }}
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10"
            aria-label="Copy"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              doDeleteForMe(Array.from(selected));
              setSelected(new Set());
            }}
            className="grid h-8 w-8 place-items-center rounded-full text-destructive hover:bg-white/10"
            aria-label="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4">
        <ul className="mx-auto flex max-w-md flex-col gap-1.5">
          {rendered.map((m, i) => {
            const mine = m.sender_id === meId;
            const prev = rendered[i - 1];
            const grouped = prev && prev.sender_id === m.sender_id;
            const receipt = mine ? receiptByMsg.get(m.id) : undefined;
            const removing = removingIds.has(m.id);
            const rlist = reactionsByMsg.get(m.id) ?? [];
            const isPinned = pinnedIds.has(m.id);
            const isStarred = starSet.has(m.id);
            const isSelected = selected.has(m.id);
            const parent = m.reply_to_id ? messageById.get(m.reply_to_id) : null;
            const isSearchHit = searchHits[searchIdx] === m.id;

            return (
              <li
                key={m.id}
                ref={(el) => {
                  if (el) bubbleRefs.current.set(m.id, el);
                  else bubbleRefs.current.delete(m.id);
                }}
                className={[
                  "flex overflow-hidden transition-all duration-[260ms] ease-out",
                  mine ? "justify-end" : "justify-start",
                  grouped ? "mt-0" : "mt-2",
                  removing ? "max-h-0 -translate-y-1 scale-95 opacity-0" : "max-h-none opacity-100",
                  isSelected ? "bg-primary/10 rounded-xl" : "",
                ].join(" ")}
              >
                <div className={["flex max-w-[85%] flex-col gap-0.5", mine ? "items-end" : "items-start"].join(" ")}>
                  <div
                    onClick={() => selectMode && toggleSelect(m.id)}
                    onContextMenu={(e) => openMenu(e, m)}
                    {...longPress(m)}
                    className={[
                      "cursor-default select-none rounded-2xl px-3.5 py-2 text-sm leading-snug shadow",
                      mine ? "bg-primary text-primary-foreground rounded-br-md" : "glass rounded-bl-md",
                      (m as OptimisticMsg).pending ? "opacity-60" : "",
                      (m as OptimisticMsg).failed ? "opacity-60 ring-1 ring-destructive" : "",
                      isSearchHit ? "ring-2 ring-primary" : "",
                    ].join(" ")}
                  >
                    {m.forwarded_from_id && (
                      <p className={["mb-1 flex items-center gap-1 text-[10px] italic", mine ? "opacity-80" : "text-muted-foreground"].join(" ")}>
                        <Forward className="h-2.5 w-2.5" /> Forwarded
                      </p>
                    )}
                    {parent && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); scrollToMessage(parent.id); }}
                        className={[
                          "mb-1 block w-full rounded-lg border-l-2 px-2 py-1 text-left text-[11px]",
                          mine ? "border-primary-foreground/60 bg-primary-foreground/10" : "border-primary bg-white/5",
                        ].join(" ")}
                      >
                        <p className="line-clamp-2">{parent.body}</p>
                      </button>
                    )}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <div className={["mt-0.5 flex items-center justify-end gap-1 text-[10px]", mine ? "opacity-70" : "text-muted-foreground"].join(" ")}>
                      {isPinned && <Pin className="h-2.5 w-2.5" />}
                      {isStarred && <Star className="h-2.5 w-2.5 fill-current" />}
                      {m.edited_at && <span className="italic">edited</span>}
                      <span>
                        {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {mine && (
                        (m as OptimisticMsg).pending ? (
                          <span>…</span>
                        ) : receipt?.read_at ? (
                          <CheckCheck className="h-3 w-3" />
                        ) : receipt?.delivered_at ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Check className="h-3 w-3 opacity-50" />
                        )
                      )}
                    </div>
                  </div>
                  {rlist.length > 0 && (
                    <div className={["flex flex-wrap gap-1", mine ? "justify-end" : "justify-start"].join(" ")}>
                      {rlist.map((r) => (
                        <button
                          key={r.emoji}
                          onClick={async () => {
                            await doReact({ data: { message_id: m.id, emoji: r.emoji } });
                            qc.invalidateQueries({ queryKey: ["reactions", conversationId] });
                          }}
                          className={[
                            "glass flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
                            r.mine ? "ring-1 ring-primary" : "",
                          ].join(" ")}
                        >
                          <span>{r.emoji}</span>
                          <span className="text-muted-foreground">{r.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
          {typingOther && (
            <li className="flex justify-start">
              <div className="glass flex items-center gap-1 rounded-2xl rounded-bl-md px-3 py-2">
                <Dot delay="0ms" />
                <Dot delay="150ms" />
                <Dot delay="300ms" />
              </div>
            </li>
          )}
        </ul>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="sticky bottom-0 z-20 bg-background/80 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur"
      >
        <div className="mx-auto max-w-md">
          {(replyTo || editing) && (
            <div className="glass mb-1.5 flex items-center gap-2 rounded-2xl border-l-2 border-primary px-3 py-2">
              {editing ? <Pencil className="h-3.5 w-3.5 text-primary" /> : <Reply className="h-3.5 w-3.5 text-primary" />}
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">
                  {editing ? "Editing" : "Replying to"}
                </p>
                <p className="truncate text-xs">{(editing ?? replyTo)?.body}</p>
              </div>
              <button
                type="button"
                onClick={() => { setReplyTo(null); setEditing(null); setText(""); }}
                className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={composerRef}
              value={text}
              onChange={(e) => { setText(e.target.value); notifyTyping(); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
              }}
              rows={1}
              placeholder={editing ? "Edit message" : "Message"}
              className="glass max-h-32 min-h-11 flex-1 resize-none rounded-3xl px-4 py-3 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={!text.trim() || send.isPending || commitEdit.isPending}
              className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground glow-primary disabled:opacity-40"
              aria-label={editing ? "Save" : "Send"}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </form>

      {menu && (
        <ContextMenu
          menu={menu}
          isPinned={pinnedIds.has(menu.id)}
          isStarred={starSet.has(menu.id)}
          onClose={() => setMenu(null)}
          onReact={async (emoji) => {
            await doReact({ data: { message_id: menu.id, emoji } });
            qc.invalidateQueries({ queryKey: ["reactions", conversationId] });
          }}
          onReply={() => setReplyTo(menu.msg)}
          onEdit={() => setEditing(menu.msg)}
          onCopy={async () => {
            try { await navigator.clipboard.writeText(menu.msg.body); showToast("Copied"); }
            catch { showToast("Copy failed"); }
          }}
          onForward={() => setForwardFrom([menu.id])}
          onSelect={() => toggleSelect(menu.id)}
          onDelete={() => setConfirmDelete({ id: menu.id, mine: menu.mine })}
          onInfo={() => setInfoFor(menu.id)}
          onPin={async () => {
            try {
              if (pinnedIds.has(menu.id)) {
                await doUnpin({ data: { conversation_id: conversationId, message_id: menu.id } });
                showToast("Unpinned");
              } else {
                await doPin({ data: { conversation_id: conversationId, message_id: menu.id } });
                showToast("Pinned");
                setPinsCollapsed(false);
              }
              qc.invalidateQueries({ queryKey: ["pins", conversationId] });
            } catch (e) {
              showToast(e instanceof Error ? e.message : "Pin failed");
            }
          }}
          onStar={async () => {
            const res = await doStar({ data: { message_id: menu.id } });
            qc.invalidateQueries({ queryKey: ["stars-in-conv", conversationId] });
            qc.invalidateQueries({ queryKey: ["starred"] });
            showToast(res.starred ? "Starred" : "Unstarred");
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteDialog
          mine={confirmDelete.mine}
          onCancel={() => setConfirmDelete(null)}
          onDeleteForMe={() => {
            const id = confirmDelete.id;
            setConfirmDelete(null);
            void doDeleteForMe([id]);
          }}
          onDeleteForEveryone={() => {
            const id = confirmDelete.id;
            setConfirmDelete(null);
            void doDeleteForAll(id);
          }}
        />
      )}

      {infoFor && (
        <InfoDialog
          messageId={infoFor}
          fetchInfo={fetchMessageInfo}
          onClose={() => setInfoFor(null)}
        />
      )}

      {forwardFrom && (
        <ForwardSheet
          fetchConversations={fetchConversationsList}
          currentConversationId={conversationId}
          messageIds={forwardFrom}
          onClose={() => setForwardFrom(null)}
          onSend={async (convIds) => {
            try {
              const res = await doForward({ data: { message_ids: forwardFrom, conversation_ids: convIds } });
              setForwardFrom(null);
              setSelected(new Set());
              qc.invalidateQueries({ queryKey: ["conversations"] });
              showToast(`Forwarded to ${res.count} chat${res.count === 1 ? "" : "s"}`);
            } catch {
              showToast("Forward failed");
            }
          }}
          me={me.data as { id: string } | undefined}
          selfProfile={otherProfile}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center">
          <div className="glass rounded-full px-4 py-2 text-xs font-medium shadow-lg">{toast}</div>
        </div>
      )}
    </div>
  );
}

function ContextMenu({
  menu,
  isPinned,
  isStarred,
  onClose,
  onReact,
  onReply,
  onEdit,
  onCopy,
  onForward,
  onSelect,
  onDelete,
  onInfo,
  onPin,
  onStar,
}: {
  menu: NonNullable<MenuState>;
  isPinned: boolean;
  isStarred: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onForward: () => void;
  onSelect: () => void;
  onDelete: () => void;
  onInfo: () => void;
  onPin: () => void;
  onStar: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const W = 220;
  const H = 400;
  const left = Math.min(menu.x, window.innerWidth - W - 8);
  const top = Math.min(menu.y, window.innerHeight - H - 8);

  const Item = ({
    icon: Icon,
    label,
    onClick,
    danger,
  }: {
    icon: typeof Reply;
    label: string;
    onClick: () => void;
    danger?: boolean;
  }) => (
    <button
      onClick={() => { onClick(); onClose(); }}
      className={[
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-white/10",
        danger ? "text-destructive" : "",
      ].join(" ")}
    >
      <Icon className="h-4 w-4 opacity-80" />
      <span className="font-medium">{label}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-40 animate-fade-in">
      <div
        ref={ref}
        style={{ left, top, width: W }}
        className="glass absolute rounded-xl border border-border p-1.5 shadow-2xl animate-scale-in"
      >
        <div className="flex justify-around px-1 py-1">
          {QUICK_EMOJI.map((e) => (
            <button
              key={e}
              onClick={() => { onReact(e); onClose(); }}
              className="grid h-8 w-8 place-items-center rounded-full text-lg transition hover:scale-125 hover:bg-white/10"
            >
              {e}
            </button>
          ))}
        </div>
        <div className="my-1 h-px bg-border" />
        <Item icon={Reply} label="Reply" onClick={onReply} />
        {menu.mine && <Item icon={Pencil} label="Edit" onClick={onEdit} />}
        <Item icon={Copy} label="Copy" onClick={onCopy} />
        <Item icon={Forward} label="Forward" onClick={onForward} />
        <Item icon={isPinned ? PinOff : Pin} label={isPinned ? "Unpin" : "Pin"} onClick={onPin} />
        <Item icon={Star} label={isStarred ? "Unstar" : "Star"} onClick={onStar} />
        <Item icon={CheckSquare} label="Select" onClick={onSelect} />
        {menu.mine && <Item icon={Info} label="Info" onClick={onInfo} />}
        <div className="my-1 h-px bg-border" />
        <Item icon={Trash2} label="Delete" onClick={onDelete} danger />
      </div>
    </div>
  );
}

function ConfirmDeleteDialog({
  mine,
  onCancel,
  onDeleteForMe,
  onDeleteForEveryone,
}: {
  mine: boolean;
  onCancel: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 animate-fade-in sm:items-center" onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass w-full max-w-sm rounded-3xl border border-border p-5 shadow-2xl animate-scale-in"
      >
        <h3 className="text-lg font-bold">Delete message?</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {mine
            ? "Choose who to delete this message for. This can't be undone."
            : "This message will be removed from your chat history on all your devices."}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          {mine && (
            <button
              onClick={onDeleteForEveryone}
              className="h-11 rounded-full bg-destructive font-semibold text-destructive-foreground transition hover:opacity-90"
            >
              Delete for everyone
            </button>
          )}
          <button
            onClick={onDeleteForMe}
            className="h-11 rounded-full bg-primary font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Delete for me
          </button>
          <button onClick={onCancel} className="h-11 rounded-full border border-border font-semibold transition hover:bg-white/5">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoDialog({
  messageId,
  fetchInfo,
  onClose,
}: {
  messageId: string;
  fetchInfo: (args: { data: { message_id: string } }) => Promise<{
    message: { id: string; created_at: string; body: string; edited_at: string | null };
    receipts: Array<{ user_id: string; delivered_at: string | null; read_at: string | null }>;
    edits: Array<{ previous_body: string; edited_at: string }>;
  }>;
  onClose: () => void;
}) {
  const info = useQuery({
    queryKey: ["message-info", messageId],
    queryFn: () => fetchInfo({ data: { message_id: messageId } }),
  });

  const delivered = info.data?.receipts.find((r) => r.delivered_at)?.delivered_at ?? null;
  const read = info.data?.receipts.find((r) => r.read_at)?.read_at ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass w-full max-w-sm rounded-3xl border border-border p-5 shadow-2xl animate-scale-in"
      >
        <h3 className="text-lg font-bold">Message info</h3>
        {!info.data ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <dl className="mt-4 grid grid-cols-3 gap-y-2 text-sm">
              <dt className="col-span-1 text-muted-foreground">Sent</dt>
              <dd className="col-span-2">{new Date(info.data.message.created_at).toLocaleString()}</dd>
              <dt className="col-span-1 text-muted-foreground">Delivered</dt>
              <dd className="col-span-2">{delivered ? new Date(delivered).toLocaleString() : "—"}</dd>
              <dt className="col-span-1 text-muted-foreground">Read</dt>
              <dd className="col-span-2">{read ? new Date(read).toLocaleString() : "—"}</dd>
              {info.data.message.edited_at && (
                <>
                  <dt className="col-span-1 text-muted-foreground">Edited</dt>
                  <dd className="col-span-2">{new Date(info.data.message.edited_at).toLocaleString()}</dd>
                </>
              )}
            </dl>
            {info.data.edits.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Edit history ({info.data.edits.length})
                </p>
                <ul className="mt-2 grid gap-1.5 max-h-40 overflow-y-auto">
                  {info.data.edits.map((e, i) => (
                    <li key={i} className="rounded-lg border border-border p-2 text-xs">
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(e.edited_at).toLocaleString()}
                      </p>
                      <p className="mt-0.5 line-clamp-2">{e.previous_body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        <button onClick={onClose} className="mt-5 h-11 w-full rounded-full bg-primary font-semibold text-primary-foreground">
          Close
        </button>
      </div>
    </div>
  );
}

function ForwardSheet({
  fetchConversations,
  currentConversationId,
  messageIds,
  onClose,
  onSend,
  me,
  selfProfile,
}: {
  fetchConversations: () => Promise<
    Array<{ id: string; other: ChatProfile | null; last_message_at: string }>
  >;
  currentConversationId: string;
  messageIds: string[];
  onClose: () => void;
  onSend: (convIds: string[]) => void;
  me: { id: string } | undefined;
  selfProfile: ChatProfile | null;
}) {
  const list = useQuery({ queryKey: ["conversations"], queryFn: () => fetchConversations() });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  void me;
  void selfProfile;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 animate-fade-in" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass w-full max-w-md rounded-t-3xl border border-border p-4 shadow-2xl animate-scale-in max-h-[80vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Forward to…</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Forwarding {messageIds.length} message{messageIds.length === 1 ? "" : "s"}
        </p>
        <ul className="mt-3 flex-1 overflow-y-auto grid gap-1.5 pb-2">
          {(list.data ?? [])
            .filter((c) => c.id !== currentConversationId && c.other)
            .map((c) => {
              const p = c.other!;
              const on = picked.has(c.id);
              return (
                <li key={c.id}>
                  <button
                    onClick={() =>
                      setPicked((s) => {
                        const n = new Set(s);
                        if (n.has(c.id)) n.delete(c.id);
                        else n.add(c.id);
                        return n;
                      })
                    }
                    className={[
                      "flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition",
                      on ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-white/5",
                    ].join(" ")}
                  >
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/20 font-bold text-primary">
                      {(p.display_name ?? p.username ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{p.display_name ?? p.username}</p>
                      <p className="truncate text-[11px] text-muted-foreground">@{p.username ?? ""}</p>
                    </div>
                    {on && <Check className="h-4 w-4 text-primary" />}
                  </button>
                </li>
              );
            })}
          {list.data && list.data.filter((c) => c.id !== currentConversationId && c.other).length === 0 && (
            <li className="py-8 text-center text-sm text-muted-foreground">No other chats yet.</li>
          )}
        </ul>
        <button
          onClick={() => onSend(Array.from(picked))}
          disabled={picked.size === 0}
          className="mt-3 h-11 rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-40"
        >
          Send to {picked.size || 0}
        </button>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
      style={{ animationDelay: delay }}
    />
  );
}
