import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, Search, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { getMyProfile, searchUsers } from "@/lib/profile.functions";
import {
  listFriendships,
  respondToFriendRequest,
  sendFriendRequest,
  removeFriendship,
} from "@/lib/friendships.functions";

export const Route = createFileRoute("/_authenticated/contacts")({
  component: ContactsPage,
});

type Tab = "friends" | "requests" | "find";

function ContactsPage() {
  const [tab, setTab] = useState<Tab>("friends");
  const qc = useQueryClient();

  const fetchProfile = useServerFn(getMyProfile);
  const fetchFriendships = useServerFn(listFriendships);
  const doSend = useServerFn(sendFriendRequest);
  const doRespond = useServerFn(respondToFriendRequest);
  const doRemove = useServerFn(removeFriendship);
  const doSearch = useServerFn(searchUsers);

  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchProfile() });
  const friends = useQuery({ queryKey: ["friendships"], queryFn: () => fetchFriendships() });

  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ id: string; username: string | null; display_name: string | null }>>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (tab !== "find") return;
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const rows = await doSearch({ data: { query: q.trim() } });
        setResults(rows);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, tab, doSearch]);

  const send = useMutation({
    mutationFn: (addressee_id: string) => doSend({ data: { addressee_id } }),
    onSuccess: () => {
      toast.success("Request sent");
      qc.invalidateQueries({ queryKey: ["friendships"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const respond = useMutation({
    mutationFn: (vars: { friendship_id: string; action: "accept" | "decline" | "block" }) =>
      doRespond({ data: vars }),
    onSuccess: (_d, vars) => {
      toast.success(vars.action === "accept" ? "You're friends" : "Done");
      qc.invalidateQueries({ queryKey: ["friendships"] });
    },
  });

  const remove = useMutation({
    mutationFn: (friendship_id: string) => doRemove({ data: { friendship_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["friendships"] }),
  });

  const meId = me.data?.id;
  const all = friends.data?.friendships ?? [];
  const profiles = friends.data?.profiles ?? {};
  const friendedIds = new Set(all.filter((f) => f.status === "accepted" || f.status === "pending").map((f) => f.requester_id === meId ? f.addressee_id : f.requester_id));

  const accepted = all.filter((f) => f.status === "accepted");
  const incoming = all.filter((f) => f.status === "pending" && f.addressee_id === meId);
  const outgoing = all.filter((f) => f.status === "pending" && f.requester_id === meId);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-md px-5 pt-12">
        <header className="flex items-center gap-3">
          <Link
            to="/chats"
            className="grid h-10 w-10 place-items-center rounded-full border border-border"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-black">Contacts</h1>
        </header>

        <div className="mt-6 grid grid-cols-3 gap-1 rounded-full border border-border p-1 text-sm">
          {(["friends", "requests", "find"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                "h-9 rounded-full font-semibold capitalize transition",
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              ].join(" ")}
            >
              {t}
              {t === "requests" && incoming.length > 0 && (
                <span className="ml-1 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] text-destructive-foreground">
                  {incoming.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === "friends" && (
            <>
              {accepted.length === 0 ? (
                <Empty text="No friends yet. Head to Find to add someone." />
              ) : (
                <ul className="grid gap-2">
                  {accepted.map((f) => {
                    const otherId = f.requester_id === meId ? f.addressee_id : f.requester_id;
                    const other = profiles[otherId];
                    return (
                      <Row key={f.id} name={other?.display_name ?? other?.username ?? "Ghost"} sub={other?.username ? "@" + other.username : ""}>
                        <button
                          onClick={() => remove.mutate(f.id)}
                          className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive"
                        >
                          Remove
                        </button>
                      </Row>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          {tab === "requests" && (
            <div className="grid gap-4">
              <section>
                <h2 className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Incoming</h2>
                {incoming.length === 0 ? <Empty text="No incoming requests." /> : (
                  <ul className="grid gap-2">
                    {incoming.map((f) => {
                      const other = profiles[f.requester_id];
                      return (
                        <Row key={f.id} name={other?.display_name ?? other?.username ?? "Ghost"} sub={other?.username ? "@" + other.username : ""}>
                          <button
                            onClick={() => respond.mutate({ friendship_id: f.id, action: "accept" })}
                            className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground"
                            aria-label="Accept"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => respond.mutate({ friendship_id: f.id, action: "decline" })}
                            className="grid h-9 w-9 place-items-center rounded-full border border-border"
                            aria-label="Decline"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </Row>
                      );
                    })}
                  </ul>
                )}
              </section>
              <section>
                <h2 className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Sent</h2>
                {outgoing.length === 0 ? <Empty text="No pending sent requests." /> : (
                  <ul className="grid gap-2">
                    {outgoing.map((f) => {
                      const other = profiles[f.addressee_id];
                      return (
                        <Row key={f.id} name={other?.display_name ?? other?.username ?? "Ghost"} sub={other?.username ? "@" + other.username : ""}>
                          <button
                            onClick={() => remove.mutate(f.id)}
                            className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground"
                          >
                            Cancel
                          </button>
                        </Row>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          )}

          {tab === "find" && (
            <div>
              <div className="flex items-center gap-2 rounded-full border border-input bg-card px-4">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search username or name"
                  className="h-12 w-full bg-transparent text-sm outline-none"
                />
                {searching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>

              <ul className="mt-4 grid gap-2">
                {results.map((u) => (
                  <Row key={u.id} name={u.display_name ?? u.username ?? "Ghost"} sub={u.username ? "@" + u.username : ""}>
                    {friendedIds.has(u.id) ? (
                      <span className="text-xs text-muted-foreground">Pending</span>
                    ) : (
                      <button
                        onClick={() => send.mutate(u.id)}
                        className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                      >
                        <UserPlus className="h-3 w-3" /> Add
                      </button>
                    )}
                  </Row>
                ))}
                {q.trim().length >= 2 && !searching && results.length === 0 && (
                  <Empty text="No one matched that." />
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Row({ name, sub, children }: { name: string; sub?: string; children?: React.ReactNode }) {
  return (
    <li className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
      <div className="grid h-11 w-11 place-items-center rounded-full bg-primary/20 text-primary font-bold">
        {name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{name}</p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </li>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="glass rounded-2xl px-4 py-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
