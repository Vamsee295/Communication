import type { Pin, Reaction, Star } from "@/lib/domain/types";
import type { PinRepository, ReactionRepository, StarRepository } from "@/lib/repositories/ports";
import type { DbClient } from "@/lib/infra/postgres/client";

export class PostgresReactionRepository implements ReactionRepository {
  constructor(private readonly db: DbClient) {}

  async findMine(userId: string, messageId: string, emoji: string): Promise<Reaction | null> {
    const rows = await this.db<Reaction[]>`
      SELECT message_id, user_id, emoji
        FROM public.message_reactions
       WHERE user_id = ${userId} AND message_id = ${messageId} AND emoji = ${emoji}
       LIMIT 1;
    `;
    return rows[0] ?? null;
  }

  async insert(row: { message_id: string; user_id: string; emoji: string }): Promise<void> {
    await this.db`
      INSERT INTO public.message_reactions (message_id, user_id, emoji)
      VALUES (${row.message_id}, ${row.user_id}, ${row.emoji})
      ON CONFLICT (message_id, user_id, emoji) DO NOTHING;
    `;
  }

  async deleteMine(userId: string, messageId: string, emoji: string): Promise<void> {
    await this.db`
      DELETE FROM public.message_reactions
       WHERE user_id = ${userId} AND message_id = ${messageId} AND emoji = ${emoji};
    `;
  }

  async listForMessageIds(messageIds: string[]): Promise<Reaction[]> {
    if (messageIds.length === 0) return [];
    const rows = await this.db<Reaction[]>`
      SELECT message_id, user_id, emoji
        FROM public.message_reactions
       WHERE message_id = ANY(${messageIds});
    `;
    return rows;
  }
}

export class PostgresPinRepository implements PinRepository {
  constructor(private readonly db: DbClient) {}

  async list(conversationId: string): Promise<Pin[]> {
    const rows = await this.db<Pin[]>`
      SELECT conversation_id, message_id, pinned_by, pinned_at::text
        FROM public.pinned_messages
       WHERE conversation_id = ${conversationId}
       ORDER BY pinned_at ASC;
    `;
    return rows;
  }

  async insert(row: { conversation_id: string; message_id: string; pinned_by: string }): Promise<void> {
    await this.db`
      INSERT INTO public.pinned_messages (conversation_id, message_id, pinned_by)
      VALUES (${row.conversation_id}, ${row.message_id}, ${row.pinned_by})
      ON CONFLICT (conversation_id, message_id) DO NOTHING;
    `;
  }

  async delete(conversationId: string, messageId: string): Promise<void> {
    await this.db`
      DELETE FROM public.pinned_messages
       WHERE conversation_id = ${conversationId} AND message_id = ${messageId};
    `;
  }
}

export class PostgresStarRepository implements StarRepository {
  constructor(private readonly db: DbClient) {}

  async findMine(userId: string, messageId: string): Promise<Star | null> {
    const rows = await this.db<Star[]>`
      SELECT user_id, message_id, starred_at::text
        FROM public.starred_messages
       WHERE user_id = ${userId} AND message_id = ${messageId}
       LIMIT 1;
    `;
    return rows[0] ?? null;
  }

  async insert(userId: string, messageId: string): Promise<void> {
    await this.db`
      INSERT INTO public.starred_messages (user_id, message_id)
      VALUES (${userId}, ${messageId})
      ON CONFLICT (user_id, message_id) DO NOTHING;
    `;
  }

  async deleteMine(userId: string, messageId: string): Promise<void> {
    await this.db`
      DELETE FROM public.starred_messages
       WHERE user_id = ${userId} AND message_id = ${messageId};
    `;
  }

  async listMine(userId: string, limit = 50): Promise<Array<{ message_id: string; starred_at: string }>> {
    const rows = await this.db<Array<{ message_id: string; starred_at: string }>>`
      SELECT message_id, starred_at::text
        FROM public.starred_messages
       WHERE user_id = ${userId}
       ORDER BY starred_at DESC
       LIMIT ${limit ?? 50};
    `;
    return rows;
  }

  async listMineIn(userId: string, messageIds: string[]): Promise<string[]> {
    if (messageIds.length === 0) return [];
    const rows = await this.db<{ message_id: string }[]>`
      SELECT message_id
        FROM public.starred_messages
       WHERE user_id = ${userId}
         AND message_id = ANY(${messageIds});
    `;
    return rows.map((r) => r.message_id);
  }
}
