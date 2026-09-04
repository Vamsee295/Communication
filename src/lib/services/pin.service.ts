import type { Message, Pin } from "@/lib/domain/types";
import type { MessageRepository, PinRepository } from "@/lib/repositories/ports";
import type { IConversationPolicy, IMessagePolicy } from "@/lib/auth/authorization";

export class PinService {
  constructor(
    private readonly userId: string,
    private readonly pins: PinRepository,
    private readonly messages: MessageRepository,
    private readonly conversationPolicy?: IConversationPolicy,
    private readonly messagePolicy?: IMessagePolicy,
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
