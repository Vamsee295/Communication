import { AuthorizationError } from "@/lib/domain/errors";
import type { ConversationRepository } from "@/lib/repositories/ports";
import type { ClientFrame, RealtimeDomainEvent, ServerFrame } from "./contracts";
import { getRealtimeCoordinator, type IRealtimeCoordinator } from "./coordinator";

export interface IWebSocketConnection {
  readonly id: string;
  userId: string | null;
  send(frame: ServerFrame): void;
  close(code?: number, reason?: string): void;
}

export type TokenVerifier = (token: string) => Promise<string>; // Returns userId or throws

/**
 * Ghostline Realtime Gateway
 * In-process, horizontally partitionable WebSocket hub with conversation authorization,
 * presence tracking, typing indicators, and reliable fanout.
 */
export class RealtimeGateway {
  // Connection mapping: connectionId -> IWebSocketConnection
  private readonly connections = new Map<string, IWebSocketConnection>();

  // User mapping: userId -> Set<connectionId> (Supports multiple browser tabs per user)
  private readonly userConnections = new Map<string, Set<string>>();

  // Channel subscriptions: channelName -> Set<connectionId>
  private readonly channelSubscriptions = new Map<string, Set<string>>();

  // Active presence: channelName -> Set<userId>
  private readonly channelPresence = new Map<string, Set<string>>();

  constructor(
    private readonly verifyToken: TokenVerifier,
    private readonly conversationRepo?: ConversationRepository,
    private readonly coordinator: IRealtimeCoordinator = getRealtimeCoordinator(),
  ) {
    // Listen for remote events originating from other isolates
    this.coordinator.onRemoteEvent((channel, event) => {
      this.broadcastLocal(channel, event);
    });
  }

  /**
   * Register a new client WebSocket connection
   */
  handleConnection(conn: IWebSocketConnection) {
    this.connections.set(conn.id, conn);
  }

