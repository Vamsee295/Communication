import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authService } from "@/lib/auth/session";
import { realtimeService } from "@/lib/realtime/create-realtime";

type PresenceValue = {
  onlineIds: Set<string>;
  myId: string | null;
};

const PresenceContext = createContext<PresenceValue>({ onlineIds: new Set(), myId: null });

export function usePresence() {
  return useContext(PresenceContext);
}

export function useIsOnline(userId: string | null | undefined) {
  const { onlineIds } = usePresence();
  return !!userId && onlineIds.has(userId);
}

/** "Active now" / "Last seen 5m ago" from presence + profiles.last_seen. */
export function statusLabel(online: boolean, lastSeen: string | null | undefined) {
  if (online) return "Active now";
  if (!lastSeen) return "Offline";
  const diff = Date.now() - new Date(lastSeen).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Last seen just now";
  if (mins < 60) return `Last seen ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Last seen yesterday";
  return `Last seen ${days}d ago`;
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  const [myId, setMyId] = useState<string | null>(null);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    authService.getSession().then(({ data }) => {
      if (active) setMyId(data.session?.user.id ?? null);
    });
    const { data: sub } = authService.onAuthStateChange((_e, session) => {
      setMyId(session?.user.id ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!myId) {
      setOnlineIds(new Set());
      return;
    }
    return realtimeService.subscribeGlobalPresence(myId, setOnlineIds);
  }, [myId]);

  const value = useMemo(() => ({ onlineIds, myId }), [onlineIds, myId]);
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}
