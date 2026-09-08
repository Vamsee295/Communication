import type { Message, Pin } from "@/lib/domain/types";
import type { ConversationRepository, MessageRepository, PinRepository } from "@/lib/repositories/ports";
import type { IConversationPolicy, IMessagePolicy } from "@/lib/auth/authorization";
import { AuthorizationError } from "@/lib/domain/errors";
import { canPerformGroupAction } from "@/lib/auth/group-permissions";

export class PinService {
  constructor(
    private readonly userId: string,
    private readonly pins: PinRepository,
    private readonly messages: MessageRepository,
    private readonly conversationPolicy?: IConversationPolicy,
    private readonly messagePolicy?: IMessagePolicy,
    private readonly conversations?: ConversationRepository,
  ) {}

  async list(conversationId: string): Promise<{ pins: Pin[]; messages: Message[] }> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const pins = await this.pins.list(conversationId);
    const ids = pins.map((p) => p.message_id);
    const messages = ids.length > 0 ? await this.messages.getByIds(ids) : [];
    return { pins, messages };
  }

  async pin(conversationId: string, messageId: string): Promise<{ ok: true }> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    if (this.conversations) {
      const conv = await this.conversations.getById(conversationId);
      if (conv.kind === "group") {
        const members = await this.conversations.listMembers([conversationId]);
        const me = members.find((m) => m.user_id === this.userId);
        const myRole = me?.role ?? "member";
        const [groupPerms, myRestriction] = await Promise.all([
          this.conversations.getGroupPermissions ? this.conversations.getGroupPermissions(conversationId) : null,
          this.conversations.getMemberRestriction ? this.conversations.getMemberRestriction(conversationId, this.userId) : null,
        ]);
        if (!canPerformGroupAction(myRole, "pin_messages", groupPerms, myRestriction)) {
          throw new AuthorizationError("You do not have permission to pin messages in this group");
        }
      }
    }
    if (this.messagePolicy) {
      // Must have access to the message and it must belong to this conversation
      const msg = await this.messagePolicy.requireAccess(this.userId, messageId);
      if (msg.conversation_id !== conversationId) {
        throw new Error("Message does not belong to this conversation");
      }
    }
    await this.pins.insert({ conversation_id: conversationId, message_id: messageId, pinned_by: this.userId });
    return { ok: true };
  }

  async unpin(conversationId: string, messageId: string): Promise<{ ok: true }> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    await this.pins.delete(conversationId, messageId);
    return { ok: true };
  }
}
