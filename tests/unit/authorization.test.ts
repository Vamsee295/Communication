/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { AuthorizationPolicies } from "@/lib/auth/authorization";
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

describe("Phase 3 Multi-User Authorization & IDOR Protections", () => {
  const userA = "user-aaaa-1111";
  const userB = "user-bbbb-2222";
  const userC = "user-cccc-3333"; // Unrelated third party

  const convAB = "conv-ab-1111";
  const convBC = "conv-bc-2222"; // Private between B and C (A is NOT a member)

  // In-memory data store
  let conversationsStore: Conversation[];
  let membersStore: Array<{ conversation_id: string; user_id: string }>;
  let membershipsFlagsStore: ConversationMemberFlags[];
  let messagesStore: Message[];
  let pinsStore: Pin[];
  let reactionsStore: Reaction[];
  let starsStore: Array<{ user_id: string; message_id: string; starred_at: string }>;
  let callsStore: Call[];
  let friendshipsStore: Friendship[];
  let devicesStore: Array<{ id: string; user_id: string; device_name: string; revoked_at: string | null }>;

  function buildRepositories(): Repositories {
    const convRepo: ConversationRepository = {
      openDirect: async (friendId) => `conv-direct-${friendId}`,
      createGroup: async () => "",
      addMember: async () => {},
      removeMember: async () => {},
      updateMemberRole: async () => {},
      updateGroupTitle: async () => {},
      listMyMemberships: async (userId) => {
        return membersStore
          .filter((m) => m.user_id === userId)
          .map((m) => ({
            conversation_id: m.conversation_id,
            last_read_at: "2026-09-01T12:00:00.000Z",
            pinned: false,
            muted: false,
            archived: false,
          }));
      },
      getSummaries: async (ids) => {
        return conversationsStore
          .filter((c) => ids.includes(c.id))
          .map((c) => ({ id: c.id, kind: c.kind, created_at: c.created_at, last_message_at: c.last_message_at }));
      },
      listMembers: async (convIds) => {
        return membersStore.filter((m) => convIds.includes(m.conversation_id));
      },
      getById: async (id) => {
        const found = conversationsStore.find((c) => c.id === id);
        if (!found) throw new Error("Conversation not found");
        return found;
      },
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
      insertMany: async (inputs) => {
        for (const input of inputs) {
          messagesStore.push({
            id: `msg-${messagesStore.length + 1}`,
            conversation_id: input.conversation_id,
            sender_id: input.sender_id,
            body: input.body,
            client_id: null,
            reply_to_id: null,
            forwarded_from_id: input.forwarded_from_id ?? null,
            created_at: new Date().toISOString(),
            edited_at: null,
            deleted_at: null,
          });
        }
      },
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
        reactionsStore.push({
          message_id: input.message_id,
          user_id: input.user_id,
          emoji: input.emoji,
        });
      },
      deleteMine: async (userId, msgId, emoji) => {
        const idx = reactionsStore.findIndex(
          (r) => r.user_id === userId && r.message_id === msgId && r.emoji === emoji,
        );
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
      listMineIn: async (userId, ids) =>
        starsStore.filter((s) => s.user_id === userId && ids.includes(s.message_id)).map((s) => s.message_id),
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
      listForUser: async (userId) =>
        callsStore.filter((c) => c.caller_id === userId || c.callee_id === userId),
    };

    const friendshipRepo: FriendshipRepository = {
      listForUser: async (userId) =>
        friendshipsStore.filter((f) => f.requester_id === userId || f.addressee_id === userId),
      findByPair: async (a, b) =>
        friendshipsStore.find(
          (f) =>
            (f.requester_id === a && f.addressee_id === b) || (f.requester_id === b && f.addressee_id === a),
        ) ?? null,
      insert: async (row) => {
        const f: Friendship = {
          id: `f-${friendshipsStore.length + 1}`,
          requester_id: row.requester_id,
          addressee_id: row.addressee_id,
          status: row.status,
          created_at: new Date().toISOString(),
          responded_at: null,
        };
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
        const idx = friendshipsStore.findIndex(
          (f) => f.id === id && (f.requester_id === userId || f.addressee_id === userId),
        );
        if (idx !== -1) friendshipsStore.splice(idx, 1);
      },
      setBlockedBetween: async () => {},
      unblockBetween: async () => {},
      listBlockedForUser: async () => [],
    };

    const profileRepo: ProfileRepository = {
      getById: async (id) => ({
        id,
        username: `user_${id.slice(0, 4)}`,
        display_name: `User ${id.slice(0, 4)}`,
        bio: null,
        avatar_url: null,
        last_seen: "2026-09-01T00:00:00Z",
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      }),
      update: async (id, patch) => ({
        id,
        username: patch.username ?? `user_${id.slice(0, 4)}`,
        display_name: patch.display_name ?? `User ${id.slice(0, 4)}`,
        bio: patch.bio ?? null,
        avatar_url: patch.avatar_url ?? null,
        last_seen: "2026-09-01T00:00:00Z",
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      }),
      search: async () => [],
      getChatProfiles: async (ids) =>
        ids.map((id) => ({
          id,
          username: `user_${id.slice(0, 4)}`,
          display_name: `User ${id.slice(0, 4)}`,
          avatar_url: null,
          last_seen: null,
        })),
      getCallPeer: async (id) => ({
        id,
        username: `user_${id.slice(0, 4)}`,
        display_name: `User ${id.slice(0, 4)}`,
        avatar_url: null,
      }),
    };

    const deviceRepo: DeviceRepository = {
      upsert: async (input) => ({
        id: `dev-${devicesStore.length + 1}`,
        user_id: input.user_id,
        device_key: input.device_key,
        device_name: input.device_name,
        platform: input.platform,
        user_agent: input.user_agent ?? null,
        last_seen_at: input.last_seen_at,
        revoked_at: null,
        created_at: new Date().toISOString(),
      }),
      listForUser: async (userId) =>
        devicesStore.filter((d) => d.user_id === userId && !d.revoked_at) as any,
      revoke: async (userId, deviceId, revokedAt) => {
        const d = devicesStore.find((dev) => dev.id === deviceId && dev.user_id === userId);
        if (d) d.revoked_at = revokedAt;
      },
    };

    return {
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
  }

  let repos: Repositories;
  let servicesA: AppServices;
  let servicesB: AppServices;
  let servicesC: AppServices;

  beforeEach(() => {
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

    messagesStore = [
      {
        id: "msg-ab-1",
        conversation_id: convAB,
        sender_id: userA,
        body: "Hello B from A",
        client_id: null,
        reply_to_id: null,
        forwarded_from_id: null,
        created_at: "2026-09-01T10:00:00Z",
        edited_at: null,
        deleted_at: null,
      },
      {
        id: "msg-bc-1",
        conversation_id: convBC,
        sender_id: userB,
        body: "Secret message from B to C",
        client_id: null,
        reply_to_id: null,
        forwarded_from_id: null,
        created_at: "2026-09-01T11:00:00Z",
        edited_at: null,
        deleted_at: null,
      },
    ];

    pinsStore = [];
    reactionsStore = [];
    starsStore = [];
    callsStore = [
      {
        id: "call-bc-1",
        conversation_id: convBC,
        caller_id: userB,
        callee_id: userC,
        call_type: "voice",
        status: "ringing",
        created_at: "2026-09-01T12:00:00Z",
        started_at: null,
        ended_at: null,
      },
    ];

    friendshipsStore = [
      {
        id: "f-ab",
        requester_id: userA,
        addressee_id: userB,
        status: "accepted",
        created_at: "2026-09-01T00:00:00Z",
        responded_at: "2026-09-01T00:01:00Z",
      },
      {
        id: "f-bc",
        requester_id: userB,
        addressee_id: userC,
        status: "accepted",
        created_at: "2026-09-01T00:00:00Z",
        responded_at: "2026-09-01T00:01:00Z",
      },
      // Note: User A and User C are NOT friends
    ];

    devicesStore = [
      { id: "dev-a-1", user_id: userA, device_name: "Phone A", revoked_at: null },
      { id: "dev-b-1", user_id: userB, device_name: "Laptop B", revoked_at: null },
    ];

    repos = buildRepositories();
    servicesA = createServices(userA, repos);
    servicesB = createServices(userB, repos);
    servicesC = createServices(userC, repos);
  });

  describe("1. Conversation Access & Membership Enforcement", () => {
    it("allows User A and User B to read their shared conversation convAB", async () => {
      const convA = await servicesA.conversations.get(convAB);
      expect(convA.conversation.id).toBe(convAB);

      const convB = await servicesB.conversations.get(convAB);
      expect(convB.conversation.id).toBe(convAB);
    });

    it("DENIES User A from reading User B and C's private conversation convBC (IDOR attempt)", async () => {
      await expect(servicesA.conversations.get(convBC)).rejects.toThrow(AuthorizationError);
    });

    it("DENIES User A from mutating flags in convBC", async () => {
      await expect(
        servicesA.conversations.setFlags(convBC, { pinned: true }),
      ).rejects.toThrow(AuthorizationError);
    });

    it("DENIES User A from marking convBC as unread", async () => {
      await expect(servicesA.conversations.markUnread(convBC)).rejects.toThrow(AuthorizationError);
    });

    it("DENIES User A from leaving convBC", async () => {
      await expect(servicesA.conversations.leave(convBC)).rejects.toThrow(AuthorizationError);
    });
  });

  describe("2. Message Access, Sending, and Manipulation", () => {
    it("allows User A to list messages in convAB", async () => {
      const msgs = await servicesA.messages.list(convAB, { limit: 50 });
      expect(msgs).toHaveLength(1);
      expect(msgs[0].id).toBe("msg-ab-1");
    });

    it("DENIES User A from listing messages in convBC", async () => {
      await expect(servicesA.messages.list(convBC, { limit: 50 })).rejects.toThrow(AuthorizationError);
    });

    it("DENIES User A from fetching private message msg-bc-1 by ID", async () => {
      await expect(servicesA.messages.getByIds(["msg-bc-1"])).rejects.toThrow(AuthorizationError);
    });

    it("DENIES User A from sending a message to convBC", async () => {
      await expect(
        servicesA.messages.send({ conversation_id: convBC, body: "Unauthorized injection" }),
      ).rejects.toThrow(AuthorizationError);
    });

    it("allows User A to edit their own message in convAB", async () => {
      const updated = await servicesA.messages.edit("msg-ab-1", "Updated body by author A");
      expect(updated.body).toBe("Updated body by author A");
    });

    it("DENIES User B from editing User A's message in convAB", async () => {
      await expect(
        servicesB.messages.edit("msg-ab-1", "Hacked body by B"),
      ).rejects.toThrow(AuthorizationError);
    });

    it("DENIES User B from deleting User A's message for everyone", async () => {
      await expect(servicesB.messages.deleteForEveryone("msg-ab-1")).rejects.toThrow(AuthorizationError);
    });

    it("DENIES User A from viewing receipt info of User B's message in convBC", async () => {
      await expect(servicesA.messages.getInfo("msg-bc-1")).rejects.toThrow(AuthorizationError);
    });
  });

  describe("3. Cross-Conversation Reply & Forwarding Boundaries", () => {
    it("DENIES replying to a message from a different conversation", async () => {
      // User B tries to send a message in convAB but references parent msg-bc-1
      await expect(
        servicesB.messages.send({
          conversation_id: convAB,
          body: "Replying across rooms",
          reply_to_id: "msg-bc-1",
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("DENIES forwarding a message that the user cannot access", async () => {
      // User A attempts to forward msg-bc-1 into convAB
      await expect(
        servicesA.messages.forward(["msg-bc-1"], [convAB]),
      ).rejects.toThrow(AuthorizationError);
    });

    it("DENIES forwarding to a destination conversation where the user is not a member", async () => {
      // User A attempts to forward their own msg-ab-1 into convBC
      await expect(
        servicesA.messages.forward(["msg-ab-1"], [convBC]),
      ).rejects.toThrow(AuthorizationError);
    });

    it("allows legitimate forwarding between authorized conversations", async () => {
      // User B is member of both convAB and convBC
      const res = await servicesB.messages.forward(["msg-ab-1"], [convBC]);
      expect(res.count).toBe(1);
    });
  });

  describe("4. Engagement Isolation (Reactions, Pins, Stars)", () => {
    it("allows User A to react to msg-ab-1", async () => {
      const res = await servicesA.reactions.toggle("msg-ab-1", "👍");
      expect(res.added).toBe(true);
    });

    it("DENIES User A from reacting to msg-bc-1 in unauthorized room", async () => {
      await expect(servicesA.reactions.toggle("msg-bc-1", "❤️")).rejects.toThrow(AuthorizationError);
    });

    it("DENIES User A from listing reactions for convBC", async () => {
      await expect(servicesA.reactions.listForConversation(convBC)).rejects.toThrow(AuthorizationError);
    });

    it("DENIES User A from pinning in convBC", async () => {
      await expect(servicesA.pins.pin(convBC, "msg-bc-1")).rejects.toThrow(AuthorizationError);
    });

    it("DENIES pinning a message to a conversation it does not belong to", async () => {
      // User B is a member of convAB, but tries to pin msg-bc-1 into convAB
      await expect(servicesB.pins.pin(convAB, "msg-bc-1")).rejects.toThrow();
    });

    it("DENIES User A from starring msg-bc-1", async () => {
      await expect(servicesA.stars.toggle("msg-bc-1")).rejects.toThrow(AuthorizationError);
    });

    it("DENIES User A from querying starred message IDs in convBC", async () => {
      await expect(servicesA.stars.listIdsInConversation(convBC)).rejects.toThrow(AuthorizationError);
    });
  });

  describe("5. Calls Participant & Initiation Authorization", () => {
    it("allows caller and callee to inspect call details", async () => {
      const callB = await servicesB.calls.get("call-bc-1");
      expect(callB?.call.id).toBe("call-bc-1");

      const callC = await servicesC.calls.get("call-bc-1");
      expect(callC?.call.id).toBe("call-bc-1");
    });

    it("DENIES User A from inspecting User B and C's call call-bc-1", async () => {
      await expect(servicesA.calls.get("call-bc-1")).rejects.toThrow(AuthorizationError);
    });

    it("DENIES User A from updating the status of call-bc-1", async () => {
      await expect(servicesA.calls.updateStatus("call-bc-1", "ended")).rejects.toThrow(AuthorizationError);
    });

    it("DENIES initiating a call in an unauthorized conversation", async () => {
      await expect(
        servicesA.calls.create({ conversation_id: convBC, callee_id: userB, call_type: "voice" }),
      ).rejects.toThrow(AuthorizationError);
    });

    it("DENIES initiating a call with a non-friend user", async () => {
      // User A and User C are not friends
      await expect(
        servicesA.calls.create({ conversation_id: convAB, callee_id: userC, call_type: "voice" }),
      ).rejects.toThrow(AuthorizationError);
    });

    it("allows initiating a call when conversation member and friends", async () => {
      const call = await servicesA.calls.create({
        conversation_id: convAB,
        callee_id: userB,
        call_type: "voice",
      });
      expect(call.caller_id).toBe(userA);
      expect(call.callee_id).toBe(userB);
      expect(call.status).toBe("ringing");
    });
  });

  describe("6. Devices & Identity Isolation", () => {
    it("allows User A to revoke only their own device", async () => {
      const res = await servicesA.devices.revoke("dev-a-1");
      expect(res).toEqual({ ok: true });
      expect(devicesStore.find((d) => d.id === "dev-a-1")?.revoked_at).not.toBeNull();
    });

    it("prevents User A from revoking User B's device", async () => {
      await servicesA.devices.revoke("dev-b-1");
      // Device B was NOT revoked because service queries with userId: this.userId
      expect(devicesStore.find((d) => d.id === "dev-b-1")?.revoked_at).toBeNull();
    });
  });
});
