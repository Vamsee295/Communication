import type {
  ChatProfile,
  ConversationMemberFlags,
  ConversationSummary,
  GroupAction,
  GroupAdminAction,
  GroupInviteLink,
  GroupMemberRole,
  GroupPermissions,
  MemberRestriction,
} from "@/lib/domain/types";
import type {
  ConversationRepository,
  FriendshipRepository,
  MessageRepository,
  ProfileRepository,
} from "@/lib/repositories/ports";
import type { IConversationPolicy } from "@/lib/auth/authorization";
import { AuthorizationError, NotFoundError, ValidationError } from "@/lib/domain/errors";
import { canPerformGroupAction } from "@/lib/auth/group-permissions";

export class ConversationService {
  constructor(
    private readonly userId: string,
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly profiles: ProfileRepository,
    private readonly friendships: FriendshipRepository,
    private readonly conversationPolicy?: IConversationPolicy,
  ) {}

  async openDirect(friendId: string): Promise<{ conversation_id: string }> {
    const id = await this.conversations.openDirect(friendId);
    return { conversation_id: id };
  }

  async createGroup(title: string, memberIds: string[]): Promise<{ conversation_id: string }> {
    const id = await this.conversations.createGroup(title, memberIds);
    return { conversation_id: id };
  }

  async addMember(conversationId: string, memberId: string): Promise<{ ok: true }> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const members = await this.conversations.listMembers([conversationId]);
    const me = members.find((m) => m.user_id === this.userId);
    if (!me) throw new AuthorizationError("Not a member of this conversation");

    const myRole = me.role ?? "member";
    const [groupPerms, myRestriction] = await Promise.all([
      this.conversations.getGroupPermissions ? this.conversations.getGroupPermissions(conversationId) : null,
      this.conversations.getMemberRestriction ? this.conversations.getMemberRestriction(conversationId, this.userId) : null,
    ]);

    if (!canPerformGroupAction(myRole, "add_members", groupPerms, myRestriction)) {
      throw new AuthorizationError("You do not have permission to add members to this group");
    }

