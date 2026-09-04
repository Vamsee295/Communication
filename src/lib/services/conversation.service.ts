import type { ChatProfile, ConversationMemberFlags, ConversationSummary, GroupMemberRole } from "@/lib/domain/types";
import type { ConversationRepository, FriendshipRepository, MessageRepository, ProfileRepository } from "@/lib/repositories/ports";
import type { IConversationPolicy } from "@/lib/auth/authorization";
import { AuthorizationError } from "@/lib/domain/errors";

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
    // Verify requester is admin or owner
    const members = await this.conversations.listMembers([conversationId]);
    const me = members.find((m) => m.user_id === this.userId);
    if (!me || (me.role !== "owner" && me.role !== "admin")) {
      throw new AuthorizationError("Only group admins can add members");
    }

    await this.conversations.addMember(conversationId, memberId, "member");
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

    await this.conversations.removeMember(conversationId, memberId);
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
    return { ok: true };
  }

  async updateGroupTitle(conversationId: string, title: string): Promise<{ ok: true }> {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const members = await this.conversations.listMembers([conversationId]);
    const me = members.find((m) => m.user_id === this.userId);
    if (!me || (me.role !== "owner" && me.role !== "admin")) {
      throw new AuthorizationError("Only group admins can change the group title");
    }

    await this.conversations.updateGroupTitle(conversationId, title);
    return { ok: true };
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
      };
    });
    summaries.sort((a, b) => (a.last_message_at < b.last_message_at ? 1 : -1));
    return summaries;
  }

  async get(conversationId: string) {
    if (this.conversationPolicy) {
      await this.conversationPolicy.requireMembership(this.userId, conversationId);
    }
    const conversation = await this.conversations.getById(conversationId);
    const memberRows = await this.conversations.listMembers([conversationId]);
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

    return { conversation, members, other, my_role: myRole };
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
      const nextOwner = members.find((m) => m.user_id !== this.userId && m.role === "admin") ??
                        members.find((m) => m.user_id !== this.userId);
      if (nextOwner) {
        await this.conversations.updateMemberRole(conversationId, nextOwner.user_id, "owner");
      }
    }

    await this.conversations.leave(this.userId, conversationId);
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
