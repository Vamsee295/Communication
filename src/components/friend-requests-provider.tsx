import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listFriendships, type FriendshipRow, type FriendProfile } from "@/lib/friendships.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { realtimeService } from "@/lib/realtime/create-realtime";

type FriendRequestsContextValue = {
  incomingRequests: FriendshipRow[];
  incomingCount: number;
  profiles: Record<string, FriendProfile>;
  isLoading: boolean;
};

const FriendRequestsContext = createContext<FriendRequestsContextValue>({
  incomingRequests: [],
  incomingCount: 0,
  profiles: {},
  isLoading: false,
});

export function useFriendRequests() {
  return useContext(FriendRequestsContext);
}

export function FriendRequestsProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fetchMyProfile = useServerFn(getMyProfile);
  const fetchFriendships = useServerFn(listFriendships);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => fetchMyProfile(),
  });
  const meId = meQuery.data?.id;

  const friendsQuery = useQuery({
    queryKey: ["friendships"],
    queryFn: () => fetchFriendships(),
    enabled: !!meId,
  });

  const allFriendships = friendsQuery.data?.friendships ?? [];
  const profiles = (friendsQuery.data?.profiles ?? {}) as Record<string, FriendProfile>;

  const incomingRequests = useMemo(() => {
    if (!meId) return [];
    return allFriendships.filter((f) => f.status === "pending" && f.addressee_id === meId);
  }, [allFriendships, meId]);

  const incomingCount = incomingRequests.length;

  // Realtime subscription on user's global inbox:
  useEffect(() => {
    if (!meId) return;
    return realtimeService.subscribeInbox(meId, {
      onMessageInsert: () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
      },
      onFriendshipChange: () => {
        qc.invalidateQueries({ queryKey: ["friendships"] });
      },
    });
  }, [meId, qc]);

  // Session deduplication: only trigger toast for NEW requests during the active session
  const hasInitializedRef = useRef(false);
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (friendsQuery.isPending || !friendsQuery.data || !meId) return;

    if (!hasInitializedRef.current) {
      // First load of active session: record existing requests as seen without toasting
      for (const req of incomingRequests) {
        seenIdsRef.current.add(req.id);
      }
      hasInitializedRef.current = true;
      return;
    }

    // Subsequent updates: toast only genuinely new incoming requests
    for (const req of incomingRequests) {
      if (!seenIdsRef.current.has(req.id)) {
        seenIdsRef.current.add(req.id);
        const sender = profiles[req.requester_id];
        const senderName =
          sender?.display_name || (sender?.username ? `@${sender.username}` : "Someone");

        toast("New friend request", {
          description: `${senderName} sent you a friend request.`,
          action: {
            label: "View",
            onClick: () => {
              void navigate({
                to: "/contacts",
                search: { tab: "requests" },
              });
            },
          },
          duration: 6000,
        });
      }
    }
  }, [incomingRequests, profiles, friendsQuery.isPending, friendsQuery.data, meId, navigate]);

  const value = useMemo(
    () => ({
      incomingRequests,
      incomingCount,
      profiles,
      isLoading: friendsQuery.isPending,
    }),
    [incomingRequests, incomingCount, profiles, friendsQuery.isPending],
  );

  return <FriendRequestsContext.Provider value={value}>{children}</FriendRequestsContext.Provider>;
}
