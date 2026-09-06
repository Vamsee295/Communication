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

import { useState, useCallback, useRef } from "react";

/** Vanish-mode-only message — never touches Neon. */
export interface EphemeralMessage {
  /** Client-generated ephemeral ID. Prefix: "vanish_" to distinguish from persistent IDs. */
  id: string;
  conversation_id: string;
  sender_id: string;
  /** Display name for the sender (from profile, resolved client-side). */
  sender_name: string;
  body: string;
  created_at: string;
}

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

/** Maximum length of a vanish message body. */
export const VANISH_MAX_BODY_LENGTH = 2000;

/** Generates a client-side ephemeral message ID. */
export function generateEphemeralId(): string {
  return `vanish_${crypto.randomUUID()}`;
}

/** Validates an incoming vanish message payload is structurally safe. */
export function isValidVanishMessagePayload(
  payload: unknown,
  expectedConversationId: string,
  authenticatedUserId: string,
): payload is VanishMessagePayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.id !== "string" || !p.id.startsWith("vanish_")) return false;
  if (typeof p.conversation_id !== "string" || p.conversation_id !== expectedConversationId) return false;
  if (typeof p.sender_id !== "string") return false;
  // Reject messages claiming to be from ourselves (broadcast: { self: false } handles most cases, but double-check)
  if (p.sender_id === authenticatedUserId) return false;
  if (typeof p.sender_name !== "string") return false;
  if (typeof p.body !== "string" || p.body.trim().length === 0 || p.body.length > VANISH_MAX_BODY_LENGTH) return false;
  if (typeof p.created_at !== "string") return false;
  return true;
}

interface UseVanishModeOptions {
  conversationId: string;
  meId: string;
  myName: string;
  /** Supabase realtime channel reference to send broadcast events on */
  channelRef: React.RefObject<ReturnType<import("@supabase/supabase-js").SupabaseClient["channel"]> | null>;
  channelReady: boolean;
}

interface UseVanishModeReturn {
  vanishActive: boolean;
  vanishMessages: EphemeralMessage[];
  enterVanishMode: () => void;
  exitVanishMode: () => void;
  sendVanishMessage: (body: string) => void;
  /** Call this when a broadcast event of type "vanish_mode_started" is received */
  onRemoteVanishStart: () => void;
  /** Call this when a broadcast event of type "vanish_mode_ended" is received */
  onRemoteVanishEnd: () => void;
  /** Call this when a broadcast event of type "vanish_message_sent" is received */
  onRemoteVanishMessage: (payload: unknown) => void;
  /** Touch gesture helpers — attach to the main chat container */
  touchHandlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
  };
}

export function useVanishMode({
  conversationId,
  meId,
  myName,
  channelRef,
  channelReady,
}: UseVanishModeOptions): UseVanishModeReturn {
  const [vanishActive, setVanishActive] = useState(false);
  const [vanishMessages, setVanishMessages] = useState<EphemeralMessage[]>([]);

  // Touch gesture tracking
  const touchStartY = useRef<number | null>(null);
  const touchStartScreenY = useRef<number | null>(null);

  const broadcastVanishStart = useCallback(() => {
    const ch = channelRef.current;
    if (!ch || !channelReady) return;
    const payload: VanishModeStatePayload = {
      conversation_id: conversationId,
      activated_by: meId,
      timestamp: new Date().toISOString(),
    };
    void ch.send({ type: "broadcast", event: "vanish_mode_started", payload });
  }, [channelRef, channelReady, conversationId, meId]);

  const broadcastVanishEnd = useCallback(() => {
    const ch = channelRef.current;
    if (!ch || !channelReady) return;
    const payload: VanishModeStatePayload = {
      conversation_id: conversationId,
      activated_by: meId,
      timestamp: new Date().toISOString(),
    };
    void ch.send({ type: "broadcast", event: "vanish_mode_ended", payload });
  }, [channelRef, channelReady, conversationId, meId]);

  const enterVanishMode = useCallback(() => {
    setVanishActive(true);
    broadcastVanishStart();
  }, [broadcastVanishStart]);

  const exitVanishMode = useCallback(() => {
    setVanishActive(false);
    setVanishMessages([]);
    broadcastVanishEnd();
  }, [broadcastVanishEnd]);

  const sendVanishMessage = useCallback(
    (body: string) => {
      const trimmed = body.trim();
      if (!trimmed || trimmed.length > VANISH_MAX_BODY_LENGTH) return;

      const msg: EphemeralMessage = {
        id: generateEphemeralId(),
        conversation_id: conversationId,
        sender_id: meId,
        sender_name: myName,
        body: trimmed,
        created_at: new Date().toISOString(),
      };

      // Append locally immediately (optimistic)
      setVanishMessages((prev) => [...prev, msg]);

      // Broadcast to other participants — NEVER write to Neon
      const ch = channelRef.current;
      if (!ch || !channelReady) {
        console.warn("[VanishMode] Channel not ready — ephemeral message may not be delivered to remote.");
        return;
      }
      const payload: VanishMessagePayload = {
        id: msg.id,
        conversation_id: msg.conversation_id,
        sender_id: msg.sender_id,
        sender_name: msg.sender_name,
        body: msg.body,
        created_at: msg.created_at,
      };
      void ch.send({ type: "broadcast", event: "vanish_message_sent", payload });
    },
    [channelRef, channelReady, conversationId, meId, myName],
  );

  const onRemoteVanishStart = useCallback(() => {
    setVanishActive(true);
  }, []);

  const onRemoteVanishEnd = useCallback(() => {
    setVanishActive(false);
    setVanishMessages([]);
  }, []);

  const onRemoteVanishMessage = useCallback(
    (raw: unknown) => {
      const payload = (raw as { payload?: unknown })?.payload ?? raw;
      if (!isValidVanishMessagePayload(payload, conversationId, meId)) {
        console.warn("[VanishMode] Rejected malformed or unauthorized vanish_message_sent event.");
        return;
      }
      const msg: EphemeralMessage = {
        id: payload.id,
        conversation_id: payload.conversation_id,
        sender_id: payload.sender_id,
        sender_name: payload.sender_name,
        body: payload.body,
        created_at: payload.created_at,
      };
      setVanishMessages((prev) => [...prev, msg]);
    },
    [conversationId, meId],
  );

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
    vanishMessages,
    enterVanishMode,
    exitVanishMode,
    sendVanishMessage,
    onRemoteVanishStart,
    onRemoteVanishEnd,
    onRemoteVanishMessage,
    touchHandlers,
  };
}
