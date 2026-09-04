import type {
  ConversationRealtimeHandlers,
  ConversationRealtimeSession,
  RealtimeService,
  Unsubscribe,
} from "@/lib/ports/realtime";
import type { ClientFrame, RealtimeDomainEvent, ServerFrame } from "./contracts";
import type { RealtimeGateway } from "./gateway";

export type WebSocketClientTransport = {
  send(frame: ClientFrame): void;
  onMessage(handler: (frame: ServerFrame) => void): void;
  disconnect(): void;
};

/**
 * Client-side Realtime Service communicating over WebSocket (or in-memory Gateway transport).
 * Implements Ghostline's standard `RealtimeService` port.
 */
export class WebSocketRealtimeService implements RealtimeService {
  private readonly conversationSubscriptions = new Map<string, ConversationRealtimeHandlers>();
  private readonly inboxSubscriptions = new Map<
    string,
    { onMessageInsert: () => void; onFriendshipChange: () => void }
  >();
  private globalPresenceHandler: ((ids: Set<string>) => void) | null = null;
  private readonly processedEventIds = new Set<string>();

  constructor(
    private readonly sendFrame: (frame: ClientFrame) => void,
    private readonly currentUserId: string,
  ) {}

  /**
   * Called whenever a ServerFrame arrives from the WebSocket
   */
  handleServerFrame(frame: ServerFrame) {
    switch (frame.type) {
      case "presence": {
        if (frame.channel === "presence:ghostline" && this.globalPresenceHandler) {
          this.globalPresenceHandler(new Set(frame.online_ids));
        }
        break;
      }

      case "event": {
        this.routeDomainEvent(frame.channel, frame.event);
        break;
      }
    }
  }

  private routeDomainEvent(channel: string, event: RealtimeDomainEvent) {
    // Deduplication check: drop duplicate event arrivals
    if ("event_id" in event && event.event_id) {
      if (this.processedEventIds.has(event.event_id)) {
        return; // Duplicate frame, ignore
      }
      this.processedEventIds.add(event.event_id);
      if (this.processedEventIds.size > 2000) {
        // Prune oldest 500
        const arr = Array.from(this.processedEventIds);
        for (let i = 0; i < 500; i++) this.processedEventIds.delete(arr[i]);
      }
    }

    // 1. Inbox events
    if (channel.startsWith("chat:global:")) {
      const userId = channel.replace("chat:global:", "");
      const inboxHandler = this.inboxSubscriptions.get(userId);
      if (inboxHandler) {
        if (event.type === "message.created") inboxHandler.onMessageInsert();
        if (event.type === "friendship.updated") inboxHandler.onFriendshipChange();
      }
    }

    // 2. Conversation events
    if (channel.startsWith("chat:conv:")) {
      const conversationId = channel.replace("chat:conv:", "");
      const handlers = this.conversationSubscriptions.get(conversationId);
      if (!handlers) return;

      switch (event.type) {
        case "message.created":
          handlers.onMessageInsert();
          break;
        case "message.updated":
          handlers.onMessageUpdate();
          break;
        case "message.deleted":
          handlers.onMessageDelete(event.message_id);
          break;
        case "message.hidden":
          if (event.user_id === this.currentUserId) {
            handlers.onHidden(event.message_id);
          }
          break;
        case "receipt.updated":
          handlers.onReceipts();
          break;
        case "reaction.created":
        case "reaction.deleted":
          handlers.onReactions();
          break;
        case "pin.created":
        case "pin.deleted":
          handlers.onPins();
          break;
        case "typing":
          if (event.user_id !== this.currentUserId) {
            handlers.onTyping(event.user_id);
          }
          break;
        case "presence.sync":
          handlers.onPresence(new Set(event.online_ids.filter((id) => id !== this.currentUserId)));
          break;
      }
    }
  }

  subscribeInbox(
    userId: string,
    handlers: { onMessageInsert: () => void; onFriendshipChange: () => void },
  ): Unsubscribe {
    const channel = `chat:global:${userId}`;
    this.inboxSubscriptions.set(userId, handlers);
    this.sendFrame({ type: "subscribe", channel });

    return () => {
      this.inboxSubscriptions.delete(userId);
      this.sendFrame({ type: "unsubscribe", channel });
    };
  }

  subscribeConversation(
    conversationId: string,
    userId: string,
    handlers: ConversationRealtimeHandlers,
  ): ConversationRealtimeSession {
    const channel = `chat:conv:${conversationId}`;
    this.conversationSubscriptions.set(conversationId, handlers);
    this.sendFrame({ type: "subscribe", channel });
    handlers.onReady?.();

    return {
      unsubscribe: () => {
        this.conversationSubscriptions.delete(conversationId);
        this.sendFrame({ type: "unsubscribe", channel });
      },
      sendTyping: () => {
        this.sendFrame({ type: "typing", conversation_id: conversationId });
      },
    };
  }

  subscribeGlobalPresence(userId: string, onOnlineIds: (ids: Set<string>) => void): Unsubscribe {
    const channel = "presence:ghostline";
    this.globalPresenceHandler = onOnlineIds;
    this.sendFrame({ type: "subscribe", channel });

    return () => {
      this.globalPresenceHandler = null;
      this.sendFrame({ type: "unsubscribe", channel });
    };
  }
}
