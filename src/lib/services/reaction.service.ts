import type { ReactionRepository, MessageRepository } from "@/lib/repositories/ports";
import type { IConversationPolicy, IMessagePolicy } from "@/lib/auth/authorization";

export class ReactionService {
  constructor(
    private readonly userId: string,
    private readonly reactions: ReactionRepository,
    private readonly messages: MessageRepository,
    private readonly messagePolicy?: IMessagePolicy,
    private readonly conversationPolicy?: IConversationPolicy,
  ) {}

  async toggle(messageId: string, emoji: string): Promise<{ added: boolean }> {
    if (this.messagePolicy) {
      await this.messagePolicy.requireAccess(this.userId, messageId);
    }
    const existing = await this.reactions.findMine(this.userId, messageId, emoji);
    if (existing) {
      await this.reactions.deleteMine(this.userId, messageId, emoji);
      return { added: false };
    }
    await this.reactions.insert({ message_id: messageId, user_id: this.userId, emoji });
    return { added: true };
  }

  async listForConversation(conversationId: string) {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const ids = await this.messages.listIds(conversationId, { limit: 500 });
    return this.reactions.listForMessageIds(ids);
  }
}
