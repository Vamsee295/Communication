import { describe, it, expect } from "vitest";

describe("Ghostline Conversation V3 — Logic & State Handlers", () => {
  describe("Typing indicator label formatter", () => {
    function formatTypingLabel(typingNames: string[], isGroup: boolean): string | null {
      if (typingNames.length === 0) return null;
      if (!isGroup) return "typing...";
      if (typingNames.length === 1) return `${typingNames[0]} is typing...`;
      if (typingNames.length === 2) return `${typingNames[0]} and ${typingNames[1]} are typing...`;
      return "Several people are typing...";
    }

    it("returns null when no one is typing", () => {
      expect(formatTypingLabel([], false)).toBeNull();
      expect(formatTypingLabel([], true)).toBeNull();
    });

    it("returns 'typing...' for direct 1-to-1 chats regardless of name", () => {
      expect(formatTypingLabel(["Alice"], false)).toBe("typing...");
    });

    it("formats single user typing in group chats", () => {
      expect(formatTypingLabel(["Bob"], true)).toBe("Bob is typing...");
    });

    it("formats two users typing in group chats", () => {
      expect(formatTypingLabel(["Bob", "Charlie"], true)).toBe("Bob and Charlie are typing...");
    });

    it("formats 3+ users typing in group chats", () => {
      expect(formatTypingLabel(["Bob", "Charlie", "David"], true)).toBe("Several people are typing...");
    });
  });

  describe("Draft persistence key scoping", () => {
    function getDraftStorageKey(conversationId: string): string {
      return `ghostline:draft:${conversationId}`;
    }

    it("scopes draft storage by conversationId", () => {
      expect(getDraftStorageKey("conv-123")).toBe("ghostline:draft:conv-123");
      expect(getDraftStorageKey("conv-456")).toBe("ghostline:draft:conv-456");
    });
  });

  describe("Unread divider target message detection", () => {
    type Msg = { id: string; sender_id: string; created_at: string };

    function findFirstUnreadId(messages: Msg[], meId: string, myLastReadAt: string | null): string | null {
      if (!myLastReadAt) return null;
      const lastReadMs = new Date(myLastReadAt).getTime();
      const firstUnread = messages.find(
        (m) => m.sender_id !== meId && new Date(m.created_at).getTime() > lastReadMs,
      );
      return firstUnread?.id ?? null;
    }

    it("returns null when no last_read_at timestamp exists", () => {
      const msgs: Msg[] = [{ id: "m1", sender_id: "other", created_at: "2026-09-10T10:00:00Z" }];
      expect(findFirstUnreadId(msgs, "me", null)).toBeNull();
    });

    it("returns the id of the first incoming message created after last_read_at", () => {
      const msgs: Msg[] = [
        { id: "m1", sender_id: "other", created_at: "2026-09-10T09:00:00Z" },
        { id: "m2", sender_id: "other", created_at: "2026-09-10T10:30:00Z" },
        { id: "m3", sender_id: "other", created_at: "2026-09-10T11:00:00Z" },
      ];
      const lastReadAt = "2026-09-10T10:00:00Z";
      expect(findFirstUnreadId(msgs, "me", lastReadAt)).toBe("m2");
    });

    it("ignores own messages sent after last_read_at", () => {
      const msgs: Msg[] = [
        { id: "m1", sender_id: "me", created_at: "2026-09-10T10:15:00Z" },
        { id: "m2", sender_id: "other", created_at: "2026-09-10T10:30:00Z" },
      ];
      const lastReadAt = "2026-09-10T10:00:00Z";
      expect(findFirstUnreadId(msgs, "me", lastReadAt)).toBe("m2");
    });

    it("returns null if all messages are older than last_read_at", () => {
      const msgs: Msg[] = [
        { id: "m1", sender_id: "other", created_at: "2026-09-10T09:00:00Z" },
      ];
      const lastReadAt = "2026-09-10T10:00:00Z";
      expect(findFirstUnreadId(msgs, "me", lastReadAt)).toBeNull();
    });
  });

  describe("Parent message quote construction", () => {
    type Member = { id: string; display_name: string | null; username: string | null };

    function buildParentQuoteInfo(
      parentMsg: { id: string; sender_id: string; body: string; attachments?: any[] } | null | undefined,
      meId: string,
      members: Member[],
      otherFallbackName: string,
    ) {
      if (!parentMsg) return null;
      const sender =
        parentMsg.sender_id === meId
          ? "You"
          : members.find((m) => m.id === parentMsg.sender_id)?.display_name ??
            members.find((m) => m.id === parentMsg.sender_id)?.username ??
            otherFallbackName ??
            "User";

      return {
        id: parentMsg.id,
        body: parentMsg.body,
        sender_name: sender,
        attachments: parentMsg.attachments,
      };
    }

    it("attributes quoted message to 'You' when sender is current user", () => {
      const quote = buildParentQuoteInfo(
        { id: "m1", sender_id: "user-1", body: "Hello" },
        "user-1",
        [],
        "Other",
      );
      expect(quote?.sender_name).toBe("You");
      expect(quote?.body).toBe("Hello");
    });

    it("attributes quoted message to participant display name in group/direct chats", () => {
      const members: Member[] = [
        { id: "user-2", display_name: "Sarah Connor", username: "sconnor" },
      ];
      const quote = buildParentQuoteInfo(
        { id: "m2", sender_id: "user-2", body: "Terminator incoming", attachments: [{ id: "att-1", mime_type: "image/jpeg" }] },
        "user-1",
        members,
        "Other",
      );
      expect(quote?.sender_name).toBe("Sarah Connor");
      expect(quote?.attachments?.length).toBe(1);
    });
  });
});
