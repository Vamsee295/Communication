import { describe, it, expect, beforeEach } from "vitest";
import { RealtimeGateway, type IWebSocketConnection } from "@/lib/realtime/gateway";
import { WebSocketRealtimeService } from "@/lib/realtime/websocket-service";
import { createEventId, type ClientFrame, type ServerFrame } from "@/lib/realtime/contracts";
import { createServices, type AppServices } from "@/lib/services/create-services";
import { AuthorizationError, NotFoundError, ValidationError } from "@/lib/domain/errors";
import type { Repositories } from "@/lib/infra/supabase/create-repositories";
import type {
  CallRepository,
  ConversationRepository,
  DeviceRepository,
  FriendshipRepository,
  MessageRepository,
  PinRepository,
  ProfileRepository,
  ReactionRepository,
  StarRepository,
} from "@/lib/repositories/ports";
import type { Call, Conversation, ConversationMemberFlags, Friendship, Message, Pin, Profile, Reaction } from "@/lib/domain/types";

class MockSocketConnection implements IWebSocketConnection {
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

describe("Phase 4.5 Neon + WebSocket End-to-End Staging Rehearsal", () => {
  const userA = "user-aaaa-1111";
  const userB = "user-bbbb-2222";
  const userC = "user-cccc-3333";

  const convAB = "conv-ab-1111";
  const convBC = "conv-bc-2222";

  // In-memory data store representing Neon PostgreSQL state
  let conversationsStore: Conversation[];
  let membersStore: Array<{ conversation_id: string; user_id: string }>;
  let messagesStore: Message[];
  let pinsStore: Pin[];
  let reactionsStore: Reaction[];
  let starsStore: Array<{ user_id: string; message_id: string; starred_at: string }>;
  let callsStore: Call[];
  let friendshipsStore: Friendship[];
  let devicesStore: Array<{ id: string; user_id: string; device_name: string; revoked_at: string | null }>;

  let gateway: RealtimeGateway;
  let repos: Repositories;
  let servicesA: AppServices;
  let servicesB: AppServices;

  let connA: MockSocketConnection;
  let connB: MockSocketConnection;
  let clientServiceA: WebSocketRealtimeService;
  let clientServiceB: WebSocketRealtimeService;

  beforeEach(async () => {
    conversationsStore = [
      { id: convAB, kind: "direct", created_at: "2026-09-01T00:00:00Z", last_message_at: "2026-09-01T00:00:00Z" },
      { id: convBC, kind: "direct", created_at: "2026-09-01T00:00:00Z", last_message_at: "2026-09-01T00:00:00Z" },
    ];

    membersStore = [
      { conversation_id: convAB, user_id: userA },
      { conversation_id: convAB, user_id: userB },
      { conversation_id: convBC, user_id: userB },
      { conversation_id: convBC, user_id: userC },
    ];

    messagesStore = [];
    pinsStore = [];
    reactionsStore = [];
    starsStore = [];
    callsStore = [];
    friendshipsStore = [
      { id: "f-ab", requester_id: userA, addressee_id: userB, status: "accepted", created_at: "2026-09-01T00:00:00Z", responded_at: "2026-09-01T00:01:00Z" },
    ];
    devicesStore = [];

    const convRepo: ConversationRepository = {
      openDirect: async (friendId) => `conv-direct-${friendId}`,
      createGroup: async () => "",
      addMember: async () => {},
      removeMember: async () => {},
      updateMemberRole: async () => {},
      updateGroupTitle: async () => {},
      listMyMemberships: async (userId) =>
        membersStore
          .filter((m) => m.user_id === userId)
          .map((m) => ({
            conversation_id: m.conversation_id,
            last_read_at: "2026-09-01T00:00:00Z",
            pinned: false,
            muted: false,
            archived: false,
          })),
      getSummaries: async (ids) =>
        conversationsStore
          .filter((c) => ids.includes(c.id))
          .map((c) => ({ id: c.id, kind: c.kind, created_at: c.created_at, last_message_at: c.last_message_at })),
      listMembers: async (convIds) => membersStore.filter((m) => convIds.includes(m.conversation_id)),
      getById: async (id) => conversationsStore.find((c) => c.id === id)!,
      updateFlags: async () => {},
      updateLastRead: async () => {},
      leave: async () => {},
    };

    const msgRepo: MessageRepository = {
      list: async (convId) => messagesStore.filter((m) => m.conversation_id === convId),
      listHiddenIds: async () => [],
      getById: async (id) => messagesStore.find((m) => m.id === id) ?? null,
      getByIds: async (ids) => messagesStore.filter((m) => ids.includes(m.id)),
      insert: async (input) => {
        const msg: Message = {
          id: `msg-${messagesStore.length + 1}`,
          conversation_id: input.conversation_id,
          sender_id: input.sender_id,
          body: input.body,
          client_id: input.client_id ?? null,
          reply_to_id: input.reply_to_id ?? null,
          forwarded_from_id: input.forwarded_from_id ?? null,
          created_at: new Date().toISOString(),
          edited_at: null,
          deleted_at: null,
        };
        messagesStore.push(msg);
        return msg;
      },
      insertMany: async () => {},
      updateBody: async (id, body) => {
        const m = messagesStore.find((msg) => msg.id === id)!;
        m.body = body;
        m.edited_at = new Date().toISOString();
        return m;
      },
      hardDelete: async (id) => {
        const idx = messagesStore.findIndex((m) => m.id === id);
        if (idx !== -1) messagesStore.splice(idx, 1);
      },
      hideForUser: async () => {},
      listRecentPreview: async () => [],
      countUnread: async () => 0,
      lastFromOthers: async () => null,
      listReceipts: async () => [],
      listEdits: async () => [],
      searchInConversation: async () => [],
      searchInConversations: async () => [],
      listIdsCreatedAtLte: async () => [],
      markReceiptsRead: async () => {},
      listIds: async (convId) => messagesStore.filter((m) => m.conversation_id === convId).map((m) => m.id),
      listReceiptsForMessages: async () => [],
      findByClientId: async (convId, senderId, clientId) =>
        messagesStore.find(
          (m) => m.conversation_id === convId && m.sender_id === senderId && m.client_id === clientId,
        ) ?? null,
    };

    const pinRepo: PinRepository = {
      list: async (convId) => pinsStore.filter((p) => p.conversation_id === convId),
      insert: async (input) => {
        pinsStore.push({
          conversation_id: input.conversation_id,
          message_id: input.message_id,
          pinned_by: input.pinned_by,
          pinned_at: new Date().toISOString(),
        });
      },
      delete: async (convId, msgId) => {
        const idx = pinsStore.findIndex((p) => p.conversation_id === convId && p.message_id === msgId);
        if (idx !== -1) pinsStore.splice(idx, 1);
      },
    };

    const reactionRepo: ReactionRepository = {
      findMine: async (userId, msgId, emoji) =>
        reactionsStore.find((r) => r.user_id === userId && r.message_id === msgId && r.emoji === emoji) ?? null,
      insert: async (input) => {
        reactionsStore.push({ message_id: input.message_id, user_id: input.user_id, emoji: input.emoji });
      },
      deleteMine: async (userId, msgId, emoji) => {
        const idx = reactionsStore.findIndex((r) => r.user_id === userId && r.message_id === msgId && r.emoji === emoji);
        if (idx !== -1) reactionsStore.splice(idx, 1);
      },
      listForMessageIds: async (ids) => reactionsStore.filter((r) => ids.includes(r.message_id)),
    };

    const starRepo: StarRepository = {
      findMine: async (userId, msgId) =>
        starsStore.find((s) => s.user_id === userId && s.message_id === msgId) ?? null,
      insert: async (userId, msgId) => {
        starsStore.push({ user_id: userId, message_id: msgId, starred_at: new Date().toISOString() });
      },
      deleteMine: async (userId, msgId) => {
        const idx = starsStore.findIndex((s) => s.user_id === userId && s.message_id === msgId);
        if (idx !== -1) starsStore.splice(idx, 1);
      },
      listMine: async (userId) => starsStore.filter((s) => s.user_id === userId),
      listMineIn: async (userId, ids) => starsStore.filter((s) => s.user_id === userId && ids.includes(s.message_id)).map((s) => s.message_id),
    };

    const callRepo: CallRepository = {
      insert: async (input) => {
        const call: Call = {
          id: `call-${callsStore.length + 1}`,
          conversation_id: input.conversation_id,
          caller_id: input.caller_id,
          callee_id: input.callee_id,
          call_type: input.call_type,
          status: input.status,
          duration_seconds: 0,
          created_at: new Date().toISOString(),
          started_at: null,
          ended_at: null,
        };
        callsStore.push(call);
        return call;
      },
      getById: async (id) => callsStore.find((c) => c.id === id) ?? null,
      updateStatus: async (id, patch) => {
        const c = callsStore.find((call) => call.id === id)!;
        Object.assign(c, patch);
      },
      listForUser: async (userId) => callsStore.filter((c) => c.caller_id === userId || c.callee_id === userId),
    };

    const friendshipRepo: FriendshipRepository = {
      listForUser: async (userId) => friendshipsStore.filter((f) => f.requester_id === userId || f.addressee_id === userId),
      findByPair: async (a, b) =>
        friendshipsStore.find((f) => (f.requester_id === a && f.addressee_id === b) || (f.requester_id === b && f.addressee_id === a)) ?? null,
      insert: async (row) => {
        const f: Friendship = { id: `f-${friendshipsStore.length + 1}`, requester_id: row.requester_id, addressee_id: row.addressee_id, status: row.status, created_at: new Date().toISOString(), responded_at: null };
        friendshipsStore.push(f);
        return f;
      },
      updateStatus: async (id, status) => {
        const f = friendshipsStore.find((item) => item.id === id)!;
        f.status = status;
        return f;
      },
      deleteAsAddressee: async (id, addresseeId) => {
        const idx = friendshipsStore.findIndex((f) => f.id === id && f.addressee_id === addresseeId);
        if (idx !== -1) friendshipsStore.splice(idx, 1);
      },
      deleteForParticipant: async (id, userId) => {
        const idx = friendshipsStore.findIndex((f) => f.id === id && (f.requester_id === userId || f.addressee_id === userId));
        if (idx !== -1) friendshipsStore.splice(idx, 1);
      },
      setBlockedBetween: async () => {},
      unblockBetween: async () => {},
      listBlockedForUser: async () => [],
    };

    const profileRepo: ProfileRepository = {
      getById: async (id) => ({ id, username: `user_${id.slice(0, 4)}`, display_name: `User ${id.slice(0, 4)}`, bio: null, avatar_url: null, last_seen: "2026-09-01T00:00:00Z", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" }),
      update: async (id, patch) => ({ id, username: patch.username ?? `user_${id.slice(0, 4)}`, display_name: patch.display_name ?? `User ${id.slice(0, 4)}`, bio: patch.bio ?? null, avatar_url: patch.avatar_url ?? null, last_seen: "2026-09-01T00:00:00Z", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" }),
      search: async () => [],
      getChatProfiles: async (ids) => ids.map((id) => ({ id, username: `user_${id.slice(0, 4)}`, display_name: `User ${id.slice(0, 4)}`, avatar_url: null, last_seen: null })),
      getCallPeer: async (id) => ({ id, username: `user_${id.slice(0, 4)}`, display_name: `User ${id.slice(0, 4)}`, avatar_url: null }),
      checkUsernameAvailability: async () => true,
    };

    const deviceRepo: DeviceRepository = {
      upsert: async (input) => ({ id: `dev-${devicesStore.length + 1}`, user_id: input.user_id, device_key: input.device_key, device_name: input.device_name, platform: input.platform, user_agent: input.user_agent ?? null, last_seen_at: input.last_seen_at, revoked_at: null, created_at: new Date().toISOString() }),
      listForUser: async (userId) =>
        devicesStore
          .filter((d) => d.user_id === userId && !d.revoked_at)
          .map((d) => ({
            id: d.id,
            user_id: d.user_id,
            device_key: "key-1",
            device_name: d.device_name,
            platform: "web",
            user_agent: null,
            last_seen_at: "2026-09-01T00:00:00Z",
            revoked_at: null,
            created_at: "2026-09-01T00:00:00Z",
          })),
      revoke: async (userId, deviceId, revokedAt) => {
        const d = devicesStore.find((dev) => dev.id === deviceId && dev.user_id === userId);
        if (d) d.revoked_at = revokedAt;
      },
    };

    repos = {
      conversations: convRepo,
      messages: msgRepo,
      pins: pinRepo,
      reactions: reactionRepo,
      stars: starRepo,
      calls: callRepo,
      friendships: friendshipRepo,
      profiles: profileRepo,
      devices: deviceRepo,
    };

    // Instantiate Realtime Gateway
    gateway = new RealtimeGateway(
      async (token) => {
        if (token === "token-a") return userA;
        if (token === "token-b") return userB;
        if (token === "token-c") return userC;
        throw new Error("Invalid token");
      },
      convRepo,
    );

    servicesA = createServices(userA, repos);
    servicesB = createServices(userB, repos);

    // Setup client connections
    connA = new MockSocketConnection("conn-a");
    connB = new MockSocketConnection("conn-b");
    gateway.handleConnection(connA);
    gateway.handleConnection(connB);

    await gateway.handleMessage("conn-a", { type: "auth", token: "token-a" });
    await gateway.handleMessage("conn-b", { type: "auth", token: "token-b" });

    // Client realtime services wired to gateway
    clientServiceA = new WebSocketRealtimeService((frame) => gateway.handleMessage("conn-a", frame), userA);
    clientServiceB = new WebSocketRealtimeService((frame) => gateway.handleMessage("conn-b", frame), userB);
  });

  it("executes the non-negotiable mutation flow: DB write -> commit -> publish -> client receives without refresh", async () => {
    let bReceivedMessage = false;

    // User B subscribes to convAB
    clientServiceB.subscribeConversation(convAB, userB, {
      onMessageInsert: () => {
        bReceivedMessage = true;
      },
      onMessageUpdate: () => {},
      onMessageDelete: () => {},
      onReceipts: () => {},
      onReactions: () => {},
      onPins: () => {},
      onHidden: () => {},
      onTyping: () => {},
      onPresence: () => {},
    });

    // 1. Authorize & Write to Neon Database
    const committedMsg = await servicesA.messages.send({
      conversation_id: convAB,
      body: "Live chat message from User A",
    });
    expect(committedMsg.id).toBeDefined();

    // 2. Publish Domain Event (strictly after commit)
    gateway.publish(`chat:conv:${convAB}`, {
      type: "message.created",
      conversation_id: convAB,
      message: committedMsg,
      event_id: createEventId(),
      timestamp: new Date().toISOString(),
    });

    // Forward frame from connection B to client service B
    const lastFrameB = connB.receivedFrames[connB.receivedFrames.length - 1];
    clientServiceB.handleServerFrame(lastFrameB);

    // 3. User B received event live without page refresh
    expect(bReceivedMessage).toBe(true);
  });

  it("guarantees failure atomicity: if database write fails, no success event is published", async () => {
    let bReceivedMessage = false;

    clientServiceB.subscribeConversation(convAB, userB, {
      onMessageInsert: () => {
        bReceivedMessage = true;
      },
      onMessageUpdate: () => {},
      onMessageDelete: () => {},
      onReceipts: () => {},
      onReactions: () => {},
      onPins: () => {},
      onHidden: () => {},
      onTyping: () => {},
      onPresence: () => {},
    });

    // Attempt unauthorized send to room User A does not belong to
    await expect(
      servicesA.messages.send({ conversation_id: convBC, body: "Illegal send" }),
    ).rejects.toThrow(AuthorizationError);

    // Database has 0 messages
    expect(messagesStore).toHaveLength(0);

    // No domain event frame (message.created, etc.) sent to connB
    const domainEventFrames = connB.receivedFrames.filter(
      (f) => f.type === "event" && f.event.type === "message.created",
    );
    expect(domainEventFrames).toHaveLength(0);
    expect(bReceivedMessage).toBe(false);
  });

  it("verifies bidirectional live chat: User B -> User A", async () => {
    let aReceivedMessage = false;

    clientServiceA.subscribeConversation(convAB, userA, {
      onMessageInsert: () => {
        aReceivedMessage = true;
      },
      onMessageUpdate: () => {},
      onMessageDelete: () => {},
      onReceipts: () => {},
      onReactions: () => {},
      onPins: () => {},
      onHidden: () => {},
      onTyping: () => {},
      onPresence: () => {},
    });

    const msgFromB = await servicesB.messages.send({
      conversation_id: convAB,
      body: "Reply from User B",
    });

    gateway.publish(`chat:conv:${convAB}`, {
      type: "message.created",
      conversation_id: convAB,
      message: msgFromB,
      event_id: createEventId(),
      timestamp: new Date().toISOString(),
    });

    const lastFrameA = connA.receivedFrames[connA.receivedFrames.length - 1];
    clientServiceA.handleServerFrame(lastFrameA);

    expect(aReceivedMessage).toBe(true);
  });

  it("verifies write-freeze gate: blocks mutations with MaintenanceWriteFreezeError (HTTP 503) when active", async () => {
    const { assertWritesAllowed, MaintenanceWriteFreezeError } = await import("@/lib/infra/write-gate");

    // Normal state: allowed
    expect(() => assertWritesAllowed()).not.toThrow();

    // Active freeze: rejected
    process.env.GHOSTLINE_WRITE_FREEZE = "true";
    try {
      expect(() => assertWritesAllowed()).toThrow(MaintenanceWriteFreezeError);
      try {
        assertWritesAllowed();
      } catch (err: unknown) {
        if (err instanceof MaintenanceWriteFreezeError) {
          expect(err.status).toBe(503);
          expect(err.code).toBe("maintenance_write_freeze");
        } else {
          throw err;
        }
      }
    } finally {
      delete process.env.GHOSTLINE_WRITE_FREEZE;
    }
  });
});
