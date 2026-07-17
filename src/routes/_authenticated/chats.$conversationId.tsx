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
} from "lucide-react";
import {
  getConversation,
  listMessages,
  sendMessage,
  markRead,
  listMyMessageReceipts,
  hideMessageForMe,
  deleteMessageForEveryone,
  type MessageRow,
} from "@/lib/chat.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/chats/$conversationId")({
  component: ChatRoom,
});

type OptimisticMsg = MessageRow & { pending?: boolean; failed?: boolean };
type MenuState = { id: string; mine: boolean; x: number; y: number; body: string; createdAt: string } | null;

function ChatRoom() {
  const { conversationId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fetchConv = useServerFn(getConversation);
  const fetchMessages = useServerFn(listMessages);
  const fetchReceipts = useServerFn(listMyMessageReceipts);
  const fetchProfile = useServerFn(getMyProfile);
  const doSend = useServerFn(sendMessage);
  const doMarkRead = useServerFn(markRead);
  const doHide = useServerFn(hideMessageForMe);
  const doDeleteAll = useServerFn(deleteMessageForEveryone);

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

  const [optimistic, setOptimistic] = useState<OptimisticMsg[]>([]);
  const [typingOther, setTypingOther] = useState<number | null>(null);
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [locallyGone, setLocallyGone] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<MenuState>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; mine: boolean } | null>(null);
  const [infoFor, setInfoFor] = useState<{ createdAt: string; body: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const meId = me.data?.id;
  const otherId = conv.data?.other?.id;

  const rendered = useMemo(() => {
    const server = (messages.data ?? []).filter((m) => !locallyGone.has(m.id));
    const seen = new Set(server.map((m) => m.client_id).filter(Boolean) as string[]);
    const pending = optimistic.filter((m) => !(m.client_id && seen.has(m.client_id)));
    return [...server, ...pending].sort((a, b) =>
      a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
    );
  }, [messages.data, optimistic, locallyGone]);

  const receiptByMsg = useMemo(() => {
    const map = new Map<string, { delivered_at: string | null; read_at: string | null }>();
    for (const r of receipts.data ?? []) {
      map.set(r.message_id, { delivered_at: r.delivered_at, read_at: r.read_at });
    }
    return map;
  }, [receipts.data]);

  // Animate then remove locally, then refresh from server
  const collapseAndForget = useCallback(
    (id: string) => {
      setRemovingIds((s) => {
        const n = new Set(s);
        n.add(id);
        return n;
      });
      setTimeout(() => {
        setLocallyGone((s) => {
          const n = new Set(s);
          n.add(id);
          return n;
        });
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

  // Realtime: messages (INSERT/UPDATE/DELETE) + receipts + hidden + typing + presence
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
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [rendered.length]);

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
        pending: true,
      };
      setOptimistic((prev) => [...prev, pending]);
      try {
        const row = await doSend({ data: { conversation_id: conversationId, body, client_id } });
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
  const submit = () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    send.mutate(body);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const doDeleteForMe = async (id: string) => {
    collapseAndForget(id);
    try {
      await doHide({ data: { message_id: id } });
    } catch {
      showToast("Couldn't delete — try again");
      setLocallyGone((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    }
  };

  const doDeleteForAll = async (id: string) => {
    collapseAndForget(id);
    try {
      await doDeleteAll({ data: { message_id: id } });
    } catch {
      showToast("Couldn't delete for everyone");
      setLocallyGone((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    }
  };

  const openMenu = (e: React.MouseEvent, m: MessageRow) => {
    e.preventDefault();
    setMenu({
      id: m.id,
      mine: m.sender_id === meId,
      x: e.clientX,
      y: e.clientY,
      body: m.body,
      createdAt: m.created_at,
    });
  };

  const longPress = (m: MessageRow) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return {
      onTouchStart: (e: React.TouchEvent) => {
        const t = e.touches[0];
        timer = setTimeout(() => {
          setMenu({
            id: m.id,
            mine: m.sender_id === meId,
            x: t.clientX,
            y: t.clientY,
            body: m.body,
            createdAt: m.created_at,
          });
        }, 450);
      },
      onTouchEnd: () => {
        if (timer) clearTimeout(timer);
      },
      onTouchMove: () => {
        if (timer) clearTimeout(timer);
      },
    };
  };

  const isOnline = otherId ? presentIds.has(otherId) : false;

  return (
    <div className="flex h-[100dvh] flex-col">
      <header className="glass sticky top-0 z-30 flex items-center gap-2 px-3 py-3">
        <button
          onClick={() => navigate({ to: "/chats" })}
          className="grid h-9 w-9 place-items-center rounded-full border border-border"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="relative">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/20 font-bold text-primary">
            {(conv.data?.other?.display_name ?? conv.data?.other?.username ?? "?").charAt(0).toUpperCase()}
          </div>
          {isOnline && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-emerald-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">
            {conv.data?.other?.display_name ?? conv.data?.other?.username ?? "Ghost"}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {isOnline ? "Online now" : conv.data?.other?.username ? "@" + conv.data.other.username : ""}
          </p>
        </div>
        <button
          onClick={() => showToast("Calls coming soon")}
          className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10"
          aria-label="Voice call"
        >
          <Phone className="h-4 w-4" />
        </button>
        <button
          onClick={() => showToast("Video coming soon")}
          className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10"
          aria-label="Video call"
        >
          <Video className="h-4 w-4" />
        </button>
        <button
          onClick={() => showToast("More options coming soon")}
          className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10"
          aria-label="More"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </header>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4">
        <ul className="mx-auto flex max-w-md flex-col gap-1.5">
          {rendered.map((m, i) => {
            const mine = m.sender_id === meId;
            const prev = rendered[i - 1];
            const grouped = prev && prev.sender_id === m.sender_id;
            const receipt = mine ? receiptByMsg.get(m.id) : undefined;
            const removing = removingIds.has(m.id);
            return (
              <li
                key={m.id}
                className={[
                  "flex overflow-hidden transition-all duration-[260ms] ease-out",
                  mine ? "justify-end" : "justify-start",
                  grouped ? "mt-0" : "mt-2",
                  removing ? "max-h-0 -translate-y-1 scale-95 opacity-0" : "max-h-40 opacity-100",
                ].join(" ")}
              >
                <div
                  onContextMenu={(e) => openMenu(e, m)}
                  {...longPress(m)}
                  className={[
                    "max-w-[78%] cursor-default select-none rounded-2xl px-3.5 py-2 text-sm leading-snug shadow",
                    mine ? "bg-primary text-primary-foreground rounded-br-md" : "glass rounded-bl-md",
                    (m as OptimisticMsg).pending ? "opacity-60" : "",
                    (m as OptimisticMsg).failed ? "opacity-60 ring-1 ring-destructive" : "",
                  ].join(" ")}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  {mine && (
                    <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] opacity-70">
                      <span>
                        {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {(m as OptimisticMsg).pending ? (
                        <span>…</span>
                      ) : receipt?.read_at ? (
                        <CheckCheck className="h-3 w-3" />
                      ) : receipt?.delivered_at ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Check className="h-3 w-3 opacity-50" />
                      )}
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
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="sticky bottom-0 z-20 bg-background/80 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur"
      >
        <div className="mx-auto flex max-w-md items-end gap-2">
          <textarea
            ref={composerRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              notifyTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder="Message"
            className="glass max-h-32 min-h-11 flex-1 resize-none rounded-3xl px-4 py-3 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={!text.trim() || send.isPending}
            className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground glow-primary disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>

      {menu && (
        <ContextMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onReply={() => showToast("Reply coming soon")}
          onCopy={async () => {
            try {
              await navigator.clipboard.writeText(menu.body);
              showToast("Copied");
            } catch {
              showToast("Copy failed");
            }
          }}
          onForward={() => showToast("Forward coming soon")}
          onDelete={() => setConfirmDelete({ id: menu.id, mine: menu.mine })}
          onInfo={() => setInfoFor({ createdAt: menu.createdAt, body: menu.body })}
          onReact={() => showToast("Reactions coming soon")}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteDialog
          mine={confirmDelete.mine}
          onCancel={() => setConfirmDelete(null)}
          onDeleteForMe={() => {
            const id = confirmDelete.id;
            setConfirmDelete(null);
            void doDeleteForMe(id);
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
          info={infoFor}
          onClose={() => setInfoFor(null)}
          receipt={
            confirmDelete
              ? undefined
              : (() => {
                  const rId = rendered.find((r) => r.created_at === infoFor.createdAt)?.id;
                  return rId ? receiptByMsg.get(rId) : undefined;
                })()
          }
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
  onClose,
  onReply,
  onCopy,
  onForward,
  onDelete,
  onInfo,
  onReact,
}: {
  menu: NonNullable<MenuState>;
  onClose: () => void;
  onReply: () => void;
  onCopy: () => void;
  onForward: () => void;
  onDelete: () => void;
  onInfo: () => void;
  onReact: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Position within viewport
  const W = 200;
  const H = 288;
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
      onClick={() => {
        onClick();
        onClose();
      }}
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
        <Item icon={Reply} label="Reply" onClick={onReply} />
        <Item icon={Copy} label="Copy" onClick={onCopy} />
        <Item icon={Forward} label="Forward" onClick={onForward} />
        <Item icon={Smile} label="React" onClick={onReact} />
        <Item icon={Info} label="Info" onClick={onInfo} />
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 animate-fade-in sm:items-center"
      onClick={onCancel}
    >
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
          <button
            onClick={onCancel}
            className="h-11 rounded-full border border-border font-semibold transition hover:bg-white/5"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoDialog({
  info,
  onClose,
  receipt,
}: {
  info: { createdAt: string; body: string };
  onClose: () => void;
  receipt?: { delivered_at: string | null; read_at: string | null };
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass w-full max-w-sm rounded-3xl border border-border p-5 shadow-2xl animate-scale-in"
      >
        <h3 className="text-lg font-bold">Message info</h3>
        <dl className="mt-4 grid grid-cols-3 gap-y-2 text-sm">
          <dt className="col-span-1 text-muted-foreground">Sent</dt>
          <dd className="col-span-2">{new Date(info.createdAt).toLocaleString()}</dd>
          {receipt?.delivered_at && (
            <>
              <dt className="col-span-1 text-muted-foreground">Delivered</dt>
              <dd className="col-span-2">{new Date(receipt.delivered_at).toLocaleString()}</dd>
            </>
          )}
          {receipt?.read_at && (
            <>
              <dt className="col-span-1 text-muted-foreground">Read</dt>
              <dd className="col-span-2">{new Date(receipt.read_at).toLocaleString()}</dd>
            </>
          )}
        </dl>
        <button
          onClick={onClose}
          className="mt-5 h-11 w-full rounded-full bg-primary font-semibold text-primary-foreground"
        >
          Close
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
