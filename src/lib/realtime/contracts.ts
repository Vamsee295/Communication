import type { Message, Pin, Reaction } from "@/lib/domain/types";

/**
 * Domain Event Types for Ghostline Realtime Gateway
 */
export type RealtimeDomainEvent =
  // Message Events
  | {
      type: "message.created";
      conversation_id: string;
      message: Message;
      event_id: string;
      timestamp: string;
    }
  | {
      type: "message.updated";
      conversation_id: string;
      message: Message;
      event_id: string;
      timestamp: string;
    }
  | {
      type: "message.deleted";
      conversation_id: string;
      message_id: string;
      event_id: string;
      timestamp: string;
    }
  | {
      type: "message.hidden";
      conversation_id: string;
      message_id: string;
      user_id: string;
      event_id: string;
      timestamp: string;
    }
  // Engagement Events
  | {
      type: "receipt.updated";
      conversation_id: string;
      up_to_created_at: string;
      user_id: string;
      event_id: string;
      timestamp: string;
    }
  | {
      type: "reaction.created";
      conversation_id: string;
      message_id: string;
      user_id: string;
      emoji: string;
      event_id: string;
      timestamp: string;
    }
  | {
      type: "reaction.deleted";
      conversation_id: string;
      message_id: string;
      user_id: string;
      emoji: string;
      event_id: string;
      timestamp: string;
    }
  | {
      type: "pin.created";
      conversation_id: string;
      message_id: string;
      pinned_by: string;
      event_id: string;
      timestamp: string;
    }
  | {
      type: "pin.deleted";
      conversation_id: string;
      message_id: string;
      event_id: string;
      timestamp: string;
    }
  // Conversation & Social Events
  | {
      type: "conversation.updated";
      conversation_id: string;
      user_id: string;
      event_id: string;
      timestamp: string;
    }
  | {
      type: "friendship.updated";
      user_id: string;
      other_user_id: string;
      action: string;
      event_id: string;
      timestamp: string;
    }
  // Ephemeral Events
  | {
      type: "typing";
      conversation_id: string;
      user_id: string;
      timestamp: string;
    }
  | {
      type: "presence.sync";
      conversation_id?: string;
      online_ids: string[];
      timestamp: string;
    };

/**
 * Client-to-Server Protocol Frames
 */
export type ClientFrame =
  | { type: "auth"; token: string }
  | { type: "subscribe"; channel: string } // e.g., "chat:conv:<convId>" or "chat:global:<userId>"
  | { type: "unsubscribe"; channel: string }
  | { type: "typing"; conversation_id: string }
  | { type: "ping" };

/**
 * Server-to-Client Protocol Frames
 */
export type ServerFrame =
  | { type: "authenticated"; user_id: string }
  | { type: "subscribed"; channel: string }
  | { type: "unsubscribed"; channel: string }
  | { type: "event"; channel: string; event: RealtimeDomainEvent }
  | { type: "presence"; channel: string; online_ids: string[] }
  | { type: "pong" }
  | { type: "error"; message: string; code: string };

/**
 * Helper to generate unique event ID
 */
export function createEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
