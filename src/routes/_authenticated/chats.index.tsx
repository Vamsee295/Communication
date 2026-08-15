import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Users, Search, X, Lock, Check, CheckCheck } from "lucide-react";
import { AppShell, GhostMark } from "@/components/app-shell";
import { registerDevice } from "@/lib/devices.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { listConversations, searchMessagesGlobal } from "@/lib/chat.functions";
import { getDeviceKey, guessDeviceName } from "@/lib/device-key";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/chats/")({
  component: ChatsPage,
});

function ChatsPage() {
  const register = useServerFn(registerDevice);
  const fetchConversations = useServerFn(listConversations);
  const fetchProfile = useServerFn(getMyProfile);
  const qc = useQueryClient();
  const navigate = useNavigate();

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
  const trimmed = q.trim();
  const items = conversations.data ?? [];
  const filtered = useMemo(() => {
    if (!trimmed) return items;
    const needle = trimmed.toLowerCase();
    return items.filter((c) => {
      const n = (c.other?.display_name ?? "").toLowerCase();
      const u = (c.other?.username ?? "").toLowerCase();
      return n.includes(needle) || u.includes(needle);
    });
  }, [items, trimmed]);

  const fetchGlobalSearch = useServerFn(searchMessagesGlobal);
  const globalHits = useQuery({
    queryKey: ["global-search", trimmed],
    queryFn: () => fetchGlobalSearch({ data: { q: trimmed } }),
    enabled: trimmed.length >= 2,
  });

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
                placeholder="Search chats and messages"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
                  aria-label="Clear"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </header>

          <div className="flex-1 px-3 pb-6">
            {filtered.length === 0 && !trimmed ? (
              <div className="px-2">
                <EmptyState />
              </div>
            ) : (
              <ul className="grid gap-0.5">
                {filtered.map((c) => {
                  const name = c.other?.display_name ?? c.other?.username ?? "Ghost";
                  const last = c.last_message;
                  const mine = last?.sender_id === profile.data?.id;
                  const preview = last
                    ? last.deleted_at
                      ? "Message deleted"
                      : last.body
                    : "Say hi 👋";
                  const ts = last
                    ? new Date(last.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "";
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() =>
                          navigate({
                            to: "/chats/$conversationId",
                            params: { conversationId: c.id },
                          })
                        }
                        className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all duration-150 hover:translate-x-[3px] hover:bg-surface-2/70"
                      >
                        <div className="relative shrink-0">
                          <div className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-sm font-bold text-primary ring-1 ring-border transition group-hover:ring-primary/30">
                            {name.charAt(0).toUpperCase()}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate text-[15px] font-semibold">{name}</p>
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
                              {preview}
                            </p>
                            {c.unread > 0 && (
                              <span className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                                {c.unread}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
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
          </div>
        </section>

        {/* Desktop detail pane */}
        <section className="hidden flex-1 items-center justify-center px-10 lg:flex">
          <div className="max-w-sm animate-rise-in text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
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
    </AppShell>
  );
}

function EmptyState() {
  return (
    <div className="panel flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
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
