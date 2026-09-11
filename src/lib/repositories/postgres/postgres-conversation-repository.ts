import type postgres from "postgres";
import { AuthorizationError, ValidationError } from "@/lib/domain/errors";
import type {
  Conversation,
  ConversationMemberFlags,
  GroupAction,
  GroupAdminAction,
  GroupInviteLink,
  GroupMemberRole,
  GroupPermissions,
  MemberRestriction,
} from "@/lib/domain/types";
import { DEFAULT_GROUP_PERMISSIONS } from "@/lib/auth/group-permissions";
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

      // Initialize default permissions row
      await tx`
        INSERT INTO public.group_permissions (conversation_id)
        VALUES (${newConv.id})
        ON CONFLICT (conversation_id) DO NOTHING;
      `;

      // Log initial group creation
      await tx`
        INSERT INTO public.group_admin_actions (conversation_id, actor_id, action, metadata)
        VALUES (${newConv.id}, ${this.userId}, 'group_created', ${JSON.stringify({ title: cleanTitle })}::jsonb);
      `;

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
    // Clean up any member restrictions when removed
    await this.db`
      DELETE FROM public.member_restrictions
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

  async updateGroupDescription(conversationId: string, description: string): Promise<void> {
    const cleanDesc = description.trim();
    if (cleanDesc.length > 500) {
      throw new ValidationError("Group description must not exceed 500 characters");
    }
    await this.db`
      UPDATE public.conversations
         SET description = ${cleanDesc || null}
       WHERE id = ${conversationId};
    `;
  }

  async updateGroupAvatar(conversationId: string, avatarUrl: string | null): Promise<void> {
    await this.db`
      UPDATE public.conversations
         SET avatar_url = ${avatarUrl}
       WHERE id = ${conversationId};
    `;
  }

  async getGroupPermissions(conversationId: string): Promise<GroupPermissions | null> {
    const rows = await this.db<GroupPermissions[]>`
      SELECT conversation_id,
             send_messages, send_media, send_files, send_voice, send_links,
             create_polls, add_members, pin_messages, change_group_info,
             updated_at::text
        FROM public.group_permissions
       WHERE conversation_id = ${conversationId}
       LIMIT 1;
    `;
    if (rows.length > 0) return rows[0];

    // Return default permissions representation
    return {
      conversation_id: conversationId,
      ...DEFAULT_GROUP_PERMISSIONS,
      updated_at: new Date().toISOString(),
    };
  }

  async setGroupPermissions(
    conversationId: string,
    perms: Partial<Omit<GroupPermissions, "conversation_id" | "updated_at">>,
  ): Promise<GroupPermissions> {
    const [row] = await this.db<GroupPermissions[]>`
      INSERT INTO public.group_permissions (
        conversation_id,
        send_messages, send_media, send_files, send_voice, send_links,
        create_polls, add_members, pin_messages, change_group_info,
        updated_at
      ) VALUES (
        ${conversationId},
        ${perms.send_messages ?? DEFAULT_GROUP_PERMISSIONS.send_messages},
        ${perms.send_media ?? DEFAULT_GROUP_PERMISSIONS.send_media},
        ${perms.send_files ?? DEFAULT_GROUP_PERMISSIONS.send_files},
        ${perms.send_voice ?? DEFAULT_GROUP_PERMISSIONS.send_voice},
        ${perms.send_links ?? DEFAULT_GROUP_PERMISSIONS.send_links},
        ${perms.create_polls ?? DEFAULT_GROUP_PERMISSIONS.create_polls},
        ${perms.add_members ?? DEFAULT_GROUP_PERMISSIONS.add_members},
        ${perms.pin_messages ?? DEFAULT_GROUP_PERMISSIONS.pin_messages},
        ${perms.change_group_info ?? DEFAULT_GROUP_PERMISSIONS.change_group_info},
        now()
      )
      ON CONFLICT (conversation_id) DO UPDATE SET
        send_messages = COALESCE(${perms.send_messages ?? null}, group_permissions.send_messages),
        send_media = COALESCE(${perms.send_media ?? null}, group_permissions.send_media),
        send_files = COALESCE(${perms.send_files ?? null}, group_permissions.send_files),
        send_voice = COALESCE(${perms.send_voice ?? null}, group_permissions.send_voice),
        send_links = COALESCE(${perms.send_links ?? null}, group_permissions.send_links),
        create_polls = COALESCE(${perms.create_polls ?? null}, group_permissions.create_polls),
        add_members = COALESCE(${perms.add_members ?? null}, group_permissions.add_members),
        pin_messages = COALESCE(${perms.pin_messages ?? null}, group_permissions.pin_messages),
        change_group_info = COALESCE(${perms.change_group_info ?? null}, group_permissions.change_group_info),
        updated_at = now()
      RETURNING conversation_id,
                send_messages, send_media, send_files, send_voice, send_links,
                create_polls, add_members, pin_messages, change_group_info,
                updated_at::text;
    `;
    return row;
  }

  async getMemberRestriction(conversationId: string, userId: string): Promise<MemberRestriction | null> {
    const rows = await this.db<MemberRestriction[]>`
      SELECT id, conversation_id, user_id, restricted_by,
             send_messages, send_media, send_files, send_voice, send_links,
             create_polls, add_members, pin_messages, change_group_info,
             restricted_until::text, created_at::text
        FROM public.member_restrictions
       WHERE conversation_id = ${conversationId} AND user_id = ${userId}
       LIMIT 1;
    `;
    return rows[0] ?? null;
  }

  async listMemberRestrictions(conversationId: string): Promise<MemberRestriction[]> {
    const rows = await this.db<MemberRestriction[]>`
      SELECT id, conversation_id, user_id, restricted_by,
             send_messages, send_media, send_files, send_voice, send_links,
             create_polls, add_members, pin_messages, change_group_info,
             restricted_until::text, created_at::text
        FROM public.member_restrictions
       WHERE conversation_id = ${conversationId}
       ORDER BY created_at DESC;
    `;
    return rows;
  }

  async setMemberRestriction(
    conversationId: string,
    userId: string,
    restrictedBy: string,
    perms: Partial<Record<GroupAction, boolean>>,
    restrictedUntil: string | null,
  ): Promise<MemberRestriction> {
    const [row] = await this.db<MemberRestriction[]>`
      INSERT INTO public.member_restrictions (
        conversation_id, user_id, restricted_by,
        send_messages, send_media, send_files, send_voice, send_links,
        create_polls, add_members, pin_messages, change_group_info,
        restricted_until, created_at
      ) VALUES (
        ${conversationId}, ${userId}, ${restrictedBy},
        ${perms.send_messages ?? true},
        ${perms.send_media ?? true},
        ${perms.send_files ?? true},
        ${perms.send_voice ?? true},
        ${perms.send_links ?? true},
        ${perms.create_polls ?? true},
        ${perms.add_members ?? true},
        ${perms.pin_messages ?? true},
        ${perms.change_group_info ?? true},
        ${restrictedUntil ? `${restrictedUntil}::timestamptz` : null},
        now()
      )
      ON CONFLICT (conversation_id, user_id) DO UPDATE SET
        restricted_by = EXCLUDED.restricted_by,
        send_messages = EXCLUDED.send_messages,
        send_media = EXCLUDED.send_media,
        send_files = EXCLUDED.send_files,
        send_voice = EXCLUDED.send_voice,
        send_links = EXCLUDED.send_links,
        create_polls = EXCLUDED.create_polls,
        add_members = EXCLUDED.add_members,
        pin_messages = EXCLUDED.pin_messages,
        change_group_info = EXCLUDED.change_group_info,
        restricted_until = EXCLUDED.restricted_until
      RETURNING id, conversation_id, user_id, restricted_by,
                send_messages, send_media, send_files, send_voice, send_links,
                create_polls, add_members, pin_messages, change_group_info,
                restricted_until::text, created_at::text;
    `;
    return row;
  }

  async removeMemberRestriction(conversationId: string, userId: string): Promise<void> {
    await this.db`
      DELETE FROM public.member_restrictions
       WHERE conversation_id = ${conversationId} AND user_id = ${userId};
    `;
  }

  async createInviteLink(
    conversationId: string,
    createdBy: string,
    expiresAt: string | null = null,
    maxUses: number | null = null,
  ): Promise<GroupInviteLink> {
    const [row] = await this.db<GroupInviteLink[]>`
      INSERT INTO public.group_invite_links (
        conversation_id, created_by, expires_at, max_uses, created_at
      ) VALUES (
        ${conversationId}, ${createdBy},
        ${expiresAt ? `${expiresAt}::timestamptz` : null},
        ${maxUses},
        now()
      )
      RETURNING id, conversation_id, created_by, token,
                expires_at::text, max_uses, use_count, revoked_at::text, created_at::text;
    `;
    return row;
  }

  async revokeInviteLink(conversationId: string, linkId: string): Promise<void> {
    await this.db`
      UPDATE public.group_invite_links
         SET revoked_at = now()
       WHERE id = ${linkId} AND conversation_id = ${conversationId};
    `;
  }

  async listInviteLinks(conversationId: string): Promise<GroupInviteLink[]> {
    const rows = await this.db<GroupInviteLink[]>`
      SELECT id, conversation_id, created_by, token,
             expires_at::text, max_uses, use_count, revoked_at::text, created_at::text
        FROM public.group_invite_links
       WHERE conversation_id = ${conversationId}
       ORDER BY created_at DESC;
    `;
    return rows;
  }

  async joinViaInviteLink(token: string, userId: string): Promise<{ conversation_id: string }> {
    const cleanToken = token.trim();
    if (!cleanToken) {
      throw new ValidationError("Invalid invite link token");
    }

    const links = await this.db<GroupInviteLink[]>`
      SELECT id, conversation_id, created_by, token,
             expires_at::text, max_uses, use_count, revoked_at::text, created_at::text
        FROM public.group_invite_links
       WHERE token = ${cleanToken}
       LIMIT 1;
    `;

    const link = links[0];
    if (!link) {
      throw new ValidationError("Invite link not found or invalid");
    }

    if (link.revoked_at) {
      throw new ValidationError("This invite link has been revoked");
    }

    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      throw new ValidationError("This invite link has expired");
    }

    if (link.max_uses !== null && link.use_count >= link.max_uses) {
      throw new ValidationError("This invite link has reached its maximum usage limit");
    }

    // Atomically join and increment use count
    await this.db.begin(async (tx) => {
      await tx`
        UPDATE public.group_invite_links
           SET use_count = use_count + 1
         WHERE id = ${link.id};
      `;

      await tx`
        INSERT INTO public.conversation_members (conversation_id, user_id, role)
        VALUES (${link.conversation_id}, ${userId}, 'member')
        ON CONFLICT (conversation_id, user_id) DO NOTHING;
      `;

      await tx`
        INSERT INTO public.group_admin_actions (conversation_id, actor_id, action, metadata)
        VALUES (${link.conversation_id}, ${userId}, 'member_joined_via_link', ${JSON.stringify({ link_id: link.id })}::jsonb);
      `;
    });

    return { conversation_id: link.conversation_id };
  }

  async logAdminAction(
    conversationId: string,
    actorId: string,
    action: string,
    targetUserId: string | null = null,
    metadata: Record<string, any> | null = null,
  ): Promise<void> {
    await this.db`
      INSERT INTO public.group_admin_actions (
        conversation_id, actor_id, action, target_user_id, metadata, created_at
      ) VALUES (
        ${conversationId}, ${actorId}, ${action}, ${targetUserId},
        ${metadata ? JSON.stringify(metadata) : null}::jsonb,
        now()
      );
    `;
  }

  async listAdminActions(conversationId: string, limit: number = 50): Promise<GroupAdminAction[]> {
    const rows = await this.db<GroupAdminAction[]>`
      SELECT id, conversation_id, actor_id, action, target_user_id, metadata, created_at::text
        FROM public.group_admin_actions
       WHERE conversation_id = ${conversationId}
       ORDER BY created_at DESC
       LIMIT ${limit};
    `;
    return rows;
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
      SELECT id, kind, title, description, avatar_url, created_by, created_at::text, last_message_at::text, disappearing_messages_enabled
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
      SELECT id, kind, title, description, avatar_url, created_by, created_at::text, last_message_at::text, disappearing_messages_enabled
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
         SET last_read_at = GREATEST(COALESCE(last_read_at, '1970-01-01'::timestamptz), ${lastReadAt}::timestamptz, clock_timestamp())
       WHERE conversation_id = ${conversationId} AND user_id = ${userId};
    `;
  }

  async leave(userId: string, conversationId: string): Promise<void> {
    await this.db`
      DELETE FROM public.conversation_members
       WHERE conversation_id = ${conversationId} AND user_id = ${userId};
    `;
    await this.db`
      DELETE FROM public.member_restrictions
       WHERE conversation_id = ${conversationId} AND user_id = ${userId};
    `;
  }

  async clearHistory(conversationId: string): Promise<void> {
    await this.db.begin(async (tx) => {
      await tx`
        DELETE FROM public.attachments
         WHERE conversation_id = ${conversationId}
           AND (
             message_id IS NULL 
             OR message_id NOT IN (
               SELECT message_id FROM public.pinned_messages WHERE conversation_id = ${conversationId}
             )
           );
      `;
      await tx`
        DELETE FROM public.messages
         WHERE conversation_id = ${conversationId}
           AND id NOT IN (
             SELECT message_id FROM public.pinned_messages WHERE conversation_id = ${conversationId}
           );
      `;
      await tx`
        UPDATE public.conversations
           SET last_message_at = COALESCE(
                 (SELECT MAX(created_at) FROM public.messages WHERE conversation_id = ${conversationId}),
                 created_at
               )
         WHERE id = ${conversationId};
      `;
      await tx`
        UPDATE public.conversation_members
           SET last_read_at = '1970-01-01 00:00:00+00'
         WHERE conversation_id = ${conversationId};
      `;
    });
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.db.begin(async (tx) => {
      await tx`DELETE FROM public.attachments WHERE conversation_id = ${conversationId}`;
      await tx`DELETE FROM public.calls WHERE conversation_id = ${conversationId}`;
      await tx`DELETE FROM public.conversations WHERE id = ${conversationId}`;
    });
  }

  async keepVanishSessionAlive(conversationId: string): Promise<void> {
    await this.db`
      UPDATE public.conversations
         SET vanish_session_active_until = NOW() + INTERVAL '30 seconds'
       WHERE id = ${conversationId};
    `;
  }

  async setDisappearingMessages(conversationId: string, enabled: boolean): Promise<void> {
    await this.db`
      UPDATE public.conversations
         SET disappearing_messages_enabled = ${enabled}
       WHERE id = ${conversationId};
    `;
  }
}