  /**
   * Handle incoming frame from a connected client
   */
  async handleMessage(connId: string, frame: ClientFrame) {
    const conn = this.connections.get(connId);
    if (!conn) return;

    switch (frame.type) {
      case "ping": {
        conn.send({ type: "pong" });
        break;
      }

      case "auth": {
        try {
          const userId = await this.verifyToken(frame.token);
          conn.userId = userId;

          let userSet = this.userConnections.get(userId);
          if (!userSet) {
            userSet = new Set();
            this.userConnections.set(userId, userSet);
          }
          userSet.add(connId);

          conn.send({ type: "authenticated", user_id: userId });

          // Auto-track presence in global channel
          this.trackPresence("presence:ghostline", userId);
        } catch {
          conn.send({ type: "error", code: "AUTH_FAILED", message: "Invalid or expired token" });
        }
        break;
      }

      case "subscribe": {
        if (!conn.userId) {
          conn.send({ type: "error", code: "UNAUTHENTICATED", message: "Must authenticate before subscribing" });
          return;
        }

        const channel = frame.channel;
        try {
          // Authorize channel subscription
          await this.authorizeSubscription(conn.userId, channel);

          let subSet = this.channelSubscriptions.get(channel);
          if (!subSet) {
            subSet = new Set();
            this.channelSubscriptions.set(channel, subSet);
          }
          subSet.add(connId);

          conn.send({ type: "subscribed", channel });

          // Track presence if it's a conversation channel or presence channel
          if (channel.startsWith("chat:conv:")) {
            this.trackPresence(channel, conn.userId);
          } else if (channel === "presence:ghostline") {
            const online = Array.from(this.channelPresence.get("presence:ghostline") ?? []);
            conn.send({ type: "presence", channel, online_ids: online });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Subscription forbidden";
          conn.send({ type: "error", code: "FORBIDDEN", message: msg });
        }
        break;
      }

      case "unsubscribe": {
        const channel = frame.channel;
        const subSet = this.channelSubscriptions.get(channel);
        if (subSet) {
          subSet.delete(connId);
          if (subSet.size === 0) this.channelSubscriptions.delete(channel);
        }

        if (conn.userId && channel.startsWith("chat:conv:")) {
          this.untrackPresence(channel, conn.userId);
        }
        conn.send({ type: "unsubscribed", channel });
        break;
      }

      case "typing": {
        if (!conn.userId) return;
        const channel = `chat:conv:${frame.conversation_id}`;
        // Verify user is in channel
        const subSet = this.channelSubscriptions.get(channel);
        if (subSet && subSet.has(connId)) {
          this.broadcast(channel, {
            type: "typing",
            conversation_id: frame.conversation_id,
            user_id: conn.userId,
            timestamp: new Date().toISOString(),
          }, connId); // exclude self
        }
        break;
      }
    }
  }

  /**
   * Handle client disconnection and cleanup
   */
  handleDisconnection(connId: string) {
    const conn = this.connections.get(connId);
    if (!conn) return;

    const userId = conn.userId;
    this.connections.delete(connId);

    // Remove from userConnections
    if (userId) {
      const userSet = this.userConnections.get(userId);
      if (userSet) {
        userSet.delete(connId);
        if (userSet.size === 0) {
          this.userConnections.delete(userId);
          // If no more tabs for this user, untrack from global presence
          this.untrackPresence("presence:ghostline", userId);
        }
      }
    }

    // Remove from channelSubscriptions
    for (const [channel, subs] of this.channelSubscriptions.entries()) {
      if (subs.has(connId)) {
        subs.delete(connId);
        if (userId && channel.startsWith("chat:conv:")) {
          // If no more connections in this room for this user, untrack
          const stillInRoom = Array.from(subs).some(
            (otherId) => this.connections.get(otherId)?.userId === userId,
          );
          if (!stillInRoom) {
            this.untrackPresence(channel, userId);
          }
        }
        if (subs.size === 0) {
          this.channelSubscriptions.delete(channel);
        }
      }
    }
  }

  /**
   * Authorize whether a user is allowed to subscribe to a given channel
   */
  private async authorizeSubscription(userId: string, channel: string): Promise<void> {
    if (channel.startsWith("chat:global:")) {
      const targetUserId = channel.replace("chat:global:", "");
      if (targetUserId !== userId) {
        throw new AuthorizationError("Cannot subscribe to another user's global inbox");
      }
      return;
    }

    if (channel.startsWith("chat:conv:")) {
      const conversationId = channel.replace("chat:conv:", "");
      if (this.conversationRepo) {
        const memberships = await this.conversationRepo.listMyMemberships(userId);
        const isMember = memberships.some((m) => m.conversation_id === conversationId);
        if (!isMember) {
          throw new AuthorizationError("Not a member of this conversation");
        }
      }
      return;
    }

    if (channel === "presence:ghostline") {
      return; // Global presence is open to any authenticated user
    }

    throw new AuthorizationError(`Unknown channel format: ${channel}`);
  }

  /**
   * Presence helper
   */
  private trackPresence(channel: string, userId: string) {
    let pSet = this.channelPresence.get(channel);
    if (!pSet) {
      pSet = new Set();
      this.channelPresence.set(channel, pSet);
    }
    pSet.add(userId);

    // Broadcast presence update
    const online = Array.from(pSet);
    this.broadcast(channel, {
      type: "presence.sync",
      conversation_id: channel.startsWith("chat:conv:") ? channel.replace("chat:conv:", "") : undefined,
      online_ids: online,
      timestamp: new Date().toISOString(),
    });
  }

  private untrackPresence(channel: string, userId: string) {
    const pSet = this.channelPresence.get(channel);
    if (pSet) {
      pSet.delete(userId);
      const online = Array.from(pSet);
      this.broadcast(channel, {
        type: "presence.sync",
        conversation_id: channel.startsWith("chat:conv:") ? channel.replace("chat:conv:", "") : undefined,
        online_ids: online,
        timestamp: new Date().toISOString(),
      });
      if (pSet.size === 0) this.channelPresence.delete(channel);
    }
  }

  /**
   * Publish a committed domain event to a channel
   * Invoked by Server Functions ONLY AFTER database transaction commits.
   */
  publish(channel: string, event: RealtimeDomainEvent) {
    // Dispatch via coordinator for cross-isolate fanout
    void this.coordinator.broadcastToChannel(channel, event);
  }

  /**
   * Broadcast an event to all authorized local subscribers of a channel
   */
  private broadcast(channel: string, event: RealtimeDomainEvent, excludeConnId?: string) {
    this.broadcastLocal(channel, event, excludeConnId);
  }

  private broadcastLocal(channel: string, event: RealtimeDomainEvent, excludeConnId?: string) {
    const subs = this.channelSubscriptions.get(channel);
    if (!subs || subs.size === 0) return;

    const frame: ServerFrame = {
      type: "event",
      channel,
      event,
    };

    for (const connId of subs) {
      if (excludeConnId && connId === excludeConnId) continue;
      const conn = this.connections.get(connId);
      if (conn) {
        conn.send(frame);
      }
    }
  }

  // Diagnostic getters for testing
  getConnectedUserCount(): number {
    return this.userConnections.size;
  }

  getChannelSubscribers(channel: string): Set<string> {
    return this.channelSubscriptions.get(channel) ?? new Set();
  }
}