    await this.conversations.addMember(conversationId, memberId, "member");
    if (this.conversations.logAdminAction) {
      await this.conversations.logAdminAction(conversationId, this.userId, "member_added", memberId);
    }
    return { ok: true };
  }

  async removeMember(conversationId: string, memberId: string): Promise<{ ok: true }> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const members = await this.conversations.listMembers([conversationId]);
    const me = members.find((m) => m.user_id === this.userId);
    const target = members.find((m) => m.user_id === memberId);

    if (!me || !target) {
      throw new AuthorizationError("Member not found in conversation");
    }

    // Owner can remove anyone; Admin can remove normal members; normal member cannot remove anyone
    if (me.role === "member") {
      throw new AuthorizationError("Only group admins can remove members");
    }
    if (me.role === "admin" && target.role === "owner") {
      throw new AuthorizationError("Admins cannot remove the group owner");
    }
    if (me.role === "admin" && target.role === "admin" && target.user_id !== this.userId) {
      throw new AuthorizationError("Admins cannot remove other admins");
    }

    await this.conversations.removeMember(conversationId, memberId);
    if (this.conversations.logAdminAction) {
      await this.conversations.logAdminAction(conversationId, this.userId, "member_removed", memberId);
    }
    return { ok: true };
  }

  async updateMemberRole(conversationId: string, memberId: string, role: GroupMemberRole): Promise<{ ok: true }> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const members = await this.conversations.listMembers([conversationId]);
    const me = members.find((m) => m.user_id === this.userId);
    if (!me || me.role !== "owner") {
      throw new AuthorizationError("Only the group owner can change member roles");
    }

    await this.conversations.updateMemberRole(conversationId, memberId, role);
    if (this.conversations.logAdminAction) {
      await this.conversations.logAdminAction(conversationId, this.userId, "role_changed", memberId, { new_role: role });
    }
    return { ok: true };
  }

  async updateGroupTitle(conversationId: string, title: string): Promise<{ ok: true }> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const members = await this.conversations.listMembers([conversationId]);
    const me = members.find((m) => m.user_id === this.userId);
    if (!me) throw new AuthorizationError("Not a member");

    const myRole = me.role ?? "member";
    const [groupPerms, myRestriction] = await Promise.all([
      this.conversations.getGroupPermissions ? this.conversations.getGroupPermissions(conversationId) : null,
      this.conversations.getMemberRestriction ? this.conversations.getMemberRestriction(conversationId, this.userId) : null,
    ]);

    if (!canPerformGroupAction(myRole, "change_group_info", groupPerms, myRestriction)) {
      throw new AuthorizationError("You do not have permission to change group info");
    }

    await this.conversations.updateGroupTitle(conversationId, title);
    if (this.conversations.logAdminAction) {
      await this.conversations.logAdminAction(conversationId, this.userId, "title_changed", null, { title });
    }
    return { ok: true };
  }

  async updateGroupDescription(conversationId: string, description: string): Promise<{ ok: true }> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const members = await this.conversations.listMembers([conversationId]);
    const me = members.find((m) => m.user_id === this.userId);
    if (!me) throw new AuthorizationError("Not a member");

    const myRole = me.role ?? "member";
    const [groupPerms, myRestriction] = await Promise.all([
      this.conversations.getGroupPermissions ? this.conversations.getGroupPermissions(conversationId) : null,
      this.conversations.getMemberRestriction ? this.conversations.getMemberRestriction(conversationId, this.userId) : null,
    ]);

    if (!canPerformGroupAction(myRole, "change_group_info", groupPerms, myRestriction)) {
      throw new AuthorizationError("You do not have permission to change group info");
    }

    if (this.conversations.updateGroupDescription) {
      await this.conversations.updateGroupDescription(conversationId, description);
    }
    if (this.conversations.logAdminAction) {
      await this.conversations.logAdminAction(conversationId, this.userId, "description_changed");
    }
    return { ok: true };
  }

  async updateGroupAvatar(conversationId: string, avatarUrl: string | null): Promise<{ ok: true }> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const members = await this.conversations.listMembers([conversationId]);
    const me = members.find((m) => m.user_id === this.userId);
    if (!me) throw new AuthorizationError("Not a member");

    const myRole = me.role ?? "member";
    const [groupPerms, myRestriction] = await Promise.all([
      this.conversations.getGroupPermissions ? this.conversations.getGroupPermissions(conversationId) : null,
      this.conversations.getMemberRestriction ? this.conversations.getMemberRestriction(conversationId, this.userId) : null,
    ]);

    if (!canPerformGroupAction(myRole, "change_group_info", groupPerms, myRestriction)) {
      throw new AuthorizationError("You do not have permission to change group info");
    }

    if (this.conversations.updateGroupAvatar) {
      await this.conversations.updateGroupAvatar(conversationId, avatarUrl);
    }
    if (this.conversations.logAdminAction) {
      await this.conversations.logAdminAction(conversationId, this.userId, "avatar_changed");
    }
    return { ok: true };
  }

  async getGroupPermissions(conversationId: string): Promise<GroupPermissions | null> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    if (this.conversations.getGroupPermissions) {
      return this.conversations.getGroupPermissions(conversationId);
    }
    return null;
  }

  async setGroupPermissions(
    conversationId: string,
    perms: Partial<Omit<GroupPermissions, "conversation_id" | "updated_at">>,
  ): Promise<GroupPermissions> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const members = await this.conversations.listMembers([conversationId]);
    const me = members.find((m) => m.user_id === this.userId);
    if (!me || (me.role !== "owner" && me.role !== "admin")) {
      throw new AuthorizationError("Only group admins can modify group permissions");
    }

    const updated = await this.conversations.setGroupPermissions(conversationId, perms);
    if (this.conversations.logAdminAction) {
      await this.conversations.logAdminAction(conversationId, this.userId, "permissions_updated", null, perms);
    }
    return updated;
  }

  async listMemberRestrictions(conversationId: string): Promise<MemberRestriction[]> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    if (this.conversations.listMemberRestrictions) {
      return this.conversations.listMemberRestrictions(conversationId);
    }
    return [];
  }

  async setMemberRestriction(
    conversationId: string,
    targetUserId: string,
    perms: Partial<Record<GroupAction, boolean>>,
    restrictedUntil: string | null = null,
  ): Promise<MemberRestriction> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const members = await this.conversations.listMembers([conversationId]);
    const me = members.find((m) => m.user_id === this.userId);
    const target = members.find((m) => m.user_id === targetUserId);

    if (!me || (me.role !== "owner" && me.role !== "admin")) {
      throw new AuthorizationError("Only group admins can restrict members");
    }
    if (!target) {
      throw new NotFoundError("Member not found in conversation");
    }
    if (target.role === "owner") {
      throw new AuthorizationError("Cannot restrict group owner");
    }
    if (me.role === "admin" && target.role === "admin") {
      throw new AuthorizationError("Admins cannot restrict other admins");
    }

    const res = await this.conversations.setMemberRestriction(
      conversationId,
      targetUserId,
      this.userId,
      perms,
      restrictedUntil,
    );
    if (this.conversations.logAdminAction) {
      await this.conversations.logAdminAction(conversationId, this.userId, "member_restricted", targetUserId, { perms, restrictedUntil });
    }
    return res;
  }

  async removeMemberRestriction(conversationId: string, targetUserId: string): Promise<{ ok: true }> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const members = await this.conversations.listMembers([conversationId]);
    const me = members.find((m) => m.user_id === this.userId);
    if (!me || (me.role !== "owner" && me.role !== "admin")) {
      throw new AuthorizationError("Only group admins can modify member restrictions");
    }

    await this.conversations.removeMemberRestriction(conversationId, targetUserId);
    if (this.conversations.logAdminAction) {
      await this.conversations.logAdminAction(conversationId, this.userId, "restriction_removed", targetUserId);
    }
    return { ok: true };
  }

  async createInviteLink(
    conversationId: string,
    expiresAt: string | null = null,
    maxUses: number | null = null,
  ): Promise<GroupInviteLink> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const members = await this.conversations.listMembers([conversationId]);
    const me = members.find((m) => m.user_id === this.userId);
    if (!me || (me.role !== "owner" && me.role !== "admin")) {
      throw new AuthorizationError("Only group admins can create invite links");
    }

    const link = await this.conversations.createInviteLink(conversationId, this.userId, expiresAt, maxUses);
    if (this.conversations.logAdminAction) {
      await this.conversations.logAdminAction(conversationId, this.userId, "invite_link_created", null, { link_id: link.id });
    }
    return link;
  }

  async revokeInviteLink(conversationId: string, linkId: string): Promise<{ ok: true }> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const members = await this.conversations.listMembers([conversationId]);
    const me = members.find((m) => m.user_id === this.userId);
    if (!me || (me.role !== "owner" && me.role !== "admin")) {
      throw new AuthorizationError("Only group admins can revoke invite links");
    }

    await this.conversations.revokeInviteLink(conversationId, linkId);
    if (this.conversations.logAdminAction) {
      await this.conversations.logAdminAction(conversationId, this.userId, "invite_link_revoked", null, { link_id: linkId });
    }
    return { ok: true };
  }

  async listInviteLinks(conversationId: string): Promise<GroupInviteLink[]> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const members = await this.conversations.listMembers([conversationId]);
    const me = members.find((m) => m.user_id === this.userId);
    if (!me || (me.role !== "owner" && me.role !== "admin")) {
      throw new AuthorizationError("Only group admins can view invite links");
    }

    return this.conversations.listInviteLinks(conversationId);
  }

  async joinViaInviteLink(token: string): Promise<{ conversation_id: string }> {
    return this.conversations.joinViaInviteLink(token, this.userId);
  }

  async listAdminActions(conversationId: string): Promise<GroupAdminAction[]> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    return this.conversations.listAdminActions(conversationId);
  }

  async list(): Promise<ConversationSummary[]> {
    const myMemberships = await this.conversations.listMyMemberships(this.userId);
    const convIds = myMemberships.map((m) => m.conversation_id);
    if (convIds.length === 0) return [];

    const [convs, allMembers] = await Promise.all([
      this.conversations.getSummaries(convIds),
      this.conversations.listMembers(convIds),
    ]);

    const convMap = new Map<string, (typeof convs)[number]>();
    for (const c of convs) convMap.set(c.id, c);

    const membersByConv = new Map<string, typeof allMembers>();
    for (const m of allMembers) {
      (membersByConv.get(m.conversation_id) ?? membersByConv.set(m.conversation_id, []).get(m.conversation_id)!).push(m);
    }

    const allMemberUserIds = Array.from(new Set(allMembers.map((m) => m.user_id)));
    const profilesById = new Map<string, ChatProfile>();
    if (allMemberUserIds.length > 0) {
      const profs = await this.profiles.getChatProfiles(allMemberUserIds);
      for (const p of profs) profilesById.set(p.id, p);
    }

    const recent = await this.messages.listRecentPreview(convIds, convIds.length * 4);
    const lastByConv = new Map<string, ConversationSummary["last_message"]>();
    for (const m of recent) {
      if (!lastByConv.has(m.conversation_id)) {
        lastByConv.set(m.conversation_id, {
          id: m.id,
          sender_id: m.sender_id,
          body: m.body,
          created_at: m.created_at,
          deleted_at: m.deleted_at,
        });
      }
    }

    const flagsByConv = new Map<string, ConversationMemberFlags>();
    for (const m of myMemberships) {
      flagsByConv.set(m.conversation_id, m);
    }

    const unreadByConv = new Map<string, number>();
    await Promise.all(
      convIds.map(async (cid) => {
        const since = flagsByConv.get(cid)?.last_read_at ?? "1970-01-01";
        unreadByConv.set(cid, await this.messages.countUnread(cid, this.userId, since));
      }),
    );

    const summaries: ConversationSummary[] = convs.map((c) => {
      const members = membersByConv.get(c.id) ?? [];
      const memberProfiles = members.map((m) => profilesById.get(m.user_id)).filter((p): p is ChatProfile => !!p);
      const otherMember = members.find((m) => m.user_id !== this.userId);
      const otherProfile = otherMember ? profilesById.get(otherMember.user_id) ?? null : null;
      const myFlags = flagsByConv.get(c.id);

      return {
        id: c.id,
        kind: c.kind,
        title: c.title ?? null,
        description: c.description ?? null,
        avatar_url: c.avatar_url ?? null,
        created_by: c.created_by ?? null,
        member_count: members.length,
        members: memberProfiles,
        other: c.kind === "direct" ? otherProfile : null,
        last_message_at: c.last_message_at,
        last_message: lastByConv.get(c.id) ?? null,
        unread: unreadByConv.get(c.id) ?? 0,
        pinned: myFlags?.pinned ?? false,
        muted: myFlags?.muted ?? false,
        archived: myFlags?.archived ?? false,
        my_role: myFlags?.role ?? "member",
        disappearing_messages_enabled: c.disappearing_messages_enabled,
      };
    });
    summaries.sort((a, b) => (a.last_message_at < b.last_message_at ? 1 : -1));
    return summaries;
  }

  async get(conversationId: string) {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const [conversation, memberRows, myMemberships] = await Promise.all([
      this.conversations.getById(conversationId),
      this.conversations.listMembers([conversationId]),
      this.conversations.listMyMemberships(this.userId),
    ]);
    const memberIds = memberRows.map((m) => m.user_id);
    const memberProfiles = await this.profiles.getChatProfiles(memberIds);

    const rolesByUserId = new Map<string, GroupMemberRole>();
    for (const m of memberRows) {
      if (m.role) rolesByUserId.set(m.user_id, m.role);
    }

    const members = memberProfiles.map((p) => ({
      ...p,
      role: rolesByUserId.get(p.id) ?? "member",
    }));

    const otherMember = memberRows.find((m) => m.user_id !== this.userId);
    let other: ChatProfile | null = null;
    if (conversation.kind === "direct" && otherMember) {
      other = memberProfiles.find((p) => p.id === otherMember.user_id) ?? null;
    }

    const myRole = rolesByUserId.get(this.userId) ?? "member";
    const myFlagsRow = myMemberships.find((m) => m.conversation_id === conversationId);
    const my_flags = myFlagsRow
      ? {
          pinned: Boolean(myFlagsRow.pinned),
          muted: Boolean(myFlagsRow.muted),
          archived: Boolean(myFlagsRow.archived),
        }
      : null;

    let group_permissions: GroupPermissions | null = null;
    let my_restriction: MemberRestriction | null = null;

    if (conversation.kind === "group" && this.conversations.getGroupPermissions) {
      try {
        [group_permissions, my_restriction] = await Promise.all([
          this.conversations.getGroupPermissions(conversationId),
          this.conversations.getMemberRestriction ? this.conversations.getMemberRestriction(conversationId, this.userId) : null,
        ]);
      } catch {
        // graceful fallback
      }
    }

    return { conversation, members, other, my_role: myRole, my_flags, group_permissions, my_restriction };
  }

  async setFlags(
    conversationId: string,
    patch: { pinned?: boolean; muted?: boolean; archived?: boolean },
  ): Promise<{ ok: true }> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    if (Object.keys(patch).length === 0) return { ok: true };
    await this.conversations.updateFlags(this.userId, conversationId, patch);
    return { ok: true };
  }

  async markUnread(conversationId: string): Promise<{ ok: true }> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const last = await this.messages.lastFromOthers(conversationId, this.userId);
    const stamp = last?.created_at
      ? new Date(new Date(last.created_at).getTime() - 1000).toISOString()
      : new Date(0).toISOString();
    await this.conversations.updateLastRead(this.userId, conversationId, stamp);
    return { ok: true };
  }

  async leave(conversationId: string): Promise<{ ok: true }> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const members = await this.conversations.listMembers([conversationId]);
    const me = members.find((m) => m.user_id === this.userId);

    // If owner leaves and there are other members, transfer owner role to another member
    if (me?.role === "owner" && members.length > 1) {
      const nextOwner =
        members.find((m) => m.user_id !== this.userId && m.role === "admin") ??
        members.find((m) => m.user_id !== this.userId);
      if (nextOwner) {
        await this.conversations.updateMemberRole(conversationId, nextOwner.user_id, "owner");
        if (this.conversations.logAdminAction) {
          await this.conversations.logAdminAction(conversationId, this.userId, "role_changed", nextOwner.user_id, { new_role: "owner" });
        }
      }
    }

    await this.conversations.leave(this.userId, conversationId);
    if (this.conversations.logAdminAction) {
      await this.conversations.logAdminAction(conversationId, this.userId, "member_left", this.userId);
    }
    return { ok: true };
  }

  async setDisappearingMessages(conversationId: string, enabled: boolean): Promise<{ ok: true }> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    if (this.conversations.setDisappearingMessages) {
      await this.conversations.setDisappearingMessages(conversationId, enabled);
    }
    return { ok: true };
  }

  async blockContact(otherId: string): Promise<{ ok: true }> {
    await this.friendships.setBlockedBetween(this.userId, otherId, new Date().toISOString());
    return { ok: true };
  }

  async listBlocked(): Promise<ChatProfile[]> {
    const rows = await this.friendships.listBlockedForUser(this.userId);
    const others = rows.map((r) => (r.requester_id === this.userId ? r.addressee_id : r.requester_id));
    if (others.length === 0) return [];
    return this.profiles.getChatProfiles(others);
  }

  async unblockContact(otherId: string): Promise<{ ok: true }> {
    await this.friendships.unblockBetween(this.userId, otherId, new Date().toISOString());
    return { ok: true };
  }
}
