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

describe("Conversation Deletion & Clear History", () => {
  const currentUserId = "user-1111-1111";
  const otherUserId = "user-2222-2222";
  const nonMemberId = "user-9999-9999";
  const directConvId = "conv-direct-1111";
  const groupConvId = "conv-group-2222";

  let deletedConversations: string[];
  let clearedHistories: { conversationId: string; userId: string }[];
  let mockConversationsRepo: Partial<ConversationRepository>;
  let mockMessagesRepo: Partial<MessageRepository>;
  let mockProfilesRepo: Partial<ProfileRepository>;
  let mockFriendshipsRepo: Partial<FriendshipRepository>;
  let service: ConversationService;

  beforeEach(() => {
    deletedConversations = [];
    clearedHistories = [];

    mockConversationsRepo = {
      deleteConversation: async (convId: string) => {
        deletedConversations.push(convId);
      },
      listMembers: async (convIds: string[]) => {
        const convId = Array.isArray(convIds) ? convIds[0] : convIds;
        if (convId === directConvId) {
          return [
            { conversation_id: directConvId, user_id: currentUserId, role: "member" },
            { conversation_id: directConvId, user_id: otherUserId, role: "member" },
          ];
        }
        if (convId === groupConvId) {
          return [
            { conversation_id: groupConvId, user_id: currentUserId, role: "owner" },
            { conversation_id: groupConvId, user_id: otherUserId, role: "member" },
          ];
        }
        return [];
      },
      getSummaries: async (convIds: string[]) => {
        return convIds.map((id) => ({
          id,
          kind: id === groupConvId ? "group" : "direct",
          created_at: "2026-09-01T10:00:00.000Z",
          last_message_at: "2026-09-01T12:00:00.000Z",
        }));
      },
      clearHistory: async (convId: string) => {
        clearedHistories.push(convId);
      },
    };

    mockMessagesRepo = {};

    mockProfilesRepo = {};
    mockFriendshipsRepo = {};
  });

  const createService = (userId: string) =>
    new ConversationService(
      userId,
      mockConversationsRepo as ConversationRepository,
      mockMessagesRepo as MessageRepository,
      mockProfilesRepo as ProfileRepository,
      mockFriendshipsRepo as FriendshipRepository
    );

  describe("deleteConversation", () => {
    it("allows a member of a direct conversation to delete the conversation", async () => {
      const s = createService(currentUserId);
      await s.deleteConversation(directConvId);
      expect(deletedConversations).toContain(directConvId);
    });

    it("allows the owner of a group conversation to delete the conversation", async () => {
      const s = createService(currentUserId);
      await s.deleteConversation(groupConvId);
      expect(deletedConversations).toContain(groupConvId);
    });

    it("throws an error if a non-member attempts to delete a conversation", async () => {
      const s = createService(nonMemberId);
      await expect(s.deleteConversation(directConvId)).rejects.toThrow(
        "Not a member of this conversation"
      );
      expect(deletedConversations).toEqual([]);
    });

    it("throws an error if a non-owner member attempts to delete a group conversation", async () => {
      const s = createService(otherUserId);
      await expect(s.deleteConversation(groupConvId)).rejects.toThrow(
        "Only group owners can delete group conversations"
      );
      expect(deletedConversations).toEqual([]);
    });
  });

  describe("clearHistory", () => {
    it("allows a conversation member to clear chat history", async () => {
      const s = createService(currentUserId);
      await s.clearHistory(directConvId);
      expect(clearedHistories).toEqual([directConvId]);
    });

    it("throws an error if a non-member attempts to clear chat history", async () => {
      const s = createService(nonMemberId);
      await expect(s.clearHistory(directConvId)).rejects.toThrow(
        "Not a member of this conversation"
      );
      expect(clearedHistories).toEqual([]);
    });
  });
});
