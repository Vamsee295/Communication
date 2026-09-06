import { AuthorizationError, NotFoundError, ValidationError } from "@/lib/domain/errors";
import { escapeIlike } from "@/lib/domain/search";
import type { ChatProfile, GlobalSearchHit, Message } from "@/lib/domain/types";
import type { RateLimiter } from "@/lib/ports/rate-limit";
import type { ConversationRepository, MessageRepository, ProfileRepository } from "@/lib/repositories/ports";
import type { IConversationPolicy, IMessagePolicy } from "@/lib/auth/authorization";

export class MessageService {
  constructor(
    private readonly userId: string,
    private readonly messages: MessageRepository,
    private readonly conversations: ConversationRepository,
    private readonly profiles: ProfileRepository,
    private readonly rateLimiter: RateLimiter,
    private readonly conversationPolicy?: IConversationPolicy,
    private readonly messagePolicy?: IMessagePolicy,
  ) {}

  async list(conversationId: string, opts: { before?: string; limit: number }): Promise<Message[]> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const rows = await this.messages.list(conversationId, opts);
    const hidden = await this.messages.listHiddenIds(
      this.userId,
      rows.map((r) => r.id),
    );
    const hiddenSet = new Set(hidden);
    return rows.filter((m) => !hiddenSet.has(m.id));
  }

  async getByIds(ids: string[]): Promise<Message[]> {
    if (ids.length === 0) return [];
    if (this.messagePolicy) {
      // Verify access to every requested message
      for (const id of ids) {
        await this.messagePolicy.requireAccess(this.userId, id);
      }
    }
    return this.messages.getByIds(ids);
  }

  async hide(messageId: string): Promise<{ ok: true }> {
    if (this.messagePolicy) {
      await this.messagePolicy.requireAccess(this.userId, messageId);
    }
    await this.messages.hideForUser(this.userId, messageId);
    return { ok: true };
  }

  async deleteForEveryone(messageId: string): Promise<{ ok: true }> {
    if (this.messagePolicy) {
      await this.messagePolicy.requireOwner(this.userId, messageId);
    } else {
      const msg = await this.messages.getById(messageId);
      if (!msg) throw new NotFoundError("Message not found");
      if (msg.sender_id !== this.userId) throw new AuthorizationError("Only the sender can delete for everyone");
    }
    await this.messages.hardDelete(messageId);
    return { ok: true };
  }

  async send(input: {
    conversation_id: string;
    body: string;
    client_id?: string;
    reply_to_id?: string | null;
    forwarded_from_id?: string | null;
  }): Promise<Message> {
    await this.rateLimiter.hit("messages.send", this.userId);

    // 1. Verify caller belongs to the target conversation
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, input.conversation_id);
    }

    // 2. If replying, verify parent message belongs to the same conversation
    if (input.reply_to_id) {
      if (this.messagePolicy) {
        await this.messagePolicy.requireReplyValid(input.conversation_id, input.reply_to_id);
      } else {
        const parent = await this.messages.getById(input.reply_to_id);
        if (!parent || parent.conversation_id !== input.conversation_id) {
          throw new ValidationError("Cannot reply to a message from a different conversation");
        }
      }
    }

    // 3. If forwarding, verify caller has access to the forwarded message
    if (input.forwarded_from_id && this.messagePolicy) {
      await this.messagePolicy.requireAccess(this.userId, input.forwarded_from_id);
    }

    return this.messages.insert({
      conversation_id: input.conversation_id,
      sender_id: this.userId,
      body: input.body,
      client_id: input.client_id ?? null,
      reply_to_id: input.reply_to_id ?? null,
      forwarded_from_id: input.forwarded_from_id ?? null,
    });
  }

  async edit(messageId: string, body: string): Promise<Message> {
    if (this.messagePolicy) {
      await this.messagePolicy.requireOwner(this.userId, messageId);
    } else {
      const existing = await this.messages.getById(messageId);
      if (!existing) throw new NotFoundError("Message not found");
      if (existing.sender_id !== this.userId) throw new AuthorizationError("Only the sender can edit");
    }
    return this.messages.updateBody(messageId, body);
  }

  async forward(messageIds: string[], conversationIds: string[]): Promise<{ count: number }> {
    if (messageIds.length === 0 || conversationIds.length === 0) return { count: 0 };

    // 1. Verify access to all source messages
    let sources: Message[];
    if (this.messagePolicy) {
      sources = await this.messagePolicy.requireForwardAccess(this.userId, messageIds);
    } else {
      sources = await this.messages.getByIds(messageIds);
    }

    // 2. Verify membership in all destination conversations
    if (this.conversationPolicy) {
      for (const convId of conversationIds) {
        await this.conversationPolicy.requireMembership(this.userId, convId);
      }
    }

    const inserts = [];
    for (const conv of conversationIds) {
      for (const src of sources) {
        inserts.push({
          conversation_id: conv,
          sender_id: this.userId,
          body: src.body,
          forwarded_from_id: src.id,
        });
      }
    }
    if (inserts.length === 0) return { count: 0 };
    await this.messages.insertMany(inserts);
    return { count: inserts.length };
  }

  async getInfo(messageId: string) {
    if (this.messagePolicy) {
      await this.messagePolicy.requireOwner(this.userId, messageId);
    }
    const msg = await this.messages.getById(messageId);
    if (!msg) throw new NotFoundError("Not found");
    if (msg.sender_id !== this.userId) throw new AuthorizationError("Forbidden");
    const [receipts, edits] = await Promise.all([
      this.messages.listReceipts(messageId),
      this.messages.listEdits(messageId),
    ]);
    return {
      message: {
        id: msg.id,
        sender_id: msg.sender_id,
        created_at: msg.created_at,
        body: msg.body,
        edited_at: msg.edited_at,
      },
      receipts,
      edits,
    };
  }

  async searchInConversation(conversationId: string, q: string): Promise<Message[]> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    return this.messages.searchInConversation(conversationId, escapeIlike(q));
  }

  async searchGlobal(q: string): Promise<GlobalSearchHit[]> {
    const mems = await this.conversations.listMyMemberships(this.userId);
    const convIds = mems.map((m) => m.conversation_id);
    if (convIds.length === 0) return [];
    const rows = await this.messages.searchInConversations(convIds, escapeIlike(q));
    const allMembers = await this.conversations.listMembers(convIds);
    const otherIdByConv = new Map<string, string>();
    for (const m of allMembers) {
      if (m.user_id !== this.userId) otherIdByConv.set(m.conversation_id, m.user_id);
    }
    const otherIds = Array.from(new Set(otherIdByConv.values()));
    const profilesById = new Map<string, ChatProfile>();
    if (otherIds.length > 0) {
      const profs = await this.profiles.getChatProfiles(otherIds);
      for (const p of profs) profilesById.set(p.id, p);
    }
    return rows.map((m) => {
      const oid = otherIdByConv.get(m.conversation_id);
      return {
        message: m,
        conversation_id: m.conversation_id,
        other: oid ? profilesById.get(oid) ?? null : null,
      };
    });
  }

  async markRead(conversationId: string, upToCreatedAt: string): Promise<{ ok: true }> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const now = new Date().toISOString();
    const ids = await this.messages.listIdsCreatedAtLte(conversationId, upToCreatedAt);
    await this.messages.markReceiptsRead(this.userId, ids, now);
    await this.conversations.updateLastRead(this.userId, conversationId, now);
    return { ok: true };
  }

  async listMyReceipts(conversationId: string) {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const ids = await this.messages.listIds(conversationId, { limit: 100, senderId: this.userId });
    return this.messages.listReceiptsForMessages(ids);
  }
}
