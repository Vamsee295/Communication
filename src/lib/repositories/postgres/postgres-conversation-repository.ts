import type postgres from "postgres";
import { AuthorizationError, ValidationError } from "@/lib/domain/errors";
import type { Conversation, ConversationMemberFlags, GroupMemberRole } from "@/lib/domain/types";
import type { ConversationRepository, MemberRow } from "@/lib/repositories/ports";

export class PostgresConversationRepository implements ConversationRepository {
  constructor(
    private readonly db: postgres.Sql,
    private readonly userId: string,
  ) {}

  /**
   * Atomic direct conversation creation / retrieval.
   */
  async openDirect(friendId: string): Promise<string> {
    if (friendId === this.userId) {
      throw new ValidationError("Cannot start a conversation with yourself");
    }

    // 1. Verify friendship exists and is accepted
    const friendCheck = await this.db`
      SELECT 1 FROM public.friendships
       WHERE status = 'accepted'
         AND ((requester_id = ${this.userId} AND addressee_id = ${friendId})
           OR (requester_id = ${friendId} AND addressee_id = ${this.userId}))
       LIMIT 1;
    `;
    if (friendCheck.length === 0) {
      throw new AuthorizationError("Not friends");
    }

    // 2. Query existing direct conversation with both users
    const existing = await this.db<{ id: string }[]>`
      SELECT c.id
        FROM public.conversations c
        JOIN public.conversation_members a ON a.conversation_id = c.id AND a.user_id = ${this.userId}
        JOIN public.conversation_members b ON b.conversation_id = c.id AND b.user_id = ${friendId}
       WHERE c.kind = 'direct'
       LIMIT 1;
    `;
    if (existing[0]) {
      return existing[0].id;
    }

    // 3. Atomically create conversation and membership rows in transaction
    const result = await this.db.begin(async (tx) => {
      const checkAgain = await tx<{ id: string }[]>`
        SELECT c.id
          FROM public.conversations c
          JOIN public.conversation_members a ON a.conversation_id = c.id AND a.user_id = ${this.userId}
          JOIN public.conversation_members b ON b.conversation_id = c.id AND b.user_id = ${friendId}
         WHERE c.kind = 'direct'
         LIMIT 1;
      `;
      if (checkAgain[0]) return checkAgain[0].id;

      const [newConv] = await tx<{ id: string }[]>`
        INSERT INTO public.conversations (kind)
        VALUES ('direct')
        RETURNING id;
      `;

      await tx`
        INSERT INTO public.conversation_members (conversation_id, user_id, role)
        VALUES (${newConv.id}, ${this.userId}, 'owner'), (${newConv.id}, ${friendId}, 'member');
      `;

      return newConv.id;
    });

    return result;
  }

  /**
   * Create Group Conversation atomically
   */
  async createGroup(title: string, memberIds: string[]): Promise<string> {
    const cleanTitle = title.trim();
    if (!cleanTitle || cleanTitle.length > 100) {
      throw new ValidationError("Group name must be between 1 and 100 characters");
    }

    // Normalize & deduplicate members, ensure creator is included
    const uniqueMembers = Array.from(new Set([this.userId, ...memberIds]));

    const result = await this.db.begin(async (tx) => {
      const [newConv] = await tx<{ id: string }[]>`
        INSERT INTO public.conversations (kind, title, created_by)
        VALUES ('group', ${cleanTitle}, ${this.userId})
        RETURNING id;
      `;

      // Insert creator as owner, others as member
      for (const mId of uniqueMembers) {
        const role: GroupMemberRole = mId === this.userId ? "owner" : "member";
        await tx`
          INSERT INTO public.conversation_members (conversation_id, user_id, role)
          VALUES (${newConv.id}, ${mId}, ${role});
        `;
      }

      return newConv.id;
    });

    return result;
  }

  async addMember(conversationId: string, userId: string, role: GroupMemberRole = "member"): Promise<void> {
    await this.db`
      INSERT INTO public.conversation_members (conversation_id, user_id, role)
      VALUES (${conversationId}, ${userId}, ${role})
      ON CONFLICT (conversation_id, user_id) DO UPDATE SET role = EXCLUDED.role;
    `;
  }

  async removeMember(conversationId: string, userId: string): Promise<void> {
    await this.db`
      DELETE FROM public.conversation_members
       WHERE conversation_id = ${conversationId} AND user_id = ${userId};
    `;
  }

  async updateMemberRole(conversationId: string, userId: string, role: GroupMemberRole): Promise<void> {
    await this.db`
      UPDATE public.conversation_members
         SET role = ${role}
       WHERE conversation_id = ${conversationId} AND user_id = ${userId};
    `;
  }

  async updateGroupTitle(conversationId: string, title: string): Promise<void> {
    const cleanTitle = title.trim();
    if (!cleanTitle || cleanTitle.length > 100) {
      throw new ValidationError("Group name must be between 1 and 100 characters");
    }
    await this.db`
      UPDATE public.conversations
         SET title = ${cleanTitle}
       WHERE id = ${conversationId};
    `;
  }

  async listMyMemberships(userId: string): Promise<ConversationMemberFlags[]> {
    const rows = await this.db<ConversationMemberFlags[]>`
      SELECT conversation_id, role, last_read_at::text, pinned, muted, archived
        FROM public.conversation_members
       WHERE user_id = ${userId};
    `;
    return rows;
  }

  async getSummaries(ids: string[]): Promise<Array<Conversation>> {
    if (ids.length === 0) return [];
    const rows = await this.db<Array<Conversation>>`
      SELECT id, kind, title, created_by, created_at::text, last_message_at::text
        FROM public.conversations
       WHERE id = ANY(${ids});
    `;
    return rows;
  }

  async listMembers(conversationIds: string[]): Promise<MemberRow[]> {
    if (conversationIds.length === 0) return [];
    const rows = await this.db<MemberRow[]>`
      SELECT conversation_id, user_id, role
        FROM public.conversation_members
       WHERE conversation_id = ANY(${conversationIds});
    `;
    return rows;
  }

  async getById(conversationId: string): Promise<Conversation> {
    const rows = await this.db<Conversation[]>`
      SELECT id, kind, title, created_by, created_at::text, last_message_at::text
        FROM public.conversations
       WHERE id = ${conversationId}
       LIMIT 1;
    `;
    if (!rows[0]) throw new Error("Conversation not found");
    return rows[0];
  }

  async updateFlags(
    userId: string,
    conversationId: string,
    patch: { pinned?: boolean; muted?: boolean; archived?: boolean },
  ): Promise<void> {
    const sets: Record<string, boolean> = {};
    if (patch.pinned !== undefined) sets.pinned = patch.pinned;
    if (patch.muted !== undefined) sets.muted = patch.muted;
    if (patch.archived !== undefined) sets.archived = patch.archived;

    if (Object.keys(sets).length === 0) return;

    await this.db`
      UPDATE public.conversation_members
         SET ${this.db(sets)}
       WHERE conversation_id = ${conversationId} AND user_id = ${userId};
    `;
  }

  async updateLastRead(userId: string, conversationId: string, lastReadAt: string): Promise<void> {
    await this.db`
      UPDATE public.conversation_members
         SET last_read_at = ${lastReadAt}
       WHERE conversation_id = ${conversationId} AND user_id = ${userId};
    `;
  }

  async leave(userId: string, conversationId: string): Promise<void> {
    await this.db`
      DELETE FROM public.conversation_members
       WHERE conversation_id = ${conversationId} AND user_id = ${userId};
    `;
  }
}
