/**
 * Ghostline Vanish Mode
 *
 * Manages the ephemeral chat session:
 *  - Single Source of Truth: persisted disappearing_messages_enabled on Neon conversation
 *  - Optimistic UI state synchronized with request sequence IDs to prevent race conditions
 *  - Guaranteed consistency across rapid toggles, query refetches, and Realtime sync
 *
 * SECURITY NOTE:
 *   Ephemeral messages are NEVER written to Neon PostgreSQL.
 *   They are transmitted via Supabase Realtime Broadcast only
 *   and exist solely in client memory for the duration of the active session.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { pingVanishSession, toggleDisappearingMessages } from "@/lib/chat.functions";

/** Shape sent over Supabase Broadcast for vanish_message_sent events. */
export interface VanishMessagePayload {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
}

/** Shape sent for vanish_mode_started / vanish_mode_ended events. */
export interface VanishModeStatePayload {
  conversation_id: string;
  activated_by: string;
  timestamp: string;
}

interface UseVanishModeOptions {
  conversationId: string;
  disappearingMessagesEnabled: boolean;
}

interface UseVanishModeReturn {
  vanishActive: boolean;
  enterVanishMode: () => void;
  exitVanishMode: () => void;
  pingVanishSession: () => void;
  /** Touch gesture helpers — attach to the main chat container */
  touchHandlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
  };
}

export function useVanishMode({
  conversationId,
  disappearingMessagesEnabled,
}: UseVanishModeOptions): UseVanishModeReturn {
  const qc = useQueryClient();
  const doPingSession = useServerFn(pingVanishSession);
  const doToggleDisappearing = useServerFn(toggleDisappearingMessages);

  // Sequence counter to prevent older in-flight responses from overwriting newer user intent
  const actionSeqRef = useRef<number>(0);

  // Optimistic override state. If null, tracks authoritative server state (disappearingMessagesEnabled)
  const [optimisticActive, setOptimisticActive] = useState<boolean | null>(null);

  // Compute active state: optimistic override takes precedence while mutation/action is settling
  const vanishActive = optimisticActive !== null ? optimisticActive : disappearingMessagesEnabled;

  // Touch gesture tracking
  const touchStartY = useRef<number | null>(null);
  const touchStartScreenY = useRef<number | null>(null);

  const pingSession = useCallback(() => {
    if (vanishActive) {
      doPingSession({ data: { conversation_id: conversationId } }).catch(console.error);
    }
  }, [vanishActive, conversationId, doPingSession]);

  const setVanishState = useCallback(
    async (targetEnabled: boolean) => {
      const seq = ++actionSeqRef.current;

      if (process.env.NODE_ENV !== "production") {
        console.debug(
          `[VANISH_SYNC] conversation=${conversationId} ${vanishActive} → ${targetEnabled} seq=${seq} source=USER`,
        );
      }

      // 1. Immediately apply optimistic local UI state
      setOptimisticActive(targetEnabled);

      // 2. User feedback toast
      if (targetEnabled) {
        toast("Disappearing messages enabled");
      } else {
        toast("Disappearing messages disabled");
      }

      // 3. Cancel any in-flight conversation queries to avoid stale data race
      await qc.cancelQueries({ queryKey: ["conversation", conversationId] });

      // 4. Optimistically update TanStack Query cache for conversation
      qc.setQueryData(["conversation", conversationId], (old: any) => {
        if (!old || !old.conversation) return old;
        return {
          ...old,
          conversation: {
            ...old.conversation,
            disappearing_messages_enabled: targetEnabled,
          },
        };
      });

      // Also update conversations list cache if present
      qc.setQueryData(["conversations"], (old: any[] | undefined) => {
        if (!old) return old;
        return old.map((c: any) =>
          c.id === conversationId ? { ...c, disappearing_messages_enabled: targetEnabled } : c,
        );
      });

      // 5. If turning Vanish Mode OFF, optimistically remove all vanish messages from the active message cache
      if (!targetEnabled) {
        qc.setQueryData(["messages", conversationId], (old: any[] | undefined) => {
          if (!old) return old;
          return old.filter((m: any) => !m.is_vanish);
        });
      }

      // 6. Send server mutation
      try {
        await doToggleDisappearing({ data: { conversation_id: conversationId, enabled: targetEnabled } });

        if (actionSeqRef.current === seq) {
          if (process.env.NODE_ENV !== "production") {
            console.debug(
              `[VANISH_SYNC] conversation=${conversationId} state=${targetEnabled} seq=${seq} source=MUTATION_SUCCESS`,
            );
          }
          // Server accepted our latest action. Release optimistic override cleanly.
          setOptimisticActive(null);
          // If turned OFF, invalidate messages query to ensure client is in sync with server state
          if (!targetEnabled) {
            qc.invalidateQueries({ queryKey: ["messages", conversationId] });
            qc.invalidateQueries({ queryKey: ["conversations"] });
          }
        }
      } catch (err) {
        if (actionSeqRef.current === seq) {
          if (process.env.NODE_ENV !== "production") {
            console.error(
              `[VANISH_SYNC] conversation=${conversationId} seq=${seq} source=MUTATION_ERROR`,
              err,
            );
          }
          // Rollback on error
          setOptimisticActive(null);
          qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
          toast.error("Couldn't update Vanish Mode");
        }
      }
    },
    [conversationId, vanishActive, qc, doToggleDisappearing],
  );

  const enterVanishMode = useCallback(() => {
    if (vanishActive) return;
    void setVanishState(true);
    pingSession();
  }, [vanishActive, setVanishState, pingSession]);

  const exitVanishMode = useCallback(() => {
    if (!vanishActive) return;
    void setVanishState(false);
  }, [vanishActive, setVanishState]);

  useEffect(() => {
    if (vanishActive) {
      const interval = setInterval(() => {
        pingSession();
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [vanishActive, pingSession]);

  /** Swipe-up gesture handler for mobile Vanish Mode activation. */
  const touchHandlers = {
    onTouchStart: (e: React.TouchEvent) => {
      const touch = e.touches[0];
      touchStartY.current = touch.clientY;
      touchStartScreenY.current = touch.clientY;
    },
    onTouchMove: (_e: React.TouchEvent) => {
      // noop — delta measured on end
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (touchStartY.current === null) return;
      const touch = e.changedTouches[0];
      const deltaY = touchStartY.current - touch.clientY; // positive = swipe up
      const startFraction =
        touchStartScreenY.current !== null ? touchStartScreenY.current / window.innerHeight : 0;

      touchStartY.current = null;
      touchStartScreenY.current = null;

      // Activation: swipe UP > 70px from lower 40% of screen
      if (!vanishActive && deltaY > 70 && startFraction > 0.6) {
        enterVanishMode();
        return;
      }

      // Deactivation: swipe DOWN > 70px while vanish is active
      if (vanishActive && deltaY < -70) {
        exitVanishMode();
      }
    },
  };

  return {
    vanishActive,
    enterVanishMode,
    exitVanishMode,
    pingVanishSession: pingSession,
    touchHandlers,
  };
}
