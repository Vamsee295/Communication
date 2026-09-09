import { createContext, useContext, useEffect, useMemo, useState, useRef, useCallback, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { authService } from "@/lib/auth/session";
import { supabase } from "@/integrations/supabase/client";
import { heartbeatLastSeen } from "@/lib/profile.functions";

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
  const lastPersistedAtRef = useRef<number>(0);

  const heartbeatLastSeenFn = useServerFn(heartbeatLastSeen);
  const heartbeatLastSeenRef = useRef(heartbeatLastSeenFn);
  heartbeatLastSeenRef.current = heartbeatLastSeenFn;

  useEffect(() => {
    activeConvIdRef.current = activeConversationId;
    if (process.env.NODE_ENV !== "production" && activeConversationId) {
      console.debug("[ACTIVE_CHAT] conversation ID", activeConversationId);
    }
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

  const persistLastSeenToDb = useCallback(async (force = false) => {
    if (!myId) return;
    const now = Date.now();
    // Throttle non-forced updates: min 45 seconds between periodic database writes
    if (!force && now - lastPersistedAtRef.current < 45000) {
      return;
    }
    lastPersistedAtRef.current = now;
    const isoString = new Date(now).toISOString();
    try {
      await heartbeatLastSeenRef.current({ data: { lastSeen: isoString } });
      if (process.env.NODE_ENV !== "production") {
        console.debug("[LAST_SEEN] persisted timestamp", isoString);
      }
    } catch {
      // Best-effort update.
    }
  }, [myId]);

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
      if (process.env.NODE_ENV !== "production") {
        console.debug("[PRESENCE] online state synced", { activeUsers: newMap.size });
      }
    };

    channel
      .on("presence", { event: "sync" }, syncPresence)
      .on("presence", { event: "join" }, syncPresence)
      .on("presence", { event: "leave" }, syncPresence);

    const sendPresenceHeartbeat = () => {
      const isVisible = typeof document !== "undefined" ? document.visibilityState === "visible" : true;
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
        sendPresenceHeartbeat();
        // Record initial database last_seen
        persistLastSeenToDb(false);
      }
    });

    // 1. Live presence heartbeat: every 20s
    const presenceHeartbeatInterval = setInterval(() => {
      sendPresenceHeartbeat();
    }, 20000);

    // 2. Throttled database last_seen heartbeat: every 60s while visible
    const dbHeartbeatInterval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        persistLastSeenToDb(false);
      }
    }, 60000);

    // Lifecycle events
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        sendPresenceHeartbeat();
        persistLastSeenToDb(false);
      } else {
        sendPresenceHeartbeat();
        persistLastSeenToDb(true);
      }
    };

    const handlePageHide = () => {
      persistLastSeenToDb(true);
      channel.untrack().catch(() => {});
    };

    const handleOnline = () => {
      sendPresenceHeartbeat();
      persistLastSeenToDb(false);
    };

    const handleBeforeUnload = () => {
      persistLastSeenToDb(true);
      channel.untrack().catch(() => {});
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("online", handleOnline);
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Capacitor Native App Lifecycle (if running on native platform)
    let removeCapacitorListener: (() => void) | null = null;
    const capacitorObj = typeof window !== "undefined" ? (window as unknown as { Capacitor?: { Plugins?: { App?: { addListener: (event: string, cb: (state: { isActive: boolean }) => void) => Promise<{ remove: () => void }> } } } }).Capacitor : undefined;
    if (capacitorObj?.Plugins?.App?.addListener) {
      capacitorObj.Plugins.App.addListener("appStateChange", (state: { isActive: boolean }) => {
        if (state.isActive) {
          sendPresenceHeartbeat();
          persistLastSeenToDb(false);
        } else {
          persistLastSeenToDb(true);
        }
      }).then((handle) => {
        removeCapacitorListener = () => handle.remove();
      }).catch(() => {});
    }

    return () => {
      clearInterval(presenceHeartbeatInterval);
      clearInterval(dbHeartbeatInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (removeCapacitorListener) removeCapacitorListener();

      persistLastSeenToDb(true);
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
    };
  }, [myId, persistLastSeenToDb]);

  // Helpers

  const isUserOnline = useCallback((userId: string | null | undefined): boolean => {
    if (!userId) return false;
    const userPresences = presences.get(userId) ?? [];
    return userPresences.some((p) => Date.now() - p.heartbeat_at < 45000);
  }, [presences]);

  const isUserActiveInChat = useCallback((userId: string | null | undefined, convId: string | null | undefined): boolean => {
    if (!userId || !convId) return false;
    const userPresences = presences.get(userId) ?? [];
    return userPresences.some(
      (p) => Date.now() - p.heartbeat_at < 45000 && p.active_conversation_id === convId
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

  // To update `Last seen Xm ago` or stale states automatically, use a 60-second ticker.
  const [ticker, setTicker] = useState(0);
  useEffect(() => {
    const int = setInterval(() => setTicker((t) => t + 1), 60000);
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
