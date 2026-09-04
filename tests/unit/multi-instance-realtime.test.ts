import { describe, it, expect, beforeEach, vi } from "vitest";
import { RealtimeGateway, type IWebSocketConnection } from "@/lib/realtime/gateway";
import { LocalRealtimeCoordinator, DurableObjectRealtimeCoordinator, setRealtimeCoordinator } from "@/lib/realtime/coordinator";
import { createEventId, type ServerFrame } from "@/lib/realtime/contracts";
import type { ConversationRepository } from "@/lib/repositories/ports";
import type { Message } from "@/lib/domain/types";
import { PushDispatcher } from "@/lib/push/push-dispatcher";
import { PostCommitPublisher } from "@/lib/events/post-commit-publisher";
import type { DbClient } from "@/lib/infra/postgres/client";

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

describe("Milestone 4: Multi-Instance Realtime Scaling Suite", () => {
  const userA = "user-aaaa-1111";
  const userB = "user-bbbb-2222";
  const userC = "user-cccc-3333";
  const convAB = "conv-ab-1111";
  const groupConv = "conv-group-9999";

  let membersStore: Array<{ conversation_id: string; user_id: string }>;

  beforeEach(() => {
    membersStore = [
      { conversation_id: convAB, user_id: userA },
      { conversation_id: convAB, user_id: userB },
      { conversation_id: groupConv, user_id: userA },
      { conversation_id: groupConv, user_id: userB },
      { conversation_id: groupConv, user_id: userC },
    ];
  });

  const makeGateway = (coordinator: LocalRealtimeCoordinator) => {
    const mockRepo: Partial<ConversationRepository> = {
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

    const tokenVerifier = async (token: string) => {
      if (token === "token-a") return userA;
      if (token === "token-b") return userB;
      if (token === "token-c") return userC;
      throw new Error("Invalid token");
    };

    return new RealtimeGateway(tokenVerifier, mockRepo as ConversationRepository, coordinator);
  };

  it("1. Two Worker isolates receive realtime events published from either isolate", async () => {
    const coordinator = new LocalRealtimeCoordinator();

    const isolateA = makeGateway(coordinator);
    const isolateB = makeGateway(coordinator);

    const connA = new MockConnection("conn-isolate-a");
    const connB = new MockConnection("conn-isolate-b");

    isolateA.handleConnection(connA);
    isolateB.handleConnection(connB);

    await isolateA.handleMessage("conn-isolate-a", { type: "auth", token: "token-a" });
    await isolateB.handleMessage("conn-isolate-b", { type: "auth", token: "token-b" });

    await isolateA.handleMessage("conn-isolate-a", { type: "subscribe", channel: `chat:conv:${convAB}` });
    await isolateB.handleMessage("conn-isolate-b", { type: "subscribe", channel: `chat:conv:${convAB}` });

    const msgFromA: Message = {
      id: "msg-from-a",
      conversation_id: convAB,
      sender_id: userA,
      body: "Hello from Isolate A",
      client_id: null,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      reply_to_id: null,
      forwarded_from_id: null,
    };

    // Isolate A publishes post-commit
    isolateA.publish(`chat:conv:${convAB}`, {
      type: "message.created",
      conversation_id: convAB,
      message: msgFromA,
      event_id: createEventId(),
      timestamp: new Date().toISOString(),
    });

    // Client B on Isolate B MUST receive event
    const recB = connB.receivedFrames.find((f) => f.type === "event" && f.event.type === "message.created");
    expect(recB).toBeDefined();
    if (recB?.type === "event" && recB.event.type === "message.created") {
      expect(recB.event.message.body).toBe("Hello from Isolate A");
    }
  });

  it("2. Group conversation realtime fans out to all member isolates", async () => {
    const coordinator = new LocalRealtimeCoordinator();
    const isolate1 = makeGateway(coordinator);
    const isolate2 = makeGateway(coordinator);
    const isolate3 = makeGateway(coordinator);

    const connA = new MockConnection("conn-a");
    const connB = new MockConnection("conn-b");
    const connC = new MockConnection("conn-c");

    isolate1.handleConnection(connA);
    isolate2.handleConnection(connB);
    isolate3.handleConnection(connC);

    await isolate1.handleMessage("conn-a", { type: "auth", token: "token-a" });
    await isolate2.handleMessage("conn-b", { type: "auth", token: "token-b" });
    await isolate3.handleMessage("conn-c", { type: "auth", token: "token-c" });

    await isolate1.handleMessage("conn-a", { type: "subscribe", channel: `chat:conv:${groupConv}` });
    await isolate2.handleMessage("conn-b", { type: "subscribe", channel: `chat:conv:${groupConv}` });
    await isolate3.handleMessage("conn-c", { type: "subscribe", channel: `chat:conv:${groupConv}` });

    isolate1.publish(`chat:conv:${groupConv}`, {
      type: "reaction.created",
      conversation_id: groupConv,
      message_id: "m1",
      user_id: userA,
      emoji: "🚀",
      event_id: createEventId(),
      timestamp: new Date().toISOString(),
    });

    expect(connB.receivedFrames.some((f) => f.type === "event" && f.event.type === "reaction.created")).toBe(true);
    expect(connC.receivedFrames.some((f) => f.type === "event" && f.event.type === "reaction.created")).toBe(true);
  });

  it("3. Removed group member cannot subscribe to new events", async () => {
    const coordinator = new LocalRealtimeCoordinator();
    const isolate = makeGateway(coordinator);
    const connC = new MockConnection("conn-c");
    isolate.handleConnection(connC);
    await isolate.handleMessage("conn-c", { type: "auth", token: "token-c" });

    // User C is removed from store
    membersStore = membersStore.filter((m) => !(m.conversation_id === groupConv && m.user_id === userC));

    // User C tries to subscribe to groupConv
    await isolate.handleMessage("conn-c", { type: "subscribe", channel: `chat:conv:${groupConv}` });

    expect(connC.receivedFrames).toContainEqual({
      type: "error",
      code: "FORBIDDEN",
      message: "Not a member of this conversation",
    });
  });

  it("4. PushDispatcher remains independent and is not duplicated by multi-instance coordinator", async () => {
    const mockDb = vi.fn().mockImplementation(async () => []);
    const pushDispatcher = new PushDispatcher(mockDb as unknown as DbClient);
    const publisher = new PostCommitPublisher([pushDispatcher]);

    const msg: Message = {
      id: "m-push-1",
      conversation_id: convAB,
      sender_id: userA,
      body: "Test push isolation",
      client_id: null,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      reply_to_id: null,
      forwarded_from_id: null,
    };

    await publisher.messageCreated(msg);
    expect(mockDb).toHaveBeenCalledTimes(1); // Executed exactly once by postCommitPublisher
  });

  it("5. DurableObjectRealtimeCoordinator routes broadcast payload to DO stub", async () => {
    const mockDoFetch = vi.fn().mockResolvedValue(new Response("OK", { status: 200 }));
    const mockGetDoStub = vi.fn().mockReturnValue({ fetch: mockDoFetch });

    const doCoordinator = new DurableObjectRealtimeCoordinator(mockGetDoStub);
    setRealtimeCoordinator(doCoordinator);

    const testEvent = {
      type: "message.deleted" as const,
      conversation_id: convAB,
      message_id: "m99",
      event_id: createEventId(),
      timestamp: new Date().toISOString(),
    };

    await doCoordinator.broadcastToChannel(`chat:conv:${convAB}`, testEvent);

    expect(mockGetDoStub).toHaveBeenCalledWith(`chat:conv:${convAB}`);
    expect(mockDoFetch).toHaveBeenCalled();
  });
});
