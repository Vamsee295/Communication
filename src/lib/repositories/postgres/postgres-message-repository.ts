import type { Message, MessageEdit } from "@/lib/domain/types";
import type { InsertMessage, MessageRepository } from "@/lib/repositories/ports";
import type { DbClient } from "@/lib/infra/postgres/client";

export class PostgresMessageRepository implements MessageRepository {
  constructor(private readonly db: DbClient) {}

  /**
   * Keyset pagination on messages using (created_at DESC, id DESC)
   */
  async list(conversationId: string, opts: { before?: string; limit: number }): Promise<Message[]> {
    if (opts.before) {
      const rows = await this.db<Message[]>`
        SELECT id, conversation_id, sender_id, body, client_id,
               created_at::text, edited_at::text, deleted_at::text,
               reply_to_id, forwarded_from_id
          FROM public.messages
         WHERE conversation_id = ${conversationId}
           AND created_at < ${opts.before}
         ORDER BY created_at DESC, id DESC
         LIMIT ${opts.limit};
      `;
      return rows;
    }

    const rows = await this.db<Message[]>`
      SELECT id, conversation_id, sender_id, body, client_id,
             created_at::text, edited_at::text, deleted_at::text,
             reply_to_id, forwarded_from_id
        FROM public.messages
       WHERE conversation_id = ${conversationId}
       ORDER BY created_at DESC, id DESC
       LIMIT ${opts.limit};
    `;
    return rows;
  }

  async getByIds(ids: string[]): Promise<Message[]> {
    if (ids.length === 0) return [];
    const rows = await this.db<Message[]>`
      SELECT id, conversation_id, sender_id, body, client_id,
             created_at::text, edited_at::text, deleted_at::text,
             reply_to_id, forwarded_from_id
        FROM public.messages
       WHERE id = ANY(${ids});
    `;
    return rows;
  }

  async getById(id: string): Promise<Message | null> {
    const rows = await this.db<Message[]>`
      SELECT id, conversation_id, sender_id, body, client_id,
             created_at::text, edited_at::text, deleted_at::text,
             reply_to_id, forwarded_from_id
        FROM public.messages
       WHERE id = ${id}
       LIMIT 1;
    `;
    return rows[0] ?? null;
  }

  async insert(row: InsertMessage): Promise<Message> {
    const rows = await this.db<Message[]>`
      INSERT INTO public.messages (
        conversation_id, sender_id, body, client_id, reply_to_id, forwarded_from_id
      ) VALUES (
        ${row.conversation_id}, ${row.sender_id}, ${row.body},
        ${row.client_id ?? null}, ${row.reply_to_id ?? null}, ${row.forwarded_from_id ?? null}
      )
      RETURNING id, conversation_id, sender_id, body, client_id,
                created_at::text, edited_at::text, deleted_at::text,
                reply_to_id, forwarded_from_id;
    `;
    return rows[0];
  }

  async findByClientId(conversationId: string, senderId: string, clientId: string): Promise<Message | null> {
    const rows = await this.db<Message[]>`
      SELECT id, conversation_id, sender_id, body, client_id,
             created_at::text, edited_at::text, deleted_at::text,
             reply_to_id, forwarded_from_id
        FROM public.messages
       WHERE conversation_id = ${conversationId}
         AND sender_id = ${senderId}
         AND client_id = ${clientId}
       LIMIT 1;
    `;
    return rows[0] ?? null;
  }

  async updateBody(id: string, body: string): Promise<Message> {
    const rows = await this.db<Message[]>`
      UPDATE public.messages
         SET body = ${body}
       WHERE id = ${id}
   RETURNING id, conversation_id, sender_id, body, client_id,
             created_at::text, edited_at::text, deleted_at::text,
             reply_to_id, forwarded_from_id;
    `;
    if (!rows[0]) throw new Error("Message not found");
    return rows[0];
  }

  async hardDelete(id: string): Promise<void> {
    await this.db`
      DELETE FROM public.messages
       WHERE id = ${id};
    `;
  }

  async hideForUser(userId: string, messageId: string): Promise<void> {
    await this.db`
      INSERT INTO public.message_hidden (message_id, user_id)
      VALUES (${messageId}, ${userId})
      ON CONFLICT (message_id, user_id) DO NOTHING;
    `;
  }

  async listHiddenIds(userId: string, messageIds: string[]): Promise<string[]> {
    if (messageIds.length === 0) return [];
    const rows = await this.db<{ message_id: string }[]>`
      SELECT message_id
        FROM public.message_hidden
       WHERE user_id = ${userId}
         AND message_id = ANY(${messageIds});
    `;
    return rows.map((r) => r.message_id);
  }

  async searchInConversation(conversationId: string, needle: string): Promise<Message[]> {
    const term = `%${needle}%`;
    const rows = await this.db<Message[]>`
      SELECT id, conversation_id, sender_id, body, client_id,
             created_at::text, edited_at::text, deleted_at::text,
             reply_to_id, forwarded_from_id
        FROM public.messages
       WHERE conversation_id = ${conversationId}
         AND body ILIKE ${term}
       ORDER BY created_at DESC
       LIMIT 50;
    `;
    return rows;
  }

