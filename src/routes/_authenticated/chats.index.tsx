import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Users, Search, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
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
      <div className="mx-auto w-full max-w-md px-5 pt-12">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Ghostline</p>
            <h1 className="text-3xl font-black">Chats</h1>
          </div>
          <Link
            to="/contacts"
            className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground glow-primary"
            aria-label="Contacts"
          >
            <UserPlus className="h-5 w-5" />
          </Link>
        </header>

        <div className="mt-5 flex items-center gap-2 glass rounded-full px-4 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats and messages"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {q && (
            <button onClick={() => setQ("")} className="grid h-6 w-6 place-items-center rounded-full hover:bg-white/10" aria-label="Clear">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="mt-6">
          {filtered.length === 0 && !trimmed ? (
            <EmptyState />
          ) : (
            <ul className="grid gap-2">
              {filtered.map((c) => {
                const name = c.other?.display_name ?? c.other?.username ?? "Ghost";
                const last = c.last_message;
                const preview = last
                  ? last.deleted_at
                    ? "Message deleted"
                    : (last.sender_id === profile.data?.id ? "You: " : "") + last.body
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
                      className="glass flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition hover:bg-white/10"
                    >
                      <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/20 font-bold text-primary">
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate font-semibold">{name}</p>
                          <span className="shrink-0 text-[10px] text-muted-foreground">{ts}</span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{preview}</p>
                      </div>
                      {c.unread > 0 && (
                        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-primary px-2 text-[11px] font-bold text-primary-foreground">
                          {c.unread}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {trimmed.length >= 2 && (globalHits.data ?? []).length > 0 && (
            <div className="mt-6">
              <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Messages
              </p>
              <ul className="grid gap-1.5">
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
                        className="glass w-full rounded-2xl px-4 py-3 text-left hover:bg-white/10"
                      >
                        <div className="flex items-baseline justify-between">
                          <p className="text-xs font-semibold">{name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(h.message.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{h.message.body}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {trimmed.length >= 2 && globalHits.isSuccess && (globalHits.data ?? []).length === 0 && filtered.length === 0 && (
            <p className="mt-8 text-center text-sm text-muted-foreground">No matches for "{trimmed}"</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function EmptyState() {
  return (
    <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/15 text-primary">
        <Users className="h-7 w-7" />
      </div>
      <h2 className="text-lg font-bold">No chats yet</h2>
      <p className="text-sm text-muted-foreground max-w-xs">
        Add a friend and start the conversation.
      </p>
      <Link
        to="/contacts"
        className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground glow-primary"
      >
        Find friends
      </Link>
    </div>
  );
}
