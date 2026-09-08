import { createContext, useContext, useEffect, useMemo, useState, useRef, useCallback, type ReactNode } from "react";
import { authService } from "@/lib/auth/session";
import { supabase } from "@/integrations/supabase/client";

export type UserPresenceData = {
  user_id: string;
  active_conversation_id: string | null;
  heartbeat_at: number;
  tab_id: string;
};

type PresenceContextType = {
  myId: string | null;
  presences: Map<string, UserPresenceData[]>;
  setActiveConversationId: (convId: string | null) => void;
  isUserOnline: (userId: string | null | undefined) => boolean;
  isUserActiveInChat: (userId: string | null | undefined, convId: string | null | undefined) => boolean;
  getUserStatusLabel: (
    userId: string | null | undefined,
    convId: string | null | undefined,
    lastSeenAt: string | null | undefined
  ) => string;
};

const PresenceContext = createContext<PresenceContextType>({
  myId: null,
  presences: new Map(),
  setActiveConversationId: () => {},
  isUserOnline: () => false,
  isUserActiveInChat: () => false,
  getUserStatusLabel: () => "Offline",
});

export function usePresence() {
  return useContext(PresenceContext);
}

// Remove old statusLabel function as it is now replaced by getUserStatusLabel in context
// and formatLastSeen helper.

export function formatLastSeen(lastSeenAt: string | null | undefined): string {
  if (!lastSeenAt) return "Offline";
  const targetDate = new Date(lastSeenAt);
  if (isNaN(targetDate.getTime())) return "Offline";

  const now = new Date();
  const diffMs = now.getTime() - targetDate.getTime();
  
  if (diffMs < 60 * 1000) return "Last seen just now";

  const isToday = targetDate.toDateString() === now.toDateString();
  
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = targetDate.toDateString() === yesterday.toDateString();

  const timeStr = targetDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (isToday) return `Last seen today at ${timeStr}`;
  if (isYesterday) return `Last seen yesterday at ${timeStr}`;

  if (targetDate.getFullYear() === now.getFullYear()) {
    const monthDayStr = targetDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `Last seen ${monthDayStr} at ${timeStr}`;
  }

  const dateStr = targetDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  return `Last seen ${dateStr}`;
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  const [myId, setMyId] = useState<string | null>(null);
  const [presences, setPresences] = useState<Map<string, UserPresenceData[]>>(new Map());
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const tabIdRef = useRef<string>(Math.random().toString(36).substring(2, 10));
  const activeConvIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    activeConvIdRef.current = activeConversationId;
  }, [activeConversationId]);

  // Auth setup
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

  const updateMyLastSeen = useCallback(async (userId: string) => {
    try {
      await supabase
        .from("profiles")
        .update({ last_seen: new Date().toISOString() })
        .eq("id", userId);
    } catch {
      // Best effort update.
    }
  }, []);

  useEffect(() => {
    if (!myId) {
      setPresences(new Map());
      return;
    }

    const channel = supabase.channel("presence:ghostline", {
      config: { presence: { key: myId } },
    });

    const syncPresence = () => {
      const state = channel.presenceState() as Record<string, UserPresenceData[]>;
      const newMap = new Map<string, UserPresenceData[]>();
      for (const [uid, payloads] of Object.entries(state)) {
        newMap.set(uid, payloads);
      }
      setPresences(newMap);
    };

    channel
      .on("presence", { event: "sync" }, syncPresence)
      .on("presence", { event: "join" }, syncPresence)
      .on("presence", { event: "leave" }, syncPresence);

    const sendHeartbeat = () => {
      const isVisible = document.visibilityState === "visible";
      const payload: UserPresenceData = {
        user_id: myId,
        active_conversation_id: isVisible ? activeConvIdRef.current : null,
        heartbeat_at: Date.now(),
        tab_id: tabIdRef.current,
      };
      channel.track(payload).catch(() => {});
    };

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        sendHeartbeat();
      }
    });

    const heartbeatInterval = setInterval(() => {
      sendHeartbeat();
    }, 10000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        sendHeartbeat();
      } else {
        sendHeartbeat();
        // Fire best-effort update to last_seen in DB when hiding
        updateMyLastSeen(myId);
      }
    };
    
    const handleBeforeUnload = () => {
      updateMyLastSeen(myId);
      channel.untrack().catch(() => {});
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(heartbeatInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      
      updateMyLastSeen(myId);
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
    };
  }, [myId, updateMyLastSeen]);

  // Helpers

  const isUserOnline = useCallback((userId: string | null | undefined): boolean => {
    if (!userId) return false;
    const userPresences = presences.get(userId) ?? [];
    return userPresences.some(p => Date.now() - p.heartbeat_at < 30000);
  }, [presences]);

  const isUserActiveInChat = useCallback((userId: string | null | undefined, convId: string | null | undefined): boolean => {
    if (!userId || !convId) return false;
    const userPresences = presences.get(userId) ?? [];
    return userPresences.some(p => 
      Date.now() - p.heartbeat_at < 30000 && 
      p.active_conversation_id === convId
    );
  }, [presences]);

  const getUserStatusLabel = useCallback((
    userId: string | null | undefined, 
    convId: string | null | undefined, 
    lastSeenAt: string | null | undefined
  ): string => {
    if (!userId) return "Offline";
    
    const online = isUserOnline(userId);
    if (online) {
      const active = isUserActiveInChat(userId, convId);
      if (active) return "Active now";
      return "Online";
    }

    if (lastSeenAt) {
      return formatLastSeen(lastSeenAt);
    }
    return "Offline";
  }, [isUserOnline, isUserActiveInChat]);

  // To force UI re-renders so `Last seen Xm ago` or stale states update automatically 
  // even if no presence events come in, use a minute ticker.
  const [ticker, setTicker] = useState(0);
  useEffect(() => {
    const int = setInterval(() => setTicker((t) => t + 1), 10000);
    return () => clearInterval(int);
  }, []);

  const value = useMemo<PresenceContextType>(() => ({
    myId,
    presences,
    setActiveConversationId,
    isUserOnline,
    isUserActiveInChat,
    getUserStatusLabel,
  }), [myId, presences, isUserOnline, isUserActiveInChat, getUserStatusLabel, ticker]);

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}
