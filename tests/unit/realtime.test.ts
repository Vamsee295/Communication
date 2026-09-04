import { describe, it, expect, beforeEach } from "vitest";
import { RealtimeGateway, type IWebSocketConnection } from "@/lib/realtime/gateway";
import { WebSocketRealtimeService } from "@/lib/realtime/websocket-service";
import { createEventId, type ClientFrame, type ServerFrame } from "@/lib/realtime/contracts";
import type { ConversationRepository } from "@/lib/repositories/ports";
import type { Conversation, ConversationMemberFlags, Message } from "@/lib/domain/types";

// Mock WebSocket Connection implementing IWebSocketConnection
class MockConnection implements IWebSocketConnection {
  userId: string | null = null;
  readonly receivedFrames: ServerFrame[] = [];
  isClosed = false;

  constructor(readonly id: string) {}

  send(frame: ServerFrame): void {
    this.receivedFrames.push(frame);
  }

  close(_code?: number, _reason?: string): void {
    this.isClosed = true;
  }
}

describe("Phase 4 Ghostline Realtime Gateway & Protocol Tests", () => {
  const userA = "user-aaaa-1111";
  const userB = "user-bbbb-2222";
  const userC = "user-cccc-3333";

  const convAB = "conv-ab-1111";
  const convBC = "conv-bc-2222"; // Private between B and C (A is NOT a member)

  let gateway: RealtimeGateway;
  let membersStore: Array<{ conversation_id: string; user_id: string }>;

  beforeEach(() => {
    membersStore = [
      { conversation_id: convAB, user_id: userA },
      { conversation_id: convAB, user_id: userB },
      { conversation_id: convBC, user_id: userB },
      { conversation_id: convBC, user_id: userC },
    ];

    const mockConvRepo: Partial<ConversationRepository> = {
      listMyMemberships: async (userId: string) =>
        membersStore
          .filter((m) => m.user_id === userId)
          .map((m) => ({
            conversation_id: m.conversation_id,
            last_read_at: "2026-09-01T00:00:00Z",
            pinned: false,
            muted: false,
            archived: false,
          })),
    };

    // Verified token verifier mock
    const tokenVerifier = async (token: string) => {
      if (token === "token-a") return userA;
      if (token === "token-b") return userB;
      if (token === "token-c") return userC;
      throw new Error("Invalid token");
    };

    gateway = new RealtimeGateway(tokenVerifier, mockConvRepo as ConversationRepository);
  });

  describe("1. Authentication & Lifecycle", () => {
    it("successfully authenticates connection with valid token", async () => {
      const conn = new MockConnection("conn-1");
      gateway.handleConnection(conn);

      await gateway.handleMessage("conn-1", { type: "auth", token: "token-a" });

      expect(conn.userId).toBe(userA);
      expect(conn.receivedFrames).toContainEqual({ type: "authenticated", user_id: userA });
    });

    it("rejects authentication with invalid token", async () => {
      const conn = new MockConnection("conn-bad");
      gateway.handleConnection(conn);

      await gateway.handleMessage("conn-bad", { type: "auth", token: "invalid-token" });

      expect(conn.userId).toBeNull();
      expect(conn.receivedFrames).toContainEqual({
        type: "error",
        code: "AUTH_FAILED",
        message: "Invalid or expired token",
      });
    });

    it("responds to ping frame with pong", async () => {
      const conn = new MockConnection("conn-ping");
      gateway.handleConnection(conn);

      await gateway.handleMessage("conn-ping", { type: "ping" });
      expect(conn.receivedFrames).toContainEqual({ type: "pong" });
    });

    it("cleans up user and channel mappings on disconnect", async () => {
      const conn = new MockConnection("conn-disc");
      gateway.handleConnection(conn);

      await gateway.handleMessage("conn-disc", { type: "auth", token: "token-a" });
      await gateway.handleMessage("conn-disc", { type: "subscribe", channel: `chat:conv:${convAB}` });

      expect(gateway.getConnectedUserCount()).toBe(1);
      expect(gateway.getChannelSubscribers(`chat:conv:${convAB}`).has("conn-disc")).toBe(true);

      gateway.handleDisconnection("conn-disc");

      expect(gateway.getConnectedUserCount()).toBe(0);
      expect(gateway.getChannelSubscribers(`chat:conv:${convAB}`).has("conn-disc")).toBe(false);
    });
  });

  describe("2. Subscription Authorization & Channel Isolation", () => {
    it("allows User A and User B to subscribe to their shared conversation convAB", async () => {
      const connA = new MockConnection("conn-a");
      const connB = new MockConnection("conn-b");
      gateway.handleConnection(connA);
      gateway.handleConnection(connB);

      await gateway.handleMessage("conn-a", { type: "auth", token: "token-a" });
      await gateway.handleMessage("conn-b", { type: "auth", token: "token-b" });

      await gateway.handleMessage("conn-a", { type: "subscribe", channel: `chat:conv:${convAB}` });
      await gateway.handleMessage("conn-b", { type: "subscribe", channel: `chat:conv:${convAB}` });

      expect(connA.receivedFrames).toContainEqual({ type: "subscribed", channel: `chat:conv:${convAB}` });
      expect(connB.receivedFrames).toContainEqual({ type: "subscribed", channel: `chat:conv:${convAB}` });
    });

    it("DENIES User A from subscribing to private conversation convBC (Unauthorized IDOR attempt)", async () => {
      const connA = new MockConnection("conn-a");
      gateway.handleConnection(connA);

      await gateway.handleMessage("conn-a", { type: "auth", token: "token-a" });
      await gateway.handleMessage("conn-a", { type: "subscribe", channel: `chat:conv:${convBC}` });

      expect(connA.receivedFrames).toContainEqual({
        type: "error",
        code: "FORBIDDEN",
        message: "Not a member of this conversation",
      });
      expect(gateway.getChannelSubscribers(`chat:conv:${convBC}`).has("conn-a")).toBe(false);
    });

    it("DENIES User A from subscribing to User B's global inbox channel", async () => {
      const connA = new MockConnection("conn-a");
      gateway.handleConnection(connA);

      await gateway.handleMessage("conn-a", { type: "auth", token: "token-a" });
      await gateway.handleMessage("conn-a", { type: "subscribe", channel: `chat:global:${userB}` });

      expect(connA.receivedFrames).toContainEqual({
        type: "error",
        code: "FORBIDDEN",
        message: "Cannot subscribe to another user's global inbox",
      });
    });
  });

  describe("3. Realtime Domain Event Delivery & Fanout", () => {
    it("delivers committed message.created event only to authorized conversation members", async () => {
      const connA = new MockConnection("conn-a");
      const connB = new MockConnection("conn-b");
      const connC = new MockConnection("conn-c"); // Member of convBC, not convAB
      gateway.handleConnection(connA);
      gateway.handleConnection(connB);
      gateway.handleConnection(connC);

      await gateway.handleMessage("conn-a", { type: "auth", token: "token-a" });
      await gateway.handleMessage("conn-b", { type: "auth", token: "token-b" });
      await gateway.handleMessage("conn-c", { type: "auth", token: "token-c" });

      await gateway.handleMessage("conn-a", { type: "subscribe", channel: `chat:conv:${convAB}` });
      await gateway.handleMessage("conn-b", { type: "subscribe", channel: `chat:conv:${convAB}` });
      await gateway.handleMessage("conn-c", { type: "subscribe", channel: `chat:conv:${convBC}` });

      const testMsg: Message = {
        id: "msg-123",
        conversation_id: convAB,
        sender_id: userA,
        body: "Realtime test message",
        client_id: "client-1",
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        reply_to_id: null,
        forwarded_from_id: null,
      };

      // Server Function commits DB write, then publishes:
      gateway.publish(`chat:conv:${convAB}`, {
        type: "message.created",
        conversation_id: convAB,
        message: testMsg,
        event_id: createEventId(),
        timestamp: new Date().toISOString(),
      });

      // User A and User B received event
      const eventA = connA.receivedFrames.find(
        (f) => f.type === "event" && f.event.type === "message.created",
      );
      const eventB = connB.receivedFrames.find(
        (f) => f.type === "event" && f.event.type === "message.created",
      );
      expect(eventA).toBeDefined();
      expect(eventB).toBeDefined();

      // User C NEVER receives event from convAB
      const eventFromConvAB = connC.receivedFrames.find(
        (f) => f.type === "event" && f.channel === `chat:conv:${convAB}`,
      );
      expect(eventFromConvAB).toBeUndefined();
    });

    it("delivers message.updated and message.deleted events correctly", async () => {
      const connB = new MockConnection("conn-b");
      gateway.handleConnection(connB);
      await gateway.handleMessage("conn-b", { type: "auth", token: "token-b" });
      await gateway.handleMessage("conn-b", { type: "subscribe", channel: `chat:conv:${convAB}` });

      const testMsg: Message = {
        id: "msg-123",
        conversation_id: convAB,
        sender_id: userA,
        body: "Edited body",
        client_id: null,
        created_at: new Date().toISOString(),
        edited_at: new Date().toISOString(),
        deleted_at: null,
        reply_to_id: null,
        forwarded_from_id: null,
      };

      // 1. Edit
      gateway.publish(`chat:conv:${convAB}`, {
        type: "message.updated",
        conversation_id: convAB,
        message: testMsg,
        event_id: createEventId(),
        timestamp: new Date().toISOString(),
      });

      // 2. Delete
      gateway.publish(`chat:conv:${convAB}`, {
        type: "message.deleted",
        conversation_id: convAB,
        message_id: "msg-123",
        event_id: createEventId(),
        timestamp: new Date().toISOString(),
      });

      expect(
        connB.receivedFrames.some((f) => f.type === "event" && f.event.type === "message.updated"),
      ).toBe(true);
      expect(
        connB.receivedFrames.some((f) => f.type === "event" && f.event.type === "message.deleted"),
      ).toBe(true);
    });

    it("delivers reaction and pin events", async () => {
      const connB = new MockConnection("conn-b");
      gateway.handleConnection(connB);
      await gateway.handleMessage("conn-b", { type: "auth", token: "token-b" });
      await gateway.handleMessage("conn-b", { type: "subscribe", channel: `chat:conv:${convAB}` });

      // Reaction
      gateway.publish(`chat:conv:${convAB}`, {
        type: "reaction.created",
        conversation_id: convAB,
        message_id: "msg-123",
        user_id: userA,
        emoji: "🔥",
        event_id: createEventId(),
        timestamp: new Date().toISOString(),
      });

      // Pin
      gateway.publish(`chat:conv:${convAB}`, {
        type: "pin.created",
        conversation_id: convAB,
        message_id: "msg-123",
        pinned_by: userA,
        event_id: createEventId(),
        timestamp: new Date().toISOString(),
      });

      expect(
        connB.receivedFrames.some((f) => f.type === "event" && f.event.type === "reaction.created"),
      ).toBe(true);
      expect(
        connB.receivedFrames.some((f) => f.type === "event" && f.event.type === "pin.created"),
      ).toBe(true);
    });
  });

  describe("4. Typing Indicators & Ephemeral Events", () => {
    it("broadcasts typing event to other room peers excluding the sender", async () => {
      const connA = new MockConnection("conn-a");
      const connB = new MockConnection("conn-b");
      gateway.handleConnection(connA);
      gateway.handleConnection(connB);

      await gateway.handleMessage("conn-a", { type: "auth", token: "token-a" });
      await gateway.handleMessage("conn-b", { type: "auth", token: "token-b" });
      await gateway.handleMessage("conn-a", { type: "subscribe", channel: `chat:conv:${convAB}` });
      await gateway.handleMessage("conn-b", { type: "subscribe", channel: `chat:conv:${convAB}` });

      // User A types
      await gateway.handleMessage("conn-a", { type: "typing", conversation_id: convAB });

      // User B received typing frame
      const typingB = connB.receivedFrames.find(
        (f) => f.type === "event" && f.event.type === "typing" && f.event.user_id === userA,
      );
      expect(typingB).toBeDefined();

      // User A did NOT receive their own typing echo
      const typingA = connA.receivedFrames.find(
        (f) => f.type === "event" && f.event.type === "typing",
      );
      expect(typingA).toBeUndefined();
    });
  });

  describe("5. Client Adapter (WebSocketRealtimeService) & Deduplication", () => {
    it("handles incoming domain events and drops duplicate event IDs safely", () => {
      let insertCount = 0;
      let updateCount = 0;

      const sentFrames: ClientFrame[] = [];
      const service = new WebSocketRealtimeService((f) => sentFrames.push(f), userB);

      service.subscribeConversation(convAB, userB, {
        onMessageInsert: () => insertCount++,
        onMessageUpdate: () => updateCount++,
        onMessageDelete: () => {},
        onReceipts: () => {},
        onReactions: () => {},
        onPins: () => {},
        onHidden: () => {},
        onTyping: () => {},
        onPresence: () => {},
      });

      const eventId = "evt-dedupe-101";
      const testMsg: Message = {
        id: "msg-999",
        conversation_id: convAB,
        sender_id: userA,
        body: "Dedupe test",
        client_id: null,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        reply_to_id: null,
        forwarded_from_id: null,
      };

      const serverFrame: ServerFrame = {
        type: "event",
        channel: `chat:conv:${convAB}`,
        event: {
          type: "message.created",
          conversation_id: convAB,
          message: testMsg,
          event_id: eventId,
          timestamp: new Date().toISOString(),
        },
      };

      // First arrival -> Triggers handler
      service.handleServerFrame(serverFrame);
      expect(insertCount).toBe(1);

      // Duplicate arrival (e.g. multi-tab or network re-send) -> Dropped cleanly
      service.handleServerFrame(serverFrame);
      expect(insertCount).toBe(1); // Still 1!
    });
  });

  describe("6. Multiple Tabs per User", () => {
    it("broadcasts event to all active tabs of a user", async () => {
      const tab1 = new MockConnection("conn-b-tab1");
      const tab2 = new MockConnection("conn-b-tab2");
      gateway.handleConnection(tab1);
      gateway.handleConnection(tab2);

      await gateway.handleMessage("conn-b-tab1", { type: "auth", token: "token-b" });
      await gateway.handleMessage("conn-b-tab2", { type: "auth", token: "token-b" });

      await gateway.handleMessage("conn-b-tab1", { type: "subscribe", channel: `chat:conv:${convAB}` });
      await gateway.handleMessage("conn-b-tab2", { type: "subscribe", channel: `chat:conv:${convAB}` });

      gateway.publish(`chat:conv:${convAB}`, {
        type: "pin.deleted",
        conversation_id: convAB,
        message_id: "msg-123",
        event_id: createEventId(),
        timestamp: new Date().toISOString(),
      });

      expect(tab1.receivedFrames.some((f) => f.type === "event" && f.event.type === "pin.deleted")).toBe(true);
      expect(tab2.receivedFrames.some((f) => f.type === "event" && f.event.type === "pin.deleted")).toBe(true);
    });
  });
});
