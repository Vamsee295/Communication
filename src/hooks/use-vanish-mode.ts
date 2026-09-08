/**
 * Ghostline Vanish Mode
 *
 * Manages the ephemeral chat session:
 *  - State: vanishActive, vanishMessages
 *  - Realtime Broadcast: enter/exit/send events on the existing conversation channel
 *  - Gesture: swipe-up (mobile) and explicit toggle (desktop)
 *
 * SECURITY NOTE:
 *   Ephemeral messages are NEVER written to Neon PostgreSQL.
 *   They are transmitted via Supabase Realtime Broadcast only
 *   and exist solely in client memory for the duration of the active session.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
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
  const doPingSession = useServerFn(pingVanishSession);
  const { mutate: toggleDisappearing } = useMutation({
    mutationFn: useServerFn(toggleDisappearingMessages),
  });

  const vanishActive = disappearingMessagesEnabled;

  // Touch gesture tracking
  const touchStartY = useRef<number | null>(null);
  const touchStartScreenY = useRef<number | null>(null);

  const pingSession = useCallback(() => {
    if (vanishActive) {
      doPingSession({ data: { conversation_id: conversationId } }).catch(console.error);
    }
  }, [vanishActive, conversationId, doPingSession]);

  const enterVanishMode = useCallback(() => {
    toggleDisappearing({ data: { conversation_id: conversationId, enabled: true } });
    pingSession();
  }, [toggleDisappearing, pingSession, conversationId]);

  const exitVanishMode = useCallback(() => {
    toggleDisappearing({ data: { conversation_id: conversationId, enabled: false } });
  }, [toggleDisappearing, conversationId]);

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
      // noop — we measure delta on end
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (touchStartY.current === null) return;
      const touch = e.changedTouches[0];
      const deltaY = touchStartY.current - touch.clientY; // positive = swipe up
      const startFraction = touchStartScreenY.current !== null
        ? touchStartScreenY.current / window.innerHeight
        : 0;

      touchStartY.current = null;
      touchStartScreenY.current = null;

      // Activation: swipe UP > 70px from the lower 40% of the screen
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
