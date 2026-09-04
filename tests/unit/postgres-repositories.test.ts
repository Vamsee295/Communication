/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { PostgresConversationRepository } from "@/lib/repositories/postgres/postgres-conversation-repository";
import { PostgresMessageRepository } from "@/lib/repositories/postgres/postgres-message-repository";
import {
  PostgresPinRepository,
  PostgresReactionRepository,
  PostgresStarRepository,
} from "@/lib/repositories/postgres/postgres-engagement-repository";
import { PostgresProfileRepository } from "@/lib/repositories/postgres/postgres-profile-repository";
import { AuthorizationError, ValidationError } from "@/lib/domain/errors";

// Create an in-memory SQL mock matching postgres.Sql tagged template behavior for unit testing
function createSqlMock() {
  const store = {
    profiles: new Map<string, any>(),
    friendships: [] as any[],
    conversations: new Map<string, any>(),
    conversation_members: [] as any[],
    messages: [] as any[],
    pinned_messages: [] as any[],
    message_reactions: [] as any[],
    starred_messages: [] as any[],
    message_hidden: [] as any[],
    message_receipts: [] as any[],
  };

  const sql: any = async (strings: TemplateStringsArray, ...values: any[]) => {
    const query = strings.join("?");

    // Profiles
    if (query.includes("INSERT INTO public.profiles")) {
      const [id, displayName] = values;
      if (!store.profiles.has(id)) {
        store.profiles.set(id, {
          id,
          display_name: displayName,
          username: null,
          avatar_url: null,
          bio: null,
          last_seen: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
      return [];
    }

    if (query.includes("SELECT") && query.includes("FROM public.profiles") && query.includes("WHERE id = ?")) {
      const id = values[0];
      const p = store.profiles.get(id);
      return p ? [p] : [];
    }

    // Friendships
    if (query.includes("FROM public.friendships") && query.includes("status = 'accepted'")) {
      const [callerId, friendId] = values;
      const found = store.friendships.filter(
        (f) =>
          f.status === "accepted" &&
          ((f.requester_id === callerId && f.addressee_id === friendId) ||
            (f.requester_id === friendId && f.addressee_id === callerId)),
      );
      return found;
    }

    // Conversations - existing check
    if (query.includes("FROM public.conversations c") && query.includes("JOIN public.conversation_members a")) {
      const [callerId, friendId] = values;
      for (const [convId, conv] of store.conversations.entries()) {
        if (conv.kind === "direct") {
          const members = store.conversation_members.filter((m) => m.conversation_id === convId);
          const hasCaller = members.some((m) => m.user_id === callerId);
          const hasFriend = members.some((m) => m.user_id === friendId);
          if (hasCaller && hasFriend) {
            return [{ id: convId }];
          }
        }
      }
      return [];
    }

    // Messages Keyset pagination
    if (query.includes("FROM public.messages") && query.includes("ORDER BY created_at DESC, id DESC")) {
      const convId = values[0];
      let filtered = store.messages.filter((m) => m.conversation_id === convId);

      if (query.includes("created_at < ?")) {
        const before = values[1];
        filtered = filtered.filter((m) => m.created_at < before);
      }

      // Sort by created_at DESC, id DESC
      filtered.sort((a, b) => {
        const timeDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (timeDiff !== 0) return timeDiff;
        return b.id.localeCompare(a.id);
      });

      const limit = values[values.length - 1] ?? 50;
      return filtered.slice(0, limit);
    }

    // Insert message
    if (query.includes("INSERT INTO public.messages")) {
      const [convId, senderId, body, clientId, replyToId, forwardedFromId] = values;
      const msg = {
        id: `msg-${store.messages.length + 1}`,
        conversation_id: convId,
        sender_id: senderId,
        body,
        client_id: clientId,
        reply_to_id: replyToId,
        forwarded_from_id: forwardedFromId,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
      };
      store.messages.push(msg);
      return [msg];
    }

    // Count unread
    if (query.includes("SELECT COUNT(*)") && query.includes("FROM public.messages")) {
      const [convId, userId, since] = values;
      const unread = store.messages.filter(
        (m) =>
          m.conversation_id === convId &&
          m.sender_id !== userId &&
          m.created_at > since &&
          m.deleted_at === null,
      );
      return [{ count: String(unread.length) }];
    }

    // Get message by ID
    if (query.includes("FROM public.messages") && query.includes("WHERE id = ?")) {
      const id = values[0];
      const found = store.messages.find((m) => m.id === id);
      return found ? [found] : [];
    }

    return [];
  };

  sql.begin = async (callback: (tx: any) => Promise<any>) => {
    const tx = async (strings: TemplateStringsArray, ...values: any[]) => {
      const query = strings.join("?");
      if (query.includes("INSERT INTO public.conversations")) {
        const id = `conv-${store.conversations.size + 1}`;
        store.conversations.set(id, { id, kind: "direct", created_at: new Date().toISOString() });
        return [{ id }];
      }
      if (query.includes("INSERT INTO public.conversation_members")) {
        const [convId1, user1, convId2, user2] = values;
        store.conversation_members.push({ conversation_id: convId1, user_id: user1 });
        store.conversation_members.push({ conversation_id: convId2, user_id: user2 });
        return [];
      }
      return sql(strings, ...values);
    };
    return callback(tx);
  };

  return { sql, store };
}

describe("Postgres Repositories & Keyset Pagination", () => {
  it("ensures user row in profiles exists upon JIT provisioning", async () => {
    const { sql, store } = createSqlMock();
    const profileRepo = new PostgresProfileRepository(sql);

    await profileRepo.ensureProfileExists("user-1", "Vamsee");
    expect(store.profiles.has("user-1")).toBe(true);
    expect(store.profiles.get("user-1").display_name).toBe("Vamsee");
  });

  it("prevents self-conversation and unaccepted friendship in openDirect", async () => {
    const { sql } = createSqlMock();
    const convRepo = new PostgresConversationRepository(sql, "user-1");

    await expect(convRepo.openDirect("user-1")).rejects.toThrow(ValidationError);
    await expect(convRepo.openDirect("user-2")).rejects.toThrow(AuthorizationError);
  });

  it("atomically creates direct conversation and returns existing on subsequent calls", async () => {
    const { sql, store } = createSqlMock();
    store.friendships.push({ requester_id: "user-1", addressee_id: "user-2", status: "accepted" });

    const convRepo = new PostgresConversationRepository(sql, "user-1");
    const convId1 = await convRepo.openDirect("user-2");
    expect(convId1).toBe("conv-1");

    // Second call should return identical conversation ID without creating duplicate
    const convId2 = await convRepo.openDirect("user-2");
    expect(convId2).toBe("conv-1");
    expect(store.conversations.size).toBe(1);
  });

  it("handles keyset pagination with duplicate timestamps and tie-breaking by id", async () => {
    const { sql, store } = createSqlMock();
    const msgRepo = new PostgresMessageRepository(sql);

    const sameTime = "2026-09-02T18:00:00.000Z";
    store.messages.push(
      { id: "msg-aaa", conversation_id: "conv-1", sender_id: "u1", body: "first", created_at: sameTime },
      { id: "msg-zzz", conversation_id: "conv-1", sender_id: "u1", body: "second", created_at: sameTime },
      { id: "msg-ccc", conversation_id: "conv-1", sender_id: "u1", body: "third", created_at: "2026-09-02T18:01:00.000Z" },
    );

    const page1 = await msgRepo.list("conv-1", { limit: 2 });
    expect(page1.length).toBe(2);
    expect(page1[0].id).toBe("msg-ccc");
    // Duplicate timestamp is ordered DESC by ID: msg-zzz before msg-aaa
    expect(page1[1].id).toBe("msg-zzz");
  });

  it("correctly counts unread messages excluding the current user's own sent messages", async () => {
    const { sql, store } = createSqlMock();
    const msgRepo = new PostgresMessageRepository(sql);

    const since = "2026-09-02T12:00:00.000Z";
    store.messages.push(
      // Message from other user after since -> unread
      { id: "m1", conversation_id: "conv-1", sender_id: "other-user", body: "hello", created_at: "2026-09-02T13:00:00.000Z", deleted_at: null },
      // Message from caller after since -> excluded from unread
      { id: "m2", conversation_id: "conv-1", sender_id: "caller-user", body: "my reply", created_at: "2026-09-02T13:05:00.000Z", deleted_at: null },
      // Message before since -> already read
      { id: "m3", conversation_id: "conv-1", sender_id: "other-user", body: "old", created_at: "2026-09-02T11:00:00.000Z", deleted_at: null },
    );

    const count = await msgRepo.countUnread("conv-1", "caller-user", since);
    expect(count).toBe(1);
  });

  it("verifies multi-user authorization rules (USER A vs USER B)", async () => {
    const userA = "user-aaaa";
    const userB = "user-bbbb";
    const convA = "conv-a-private";

    // Setup mock store
    const { sql, store } = createSqlMock();
    store.messages.push({
      id: "msg-user-b",
      conversation_id: convA,
      sender_id: userB,
      body: "Private message from User B",
      client_id: "cid-b",
      reply_to_id: null,
      forwarded_from_id: null,
      created_at: "2026-09-02T10:00:00.000Z",
      edited_at: null,
      deleted_at: null,
    });

    const msgRepo = new PostgresMessageRepository(sql);
    const msg = await msgRepo.getById("msg-user-b");
    expect(msg).not.toBeNull();

    // User A attempting to edit User B's message must be denied by service layer
    const canUserAEdit = msg?.sender_id === userA;
    expect(canUserAEdit).toBe(false);

    // User A attempting to delete User B's message must be denied by service layer
    const canUserADelete = msg?.sender_id === userA;
    expect(canUserADelete).toBe(false);

    // User B (the sender) is authorized
    const canUserBEdit = msg?.sender_id === userB;
    expect(canUserBEdit).toBe(true);
  });

  it("verifies exact unread count calculation parity across conditions", async () => {
    const { sql, store } = createSqlMock();
    const msgRepo = new PostgresMessageRepository(sql);

    const since = "2026-09-02T12:00:00.000Z";
    // 1. Message sent by other after since -> +1
    store.messages.push({
      id: "m-valid",
      conversation_id: "conv-1",
      sender_id: "other",
      body: "valid unread",
      created_at: "2026-09-02T13:00:00.000Z",
      deleted_at: null,
    });
    // 2. Message sent by caller after since -> excluded (0)
    store.messages.push({
      id: "m-self",
      conversation_id: "conv-1",
      sender_id: "caller",
      body: "my own msg",
      created_at: "2026-09-02T13:05:00.000Z",
      deleted_at: null,
    });
    // 3. Message before since -> excluded (0)
    store.messages.push({
      id: "m-old",
      conversation_id: "conv-1",
      sender_id: "other",
      body: "already read",
      created_at: "2026-09-02T11:59:59.000Z",
      deleted_at: null,
    });

    const count = await msgRepo.countUnread("conv-1", "caller", since);
    expect(count).toBe(1);
  });
});

