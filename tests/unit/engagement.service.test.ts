// @ts-nocheck
import { describe, it, expect, beforeEach } from "vitest";
import { ReactionService } from "@/lib/services/reaction.service";
import { PinService } from "@/lib/services/pin.service";
import { StarService } from "@/lib/services/star.service";
import type {
  ReactionRepository,
  PinRepository,
  StarRepository,
  MessageRepository,
  ConversationRepository,
  ProfileRepository,
} from "@/lib/repositories/ports";
import type { Reaction, Pin, Star, Message } from "@/lib/domain/types";

describe("Engagement Services (Reactions, Pins, Stars)", () => {
  const currentUserId = "user-1111-1111";
  const convId = "conv-aaaa-aaaa";
  const messageId = "msg-1234";

  let reactionsStore: Reaction[];
  let pinsStore: Pin[];
  let starsStore: Star[];
  let messagesStore: Message[];

  let mockReactionsRepo: Partial<ReactionRepository>;
  let mockPinsRepo: Partial<PinRepository>;
  let mockStarsRepo: Partial<StarRepository>;
  let mockMessagesRepo: Partial<MessageRepository>;
  let mockConversationsRepo: Partial<ConversationRepository>;
  let mockProfilesRepo: Partial<ProfileRepository>;

  beforeEach(() => {
    reactionsStore = [];
    pinsStore = [];
    starsStore = [];
    messagesStore = [
      {
        id: messageId,
        conversation_id: convId,
        sender_id: currentUserId,
        body: "Hello world",
        client_id: null,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        reply_to_id: null,
        forwarded_from_id: null,
      },
    ];

    mockReactionsRepo = {
      findMine: async (userId, msgId, emoji) => {
        return (
          reactionsStore.find(
            (r) => r.user_id === userId && r.message_id === msgId && r.emoji === emoji,
          ) ?? null
        );
      },
      insert: async (row) => {
        reactionsStore.push(row);
      },
      deleteMine: async (userId, msgId, emoji) => {
        reactionsStore = reactionsStore.filter(
          (r) => !(r.user_id === userId && r.message_id === msgId && r.emoji === emoji),
        );
      },
      listForMessageIds: async (mIds) => {
        return reactionsStore.filter((r) => mIds.includes(r.message_id));
      },
    };

    mockPinsRepo = {
      list: async (cId) => pinsStore.filter((p) => p.conversation_id === cId),
      insert: async (row) => {
        pinsStore.push({ ...row, pinned_at: new Date().toISOString() });
      },
      delete: async (cId, mId) => {
        pinsStore = pinsStore.filter(
          (p) => !(p.conversation_id === cId && p.message_id === mId),
        );
      },
    };

    mockStarsRepo = {
      findMine: async (userId, msgId) => {
        return starsStore.find((s) => s.user_id === userId && s.message_id === msgId) ?? null;
      },
      insert: async (userId, msgId) => {
        starsStore.push({ user_id: userId, message_id: msgId, starred_at: new Date().toISOString() });
      },
      deleteMine: async (userId, msgId) => {
        starsStore = starsStore.filter((s) => !(s.user_id === userId && s.message_id === msgId));
      },
      listMine: async (userId) => {
        return starsStore
          .filter((s) => s.user_id === userId)
          .map((s) => ({ message_id: s.message_id, starred_at: s.starred_at }));
      },
      listMineIn: async (userId, msgIds) => {
        return starsStore
          .filter((s) => s.user_id === userId && msgIds.includes(s.message_id))
          .map((s) => s.message_id);
      },
    };

    mockMessagesRepo = {
      getByIds: async (ids) => messagesStore.filter((m) => ids.includes(m.id)),
      listIds: async () => [messageId],
    };

    mockConversationsRepo = {
      openDirect: async () => "",
      createGroup: async () => "",
      addMember: async () => {},
      removeMember: async () => {},
      updateMemberRole: async () => {},
      updateGroupTitle: async () => {},
      listMyMemberships: async () => [],
      getSummaries: async () => [],
      listMembers: async () => [{ conversation_id: convId, user_id: currentUserId, role: "owner" }],
      getById: async () => ({ id: convId, kind: "direct", last_message_at: "" }),
      updateFlags: async () => {},
      updateLastRead: async () => {},
      leave: async () => {},
    };

    mockProfilesRepo = {
      getChatProfiles: async () => [],
    };
  });

  describe("ReactionService", () => {
    it("toggles reaction on: adds when not present", async () => {
      const service = new ReactionService(
        currentUserId,
        mockReactionsRepo as ReactionRepository,
        mockMessagesRepo as MessageRepository,
      );

      const result = await service.toggle(messageId, "👍");
      expect(result).toEqual({ added: true });
      expect(reactionsStore).toHaveLength(1);
      expect(reactionsStore[0].emoji).toBe("👍");
    });

    it("toggles reaction off: removes when already present", async () => {
      reactionsStore.push({ user_id: currentUserId, message_id: messageId, emoji: "👍" });
      const service = new ReactionService(
        currentUserId,
        mockReactionsRepo as ReactionRepository,
        mockMessagesRepo as MessageRepository,
      );

      const result = await service.toggle(messageId, "👍");
      expect(result).toEqual({ added: false });
      expect(reactionsStore).toHaveLength(0);
    });
  });

  describe("PinService", () => {
    it("pins a message in the conversation", async () => {
      const service = new PinService(
        currentUserId,
        mockPinsRepo as PinRepository,
        mockMessagesRepo as MessageRepository,
      );

      const res = await service.pin(convId, messageId);
      expect(res).toEqual({ ok: true });
      expect(pinsStore).toHaveLength(1);
      expect(pinsStore[0].message_id).toBe(messageId);
      expect(pinsStore[0].pinned_by).toBe(currentUserId);
    });

    it("unpins a message in the conversation", async () => {
      pinsStore.push({
        conversation_id: convId,
        message_id: messageId,
        pinned_by: currentUserId,
        pinned_at: new Date().toISOString(),
      });
      const service = new PinService(
        currentUserId,
        mockPinsRepo as PinRepository,
        mockMessagesRepo as MessageRepository,
      );

      const res = await service.unpin(convId, messageId);
      expect(res).toEqual({ ok: true });
      expect(pinsStore).toHaveLength(0);
    });

    it("lists pins alongside their corresponding message objects", async () => {
      pinsStore.push({
        conversation_id: convId,
        message_id: messageId,
        pinned_by: currentUserId,
        pinned_at: new Date().toISOString(),
      });
      const service = new PinService(
        currentUserId,
        mockPinsRepo as PinRepository,
        mockMessagesRepo as MessageRepository,
      );

      const list = await service.list(convId);
      expect(list.pins).toHaveLength(1);
      expect(list.messages).toHaveLength(1);
      expect(list.messages[0].id).toBe(messageId);
    });
  });

  describe("StarService", () => {
    it("toggles star on: stars message when not starred", async () => {
      const service = new StarService(
        currentUserId,
        mockStarsRepo as StarRepository,
        mockMessagesRepo as MessageRepository,
        mockConversationsRepo as ConversationRepository,
        mockProfilesRepo as ProfileRepository,
      );

      const res = await service.toggle(messageId);
      expect(res).toEqual({ starred: true });
      expect(starsStore).toHaveLength(1);
    });

    it("toggles star off: unstars message when already starred", async () => {
      starsStore.push({
        user_id: currentUserId,
        message_id: messageId,
        starred_at: new Date().toISOString(),
      });
      const service = new StarService(
        currentUserId,
        mockStarsRepo as StarRepository,
        mockMessagesRepo as MessageRepository,
        mockConversationsRepo as ConversationRepository,
        mockProfilesRepo as ProfileRepository,
      );

      const res = await service.toggle(messageId);
      expect(res).toEqual({ starred: false });
      expect(starsStore).toHaveLength(0);
    });
  });
});
