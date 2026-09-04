import type { Friendship, FriendshipStatus } from "@/lib/domain/types";
import type { FriendshipRepository } from "@/lib/repositories/ports";
import type { DbClient } from "@/lib/infra/postgres/client";

export class PostgresFriendshipRepository implements FriendshipRepository {
  constructor(private readonly db: DbClient) {}

  async listForUser(userId: string): Promise<Friendship[]> {
    const rows = await this.db<Friendship[]>`
      SELECT id, requester_id, addressee_id, status,
             created_at::text, responded_at::text
        FROM public.friendships
       WHERE requester_id = ${userId} OR addressee_id = ${userId}
       ORDER BY created_at DESC;
    `;
    return rows;
  }

  async findByPair(requesterId: string, addresseeId: string): Promise<Friendship | null> {
    const rows = await this.db<Friendship[]>`
      SELECT id, requester_id, addressee_id, status,
             created_at::text, responded_at::text
        FROM public.friendships
       WHERE (requester_id = ${requesterId} AND addressee_id = ${addresseeId})
          OR (requester_id = ${addresseeId} AND addressee_id = ${requesterId})
       LIMIT 1;
    `;
    return rows[0] ?? null;
  }

  async insert(row: {
    requester_id: string;
    addressee_id: string;
    status: "pending";
  }): Promise<Friendship> {
    const rows = await this.db<Friendship[]>`
      INSERT INTO public.friendships (requester_id, addressee_id, status)
      VALUES (${row.requester_id}, ${row.addressee_id}, ${row.status})
      RETURNING id, requester_id, addressee_id, status,
                created_at::text, responded_at::text;
    `;
    return rows[0];
  }

  async updateStatus(id: string, status: "accepted" | "blocked", respondedAt: string): Promise<Friendship> {
    const rows = await this.db<Friendship[]>`
      UPDATE public.friendships
         SET status = ${status}, responded_at = ${respondedAt}
       WHERE id = ${id}
   RETURNING id, requester_id, addressee_id, status,
             created_at::text, responded_at::text;
    `;
    if (!rows[0]) throw new Error("Friendship not found");
    return rows[0];
  }

  async deleteAsAddressee(id: string, addresseeId: string): Promise<void> {
    await this.db`
      DELETE FROM public.friendships
       WHERE id = ${id} AND addressee_id = ${addresseeId};
    `;
  }

  async deleteForParticipant(id: string, userId: string): Promise<void> {
    await this.db`
      DELETE FROM public.friendships
       WHERE id = ${id} AND (requester_id = ${userId} OR addressee_id = ${userId});
    `;
  }

  async setBlockedBetween(userId: string, otherId: string, respondedAt: string): Promise<void> {
    const existing = await this.findByPair(userId, otherId);
    if (existing) {
      await this.db`
        UPDATE public.friendships
           SET requester_id = ${userId}, addressee_id = ${otherId},
               status = 'blocked', responded_at = ${respondedAt}
         WHERE id = ${existing.id};
      `;
    } else {
      await this.db`
        INSERT INTO public.friendships (requester_id, addressee_id, status, responded_at)
        VALUES (${userId}, ${otherId}, 'blocked', ${respondedAt});
      `;
    }
  }

  async unblockBetween(userId: string, otherId: string, respondedAt: string): Promise<void> {
    await this.db`
      UPDATE public.friendships
         SET status = 'accepted', responded_at = ${respondedAt}
       WHERE requester_id = ${userId} AND addressee_id = ${otherId} AND status = 'blocked';
    `;
  }

  async listBlockedForUser(userId: string): Promise<Friendship[]> {
    const rows = await this.db<Friendship[]>`
      SELECT id, requester_id, addressee_id, status,
             created_at::text, responded_at::text
        FROM public.friendships
       WHERE requester_id = ${userId} AND status = 'blocked';
    `;
    return rows;
  }
}
