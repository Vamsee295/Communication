// @ts-nocheck
import { describe, it, expect, beforeEach } from "vitest";
import { ConversationService } from "@/lib/services/conversation.service";
import { MessageService } from "@/lib/services/message.service";
import type {
  ConversationRepository,
  FriendshipRepository,
  MessageRepository,
  ProfileRepository,
} from "@/lib/repositories/ports";
import type { Conversation, Message } from "@/lib/domain/types";

describe("Vanish Mode State Synchronization & Message Lifecycle", () => {
  const currentUserId = "user-1111-1111";
  const convId = "conv-aaaa-aaaa";

  let conversationsStore: Conversation[];
  let messagesStore: Message[];
  let disappearingState: Record<string, boolean>;

  let mockConversationsRepo: Partial<ConversationRepository>;
  let mockMessagesRepo: Partial<MessageRepository>;
  let mockProfilesRepo: Partial<ProfileRepository>;
  let mockFriendshipsRepo: Partial<FriendshipRepository>;
  let convService: ConversationService;
  let msgService: MessageService;

  beforeEach(() => {
    disappearingState = {
      [convId]: false,
    };

    conversationsStore = [
      {
        id: convId,
        kind: "direct",
        created_at: "2026-09-01T10:00:00.000Z",
        last_message_at: "2026-09-01T12:30:00.000Z",
        disappearing_messages_enabled: false,
      },
    ];

    messagesStore = [];

    mockConversationsRepo = {
      getById: async (id) => {
        const found = conversationsStore.find((c) => c.id === id);
        if (!found) throw new Error("Conversation not found");
        return {
          ...found,
          disappearing_messages_enabled: disappearingState[id] ?? false,
        };
      },
      listMembers: async () => [
        { conversation_id: convId, user_id: currentUserId, role: "member" },
      ],
      setDisappearingMessages: async (cId, enabled) => {
        disappearingState[cId] = enabled;
        const found = conversationsStore.find((c) => c.id === cId);
        if (found) {
          found.disappearing_messages_enabled = enabled;
        }
      },
    };

    mockMessagesRepo = {
      insert: async (row) => {
        const msg: Message = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          conversation_id: row.conversation_id,
          sender_id: row.sender_id,
          body: row.body,
          client_id: row.client_id ?? null,
          created_at: new Date().toISOString(),
          edited_at: null,
          deleted_at: null,
          reply_to_id: row.reply_to_id ?? null,
          forwarded_from_id: row.forwarded_from_id ?? null,
          is_vanish: row.is_vanish ?? false,
        };
        messagesStore.push(msg);
        return msg;
      },
      deleteVanishMessages: async (cId) => {
        messagesStore = messagesStore.filter((m) => m.conversation_id !== cId || !m.is_vanish);
      },
      list: async (cId) => {
        return messagesStore.filter((m) => m.conversation_id === cId);
      },
      listHiddenIds: async () => [],
    };

    mockProfilesRepo = {};
    mockFriendshipsRepo = {};

    const mockRateLimiter = {
      hit: async () => {},
    };

    convService = new ConversationService(
      currentUserId,
      mockConversationsRepo as ConversationRepository,
      mockMessagesRepo as MessageRepository,
      mockProfilesRepo as ProfileRepository,
      mockFriendshipsRepo as FriendshipRepository,
    );

    msgService = new MessageService(
      currentUserId,
      mockMessagesRepo as MessageRepository,
      mockConversationsRepo as ConversationRepository,
      mockProfilesRepo as ProfileRepository,
      mockRateLimiter as any,
    );
  });

  it("1. Explicit user enable toggles disappearing_messages_enabled to true", async () => {
    expect(disappearingState[convId]).toBe(false);

    const res = await convService.setDisappearingMessages(convId, true);
    expect(res).toEqual({ ok: true });
    expect(disappearingState[convId]).toBe(true);

    const conv = await mockConversationsRepo.getById!(convId);
    expect(conv.disappearing_messages_enabled).toBe(true);
  });

  it("2. Explicit user disable toggles disappearing_messages_enabled to false", async () => {
    disappearingState[convId] = true;

    const res = await convService.setDisappearingMessages(convId, false);
    expect(res).toEqual({ ok: true });
    expect(disappearingState[convId]).toBe(false);

    const conv = await mockConversationsRepo.getById!(convId);
    expect(conv.disappearing_messages_enabled).toBe(false);
  });

  it("3. Rapid toggle sequence resolves to the LAST user action", async () => {
    let seqCounter = 0;
    const actions = [true, false, true, false];

    for (const action of actions) {
      seqCounter++;
      await convService.setDisappearingMessages(convId, action);
    }

    expect(seqCounter).toBe(4);
    expect(disappearingState[convId]).toBe(false);

    const conv = await mockConversationsRepo.getById!(convId);
    expect(conv.disappearing_messages_enabled).toBe(false);
  });

  it("4. Stale network response simulation: older action cannot overwrite newer action", () => {
    let currentSeq = 0;
    let finalState = false;

    const applyMutationResponse = (seq: number, resultState: boolean) => {
      if (seq === currentSeq) {
        finalState = resultState;
      }
    };

    const seq1 = ++currentSeq;
    const seq2 = ++currentSeq;

    applyMutationResponse(seq1, true);
    expect(finalState).toBe(false);

    applyMutationResponse(seq2, false);
    expect(finalState).toBe(false);
  });

  it("5. Message lifecycle: normal messages before vanish are preserved, vanish messages are purged on disable", async () => {
    // 1. Send normal messages before Vanish Mode
    await msgService.send({ conversation_id: convId, body: "Hello before vanish" });
    await msgService.send({ conversation_id: convId, body: "How are you?" });

    expect(messagesStore).toHaveLength(2);
    expect(messagesStore.every((m) => !m.is_vanish)).toBe(true);

    // 2. Enable Vanish Mode
    await convService.setDisappearingMessages(convId, true);

    // 3. Send messages in Vanish Mode
    await msgService.send({ conversation_id: convId, body: "HELLO (secret)" });
    await msgService.send({ conversation_id: convId, body: "Hii (secret)" });

    expect(messagesStore).toHaveLength(4);
    const vanishMsgs = messagesStore.filter((m) => m.is_vanish);
    expect(vanishMsgs).toHaveLength(2);
    expect(vanishMsgs.map((m) => m.body)).toEqual(["HELLO (secret)", "Hii (secret)"]);

    // 4. Disable Vanish Mode
    await convService.setDisappearingMessages(convId, false);

    // 5. Verify only normal messages remain
    expect(messagesStore).toHaveLength(2);
    expect(messagesStore.map((m) => m.body)).toEqual(["Hello before vanish", "How are you?"]);
    expect(messagesStore.every((m) => !m.is_vanish)).toBe(true);
  });

  it("6. Authorization check: Non-member cannot toggle Vanish Mode", async () => {
    const intruderService = new ConversationService(
      "intruder-9999",
      mockConversationsRepo as ConversationRepository,
      mockMessagesRepo as MessageRepository,
      mockProfilesRepo as ProfileRepository,
      mockFriendshipsRepo as FriendshipRepository,
    );

    await expect(intruderService.setDisappearingMessages(convId, true)).rejects.toThrow();
    expect(disappearingState[convId]).toBe(false);
  });
});
