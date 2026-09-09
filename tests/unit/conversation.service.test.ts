// @ts-nocheck
import { describe, it, expect, beforeEach } from "vitest";
import { ConversationService } from "@/lib/services/conversation.service";
import type {
  ConversationRepository,
  FriendshipRepository,
  MessageRepository,
  ProfileRepository,
} from "@/lib/repositories/ports";
import type { ConversationMemberFlags, Conversation } from "@/lib/domain/types";

describe("ConversationService", () => {
  const currentUserId = "user-1111-1111";
  const otherUserId = "user-2222-2222";
  const convId = "conv-aaaa-aaaa";

  let membershipsStore: ConversationMemberFlags[];
  let conversationsStore: Conversation[];
  let flagsUpdated: Record<string, { pinned?: boolean; muted?: boolean; archived?: boolean }>;
  let leftConversations: string[];

  let mockConversationsRepo: Partial<ConversationRepository>;
  let mockMessagesRepo: Partial<MessageRepository>;
  let mockProfilesRepo: Partial<ProfileRepository>;
  let mockFriendshipsRepo: Partial<FriendshipRepository>;
  let service: ConversationService;

  beforeEach(() => {
    membershipsStore = [
      {
        conversation_id: convId,
        last_read_at: "2026-09-01T12:00:00.000Z",
        pinned: false,
        muted: false,
        archived: false,
      },
    ];
    conversationsStore = [
      {
        id: convId,
        kind: "direct",
        created_at: "2026-09-01T10:00:00.000Z",
        last_message_at: "2026-09-01T12:30:00.000Z",
      },
    ];
    flagsUpdated = {};
    leftConversations = [];

    mockConversationsRepo = {
      openDirect: async (friendId) => `conv-direct-${friendId}`,
      createGroup: async (title, memberIds) => `conv-group-${title}`,
      addMember: async () => {},
      removeMember: async () => {},
      updateMemberRole: async () => {},
      updateGroupTitle: async () => {},
      listMyMemberships: async () => [...membershipsStore],
      getSummaries: async () => [...conversationsStore],
      listMembers: async () => [
        { conversation_id: convId, user_id: currentUserId, role: "owner" },
        { conversation_id: convId, user_id: otherUserId, role: "member" },
      ],
      getById: async (id) => conversationsStore.find((c) => c.id === id)!,
      updateFlags: async (_userId, cId, patch) => {
        flagsUpdated[cId] = patch;
      },
      updateLastRead: async () => {},
      leave: async (_userId, cId) => {
        leftConversations.push(cId);
      },
    };

    mockMessagesRepo = {
      listRecentPreview: async () => [],
      countUnread: async () => 3,
      lastFromOthers: async () => ({ created_at: "2026-09-01T12:30:00.000Z" }),
    };

    mockProfilesRepo = {
      getChatProfiles: async (ids) =>
        ids.map((id) => ({
          id,
          username: `user_${id.slice(0, 4)}`,
          display_name: `User ${id.slice(0, 4)}`,
          avatar_url: null,
          last_seen: null,
        })),
    };

    mockFriendshipsRepo = {
      setBlockedBetween: async () => {},
      unblockBetween: async () => {},
    };

    service = new ConversationService(
      currentUserId,
      mockConversationsRepo as ConversationRepository,
      mockMessagesRepo as MessageRepository,
      mockProfilesRepo as ProfileRepository,
      mockFriendshipsRepo as FriendshipRepository,
    );
  });

  it("opens a direct conversation via repository", async () => {
    const res = await service.openDirect(otherUserId);
    expect(res).toEqual({ conversation_id: `conv-direct-${otherUserId}` });
  });

  it("lists conversation summaries with calculated unread counts and flags", async () => {
    const list = await service.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(convId);
    expect(list[0].unread).toBe(3);
    expect(list[0].other?.id).toBe(otherUserId);
    expect(list[0].pinned).toBe(false);
  });

  it("updates conversation flags (pinned, muted, archived)", async () => {
    const res = await service.setFlags(convId, { pinned: true, muted: true });
    expect(res).toEqual({ ok: true });
    expect(flagsUpdated[convId]).toEqual({ pinned: true, muted: true });
  });

  it("uses countUnreadBatch when available for optimal N+1 prevention", async () => {
    let batchCalled = false;
    mockMessagesRepo.countUnreadBatch = async (cIds, uId) => {
      batchCalled = true;
      expect(cIds).toEqual([convId]);
      expect(uId).toBe(currentUserId);
      return new Map([[convId, 7]]);
    };

    const list = await service.list();
    expect(batchCalled).toBe(true);
    expect(list[0].unread).toBe(7);
  });

  it("leaves conversation", async () => {
    const res = await service.leave(convId);
    expect(res).toEqual({ ok: true });
    expect(leftConversations).toContain(convId);
  });
});
