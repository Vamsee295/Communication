import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send, Check, CheckCheck } from "lucide-react";
import {
  getConversation,
  listMessages,
  sendMessage,
  markRead,
  listMyMessageReceipts,
  type MessageRow,
} from "@/lib/chat.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/chats/$conversationId")({
  component: ChatRoom,
});

type OptimisticMsg = MessageRow & { pending?: boolean; failed?: boolean };

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
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const meId = me.data?.id;
  const otherId = conv.data?.other?.id;

  // Merge server + optimistic messages, oldest first
  const rendered = useMemo(() => {
    const server = messages.data ?? [];
    const seen = new Set(server.map((m) => m.client_id).filter(Boolean) as string[]);
    const pending = optimistic.filter((m) => !(m.client_id && seen.has(m.client_id)));
    return [...server, ...pending].sort((a, b) =>
      a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
    );
  }, [messages.data, optimistic]);

  const receiptByMsg = useMemo(() => {
    const map = new Map<string, { delivered_at: string | null; read_at: string | null }>();
    for (const r of receipts.data ?? []) {
      map.set(r.message_id, { delivered_at: r.delivered_at, read_at: r.read_at });
    }
    return map;
  }, [receipts.data]);

  // Realtime: messages + receipts + typing broadcast + presence
  useEffect(() => {
    if (!meId) return;
    const channel = supabase
      .channel(`chat:conv:${conversationId}`, {
        config: { presence: { key: meId } },
      })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["messages", conversationId] });
          qc.invalidateQueries({ queryKey: ["conversations"] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_receipts",
        },
        () => {
          qc.invalidateQueries({ queryKey: ["receipts", conversationId] });
        },
      )
      .on("broadcast", { event: "typing" }, (payload) => {
        const uid = (payload.payload as { user_id?: string })?.user_id;
        if (uid && uid !== meId) {
          setTypingOther(Date.now());
        }
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, unknown>;
        setPresentIds(new Set(Object.keys(state)));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ user_id: meId });
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, meId, qc]);

  // Fade typing indicator after 3s
  useEffect(() => {
    if (!typingOther) return;
    const t = setTimeout(() => setTypingOther(null), 3000);
    return () => clearTimeout(t);
  }, [typingOther]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [rendered.length]);

  // Mark read on load + when new messages arrive
  useEffect(() => {
    if (!rendered.length) return;
    const last = rendered[rendered.length - 1];
    doMarkRead({
      data: { conversation_id: conversationId, up_to_created_at: last.created_at },
    })
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
        // Remove optimistic once server row arrives via realtime; also invalidate now
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

  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    typingChannelRef.current = supabase.channel(`chat:conv:${conversationId}`);
    return () => {
      if (typingChannelRef.current) supabase.removeChannel(typingChannelRef.current);
    };
    // Reuse channel: send broadcast through same name — Supabase dedupes
  }, [conversationId]);

  const lastTypingAt = useRef(0);
  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingAt.current < 1500) return;
    lastTypingAt.current = now;
    supabase.channel(`chat:conv:${conversationId}`).send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: meId },
    });
  }, [conversationId, meId]);

  const [text, setText] = useState("");
  const submit = () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    send.mutate(body);
  };

  const isOnline = otherId ? presentIds.has(otherId) : false;

  return (
    <div className="flex h-[100dvh] flex-col">
      <header className="glass sticky top-0 z-30 flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => navigate({ to: "/chats" })}
          className="grid h-9 w-9 place-items-center rounded-full border border-border"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="relative">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/20 font-bold text-primary">
            {(conv.data?.other?.display_name ?? conv.data?.other?.username ?? "?")
              .charAt(0)
              .toUpperCase()}
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
      </header>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4">
        <ul className="mx-auto flex max-w-md flex-col gap-1.5">
          {rendered.map((m, i) => {
            const mine = m.sender_id === meId;
            const prev = rendered[i - 1];
            const grouped = prev && prev.sender_id === m.sender_id;
            const receipt = mine ? receiptByMsg.get(m.id) : undefined;
            return (
              <li
                key={m.id}
                className={[
                  "flex",
                  mine ? "justify-end" : "justify-start",
                  grouped ? "mt-0" : "mt-2",
                ].join(" ")}
              >
                <div
                  className={[
                    "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-snug shadow",
                    mine
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "glass rounded-bl-md",
                    (m as OptimisticMsg).pending ? "opacity-60" : "",
                    (m as OptimisticMsg).failed ? "opacity-60 ring-1 ring-destructive" : "",
                  ].join(" ")}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  {mine && (
                    <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] opacity-70">
                      <span>
                        {new Date(m.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
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

// Silence unused import warning when linting picks up Link
export const _typing = Link;
