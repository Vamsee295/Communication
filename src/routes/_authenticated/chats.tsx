import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, UserPlus, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { registerDevice } from "@/lib/devices.functions";
import { listFriendships } from "@/lib/friendships.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { getDeviceKey, guessDeviceName } from "@/lib/device-key";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/chats")({
  component: ChatsPage,
});

function ChatsPage() {
  const register = useServerFn(registerDevice);
  const fetchFriendships = useServerFn(listFriendships);
  const fetchProfile = useServerFn(getMyProfile);
  const qc = useQueryClient();

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

  // Redirect to onboarding if username missing
  useEffect(() => {
    if (profile.data && !profile.data.username) {
      window.location.replace("/onboarding");
    }
  }, [profile.data]);

  const friends = useQuery({
    queryKey: ["friendships"],
    queryFn: () => fetchFriendships(),
    enabled: !!profile.data?.username,
  });

  // Realtime refresh
  useEffect(() => {
    const channel = supabase
      .channel("friendships-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        qc.invalidateQueries({ queryKey: ["friendships"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const accepted = (friends.data?.friendships ?? []).filter((f) => f.status === "accepted");

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

        <div className="mt-8">
          {accepted.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="grid gap-2">
              {accepted.map((f) => {
                const otherId = f.requester_id === profile.data?.id ? f.addressee_id : f.requester_id;
                const other = friends.data?.profiles[otherId];
                return (
                  <li
                    key={f.id}
                    className="glass flex items-center gap-3 rounded-2xl px-4 py-3"
                  >
                    <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/20 text-primary font-bold">
                      {(other?.display_name ?? other?.username ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-semibold">
                        {other?.display_name ?? other?.username ?? "Ghost"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        Chatting starts in Phase 2 — messaging arrives next.
                      </p>
                    </div>
                    <MessageCircle className="h-5 w-5 text-muted-foreground" />
                  </li>
                );
              })}
            </ul>
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
        Add your first friend to see them here. Messaging goes live in the next phase.
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