  async searchInConversations(conversationIds: string[], needle: string): Promise<Message[]> {
    if (conversationIds.length === 0) return [];
    const term = `%${needle}%`;
    const rows = await this.db<Message[]>`
      SELECT id, conversation_id, sender_id, body, client_id,
             created_at::text, edited_at::text, deleted_at::text,
             reply_to_id, forwarded_from_id
        FROM public.messages
       WHERE conversation_id = ANY(${conversationIds})
         AND body ILIKE ${term}
       ORDER BY created_at DESC
       LIMIT 50;
    `;
    return rows;
  }

  async listRecentPreview(conversationIds: string[], limit: number): Promise<Message[]> {
    if (conversationIds.length === 0) return [];
    const rows = await this.db<Message[]>`
      SELECT DISTINCT ON (conversation_id)
             id, conversation_id, sender_id, body, client_id,
             created_at::text, edited_at::text, deleted_at::text,
             reply_to_id, forwarded_from_id
        FROM public.messages
       WHERE conversation_id = ANY(${conversationIds})
       ORDER BY conversation_id, created_at DESC
       LIMIT ${limit};
    `;
    return rows;
  }

  async lastFromOthers(conversationId: string, excludeUserId: string): Promise<{ created_at: string } | null> {
    const rows = await this.db<{ created_at: string }[]>`
      SELECT created_at::text
        FROM public.messages
       WHERE conversation_id = ${conversationId}
         AND sender_id <> ${excludeUserId}
       ORDER BY created_at DESC
       LIMIT 1;
    `;
    return rows[0] ?? null;
  }

  async countUnread(conversationId: string, userId: string, since: string): Promise<number> {
    const rows = await this.db<{ count: string }[]>`
      SELECT COUNT(*)::text as count
        FROM public.messages
       WHERE conversation_id = ${conversationId}
         AND sender_id <> ${userId}
         AND created_at > ${since};
    `;
    return parseInt(rows[0]?.count ?? "0", 10);
  }

  async listIds(
    conversationId: string,
    opts: { limit: number; senderId?: string; createdAtLte?: string },
  ): Promise<string[]> {
    let rows: { id: string }[];
    if (opts.senderId && opts.createdAtLte) {
      rows = await this.db<{ id: string }[]>`
        SELECT id FROM public.messages
         WHERE conversation_id = ${conversationId}
           AND sender_id = ${opts.senderId}
           AND created_at <= ${opts.createdAtLte}
         LIMIT ${opts.limit};
      `;
    } else if (opts.senderId) {
      rows = await this.db<{ id: string }[]>`
        SELECT id FROM public.messages
         WHERE conversation_id = ${conversationId}
           AND sender_id = ${opts.senderId}
         LIMIT ${opts.limit};
      `;
    } else if (opts.createdAtLte) {
      rows = await this.db<{ id: string }[]>`
        SELECT id FROM public.messages
         WHERE conversation_id = ${conversationId}
           AND created_at <= ${opts.createdAtLte}
         LIMIT ${opts.limit};
      `;
    } else {
      rows = await this.db<{ id: string }[]>`
        SELECT id FROM public.messages
         WHERE conversation_id = ${conversationId}
         LIMIT ${opts.limit};
      `;
    }
    return rows.map((r) => r.id);
  }

  async listIdsCreatedAtLte(conversationId: string, createdAtLte: string): Promise<string[]> {
    const rows = await this.db<{ id: string }[]>`
      SELECT id FROM public.messages
       WHERE conversation_id = ${conversationId}
         AND created_at <= ${createdAtLte};
    `;
    return rows.map((r) => r.id);
  }

  async listEdits(messageId: string): Promise<MessageEdit[]> {
    const rows = await this.db<MessageEdit[]>`
      SELECT previous_body, edited_at::text
        FROM public.message_edits
       WHERE message_id = ${messageId}
       ORDER BY edited_at ASC;
    `;
    return rows;
  }

  async listReceipts(
    messageId: string,
  ): Promise<Array<{ user_id: string; delivered_at: string | null; read_at: string | null }>> {
    const rows = await this.db<Array<{ user_id: string; delivered_at: string | null; read_at: string | null }>>`
      SELECT user_id, delivered_at::text, read_at::text
        FROM public.message_receipts
       WHERE message_id = ${messageId};
    `;
    return rows;
  }

  async markReceiptsRead(userId: string, messageIds: string[], at: string): Promise<void> {
    if (messageIds.length === 0) return;
    await this.db`
      UPDATE public.message_receipts
         SET read_at = ${at}
       WHERE user_id = ${userId}
         AND message_id = ANY(${messageIds})
         AND read_at IS NULL;
    `;
  }

  async listReceiptsForMessages(
    messageIds: string[],
  ): Promise<Array<{ message_id: string; delivered_at: string | null; read_at: string | null }>> {
    if (messageIds.length === 0) return [];
    const rows = await this.db<
      Array<{ message_id: string; delivered_at: string | null; read_at: string | null }>
    >`
      SELECT message_id, delivered_at::text, read_at::text
        FROM public.message_receipts
       WHERE message_id = ANY(${messageIds});
    `;
    return rows;
  }

  async insertMany(rows: InsertMessage[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db`
      INSERT INTO public.messages ${this.db(
        rows.map((r) => ({
          conversation_id: r.conversation_id,
          sender_id: r.sender_id,
          body: r.body,
          client_id: r.client_id ?? null,
          reply_to_id: r.reply_to_id ?? null,
          forwarded_from_id: r.forwarded_from_id ?? null,
        })),
      )};
    `;
  }
}
