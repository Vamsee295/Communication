import type { ChatProfile, Message } from "@/lib/domain/types";
import type { ConversationRepository, MessageRepository, ProfileRepository, StarRepository } from "@/lib/repositories/ports";
import type { IConversationPolicy, IMessagePolicy } from "@/lib/auth/authorization";

export class StarService {
  constructor(
    private readonly userId: string,
    private readonly stars: StarRepository,
    private readonly messages: MessageRepository,
    private readonly conversations: ConversationRepository,
    private readonly profiles: ProfileRepository,
    private readonly messagePolicy?: IMessagePolicy,
    private readonly conversationPolicy?: IConversationPolicy,
  ) {}

  async toggle(messageId: string): Promise<{ starred: boolean }> {
    if (this.messagePolicy) {
      await this.messagePolicy.requireAccess(this.userId, messageId);
    }
    const existing = await this.stars.findMine(this.userId, messageId);
    if (existing) {
      await this.stars.deleteMine(this.userId, messageId);
      return { starred: false };
    }
    await this.stars.insert(this.userId, messageId);
    return { starred: true };
  }

  async listMine(): Promise<Array<{ message: Message; other: ChatProfile | null }>> {
    const stars = await this.stars.listMine(this.userId, 200);
    const ids = stars.map((s) => s.message_id);
    if (ids.length === 0) return [];
    const messages = await this.messages.getByIds(ids);
    const convIds = Array.from(new Set(messages.map((m) => m.conversation_id)));
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
    const orderById = new Map(ids.map((id, i) => [id, i]));
    messages.sort((a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0));
    return messages.map((m) => ({
      message: m,
      other:
        (otherIdByConv.get(m.conversation_id) &&
          profilesById.get(otherIdByConv.get(m.conversation_id)!)) ||
        null,
    }));
  }

  async listIdsInConversation(conversationId: string): Promise<string[]> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const ids = await this.messages.listIds(conversationId, { limit: 500 });
    return this.stars.listMineIn(this.userId, ids);
  }
}
