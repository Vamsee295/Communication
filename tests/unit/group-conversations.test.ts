// @ts-nocheck
﻿import { describe, it, expect, beforeEach } from "vitest";
import { ConversationService } from "@/lib/services/conversation.service";
import { AuthorizationError } from "@/lib/domain/errors";
import type {
  ConversationRepository,
  FriendshipRepository,
  MessageRepository,
  ProfileRepository,
  MemberRow,
} from "@/lib/repositories/ports";
import type { ConversationMemberFlags, Conversation, GroupMemberRole } from "@/lib/domain/types";

// helpers
const uid = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;
const cid = (n: number) => `cccccccc-cccc-cccc-cccc-cccccccccc0${n}`;

function makeProfiles(ids: string[]) {
  return ids.map((id) => ({
    id,
    username: `user_${id.slice(-1)}`,
    display_name: `User ${id.slice(-1)}`,
    avatar_url: null,
    last_seen: null,
  }));
}

function makeService(
  currentUserId: string,
  members: MemberRow[],
  convs: Conversation[],
  memberships: ConversationMemberFlags[],
  overrides: Partial<ConversationRepository> = {},
): ConversationService {
  let membersStore: MemberRow[] = [...members];

  const convRepo: ConversationRepository = {
    openDirect: async (fid) => `conv-direct-${fid}`,
    createGroup: async (title, memberIds) => {
      const newConvId = cid(convs.length + 1);
      convs.push({ id: newConvId, kind: "group", title, created_by: currentUserId, last_message_at: new Date().toISOString() });
      for (const mid of [currentUserId, ...memberIds]) {
        membersStore.push({ conversation_id: newConvId, user_id: mid, role: mid === currentUserId ? "owner" : "member" });
        if (mid === currentUserId) {
          members.push({ conversation_id: newConvId, user_id: mid, role: "owner" });
        } else {
          members.push({ conversation_id: newConvId, user_id: mid, role: "member" });
        }
      }
      memberships.push({ conversation_id: newConvId, last_read_at: new Date().toISOString(), pinned: false, muted: false, archived: false, role: "owner" });
      return newConvId;
    },
    addMember: async (convId, memberId, role) => {
      members.push({ conversation_id: convId, user_id: memberId, role: role ?? "member" });
      membersStore = [...members];
    },
    removeMember: async (convId, memberId) => {
      const idx = members.findIndex((m) => m.conversation_id === convId && m.user_id === memberId);
      if (idx !== -1) members.splice(idx, 1);
      membersStore = [...members];
    },
    updateMemberRole: async (convId, memberId, role) => {
      const m = members.find((m) => m.conversation_id === convId && m.user_id === memberId);
      if (m) m.role = role;
      membersStore = [...members];
    },
    updateGroupTitle: async (convId, title) => {
      const c = convs.find((c) => c.id === convId);
      if (c) c.title = title;
    },
    listMyMemberships: async (userId) => {
      const inConvIds = members.filter((m) => m.user_id === userId).map((m) => m.conversation_id);
      return memberships.filter((m) => inConvIds.includes(m.conversation_id));
    },
    getSummaries: async (ids) => convs.filter((c) => ids.includes(c.id)),
    listMembers: async (ids) => members.filter((m) => ids.includes(m.conversation_id)),
    getById: async (id) => {
      const c = convs.find((c) => c.id === id);
      if (!c) throw new Error("Conversation not found");
      return c;
    },
    updateFlags: async () => {},
    updateLastRead: async () => {},
    leave: async (userId, convId) => {
      const idx = members.findIndex((m) => m.user_id === userId && m.conversation_id === convId);
      if (idx !== -1) members.splice(idx, 1);
      membersStore = [...members];
      const mi = memberships.findIndex((m) => m.conversation_id === convId);
      if (mi !== -1) memberships.splice(mi, 1);
    },
    ...overrides,
  };

  const msgRepo = {
    listRecentPreview: async () => [],
    countUnread: async () => 0,
    lastFromOthers: async () => null,
  } as unknown as MessageRepository;

  const profileRepo = {
    getChatProfiles: async (ids: string[]) => makeProfiles(ids),
  } as unknown as ProfileRepository;

  const friendRepo = {
    setBlockedBetween: async () => {},
    unblockBetween: async () => {},
  } as unknown as FriendshipRepository;

  return new ConversationService(currentUserId, convRepo, msgRepo, profileRepo, friendRepo);
}

describe("Milestone 3: Group Conversations", () => {
  const owner = uid(1);
  const admin = uid(2);
  const member1 = uid(3);
  const member2 = uid(4);
  const outsider = uid(5);
  const groupConvId = cid(1);

  let membersStore: MemberRow[];
  let convsStore: Conversation[];
  let membershipsStore: ConversationMemberFlags[];

  beforeEach(() => {
    convsStore = [
      { id: groupConvId, kind: "group", title: "Test Group", created_by: owner, last_message_at: "2026-09-01T12:00:00Z" },
    ];
    membersStore = [
      { conversation_id: groupConvId, user_id: owner, role: "owner" as GroupMemberRole },
      { conversation_id: groupConvId, user_id: admin, role: "admin" as GroupMemberRole },
      { conversation_id: groupConvId, user_id: member1, role: "member" as GroupMemberRole },
    ];
    membershipsStore = [
      { conversation_id: groupConvId, last_read_at: "2026-09-01T12:00:00Z", pinned: false, muted: false, archived: false, role: "owner" as GroupMemberRole },
    ];
  });

  describe("1. Group creation", () => {
    it("1.1 owner can create a group with members", async () => {
      const convs: Conversation[] = [];
      const members: MemberRow[] = [];
      const memberships: ConversationMemberFlags[] = [];
      const svc = makeService(owner, members, convs, memberships);
      const result = await svc.createGroup("My Group", [admin, member1]);
      expect(result.conversation_id).toBeTruthy();
      expect(convs.find((c) => c.id === result.conversation_id)?.kind).toBe("group");
    });

    it("1.2 group title is preserved", async () => {
      const convs: Conversation[] = [];
      const members: MemberRow[] = [];
      const memberships: ConversationMemberFlags[] = [];
      const svc = makeService(owner, members, convs, memberships);
      await svc.createGroup("Ghostline Crew", [admin]);
      expect(convs[0].title).toBe("Ghostline Crew");
    });

    it("1.3 creator is assigned owner role", async () => {
      const convs: Conversation[] = [];
      const members: MemberRow[] = [];
      const memberships: ConversationMemberFlags[] = [];
      const svc = makeService(owner, members, convs, memberships);
      const { conversation_id } = await svc.createGroup("Crew", [admin]);
      const row = members.find((m) => m.user_id === owner && m.conversation_id === conversation_id);
      expect(row?.role).toBe("owner");
    });

    it("1.4 invited members get member role", async () => {
      const convs: Conversation[] = [];
      const members: MemberRow[] = [];
      const memberships: ConversationMemberFlags[] = [];
      const svc = makeService(owner, members, convs, memberships);
      const { conversation_id } = await svc.createGroup("Crew", [admin, member1]);
      expect(members.find((m) => m.user_id === admin && m.conversation_id === conversation_id)?.role).toBe("member");
      expect(members.find((m) => m.user_id === member1 && m.conversation_id === conversation_id)?.role).toBe("member");
    });
  });

  describe("2. Add member", () => {
    it("2.1 owner can add a new member", async () => {
      const svc = makeService(owner, membersStore, convsStore, membershipsStore);
      await svc.addMember(groupConvId, member2);
      expect(membersStore.some((m) => m.user_id === member2)).toBe(true);
    });

    it("2.2 admin can add a new member", async () => {
      const memberships: ConversationMemberFlags[] = [
        { conversation_id: groupConvId, last_read_at: "2026-09-01T12:00:00Z", pinned: false, muted: false, archived: false, role: "admin" },
      ];
      const svc = makeService(admin, membersStore, convsStore, memberships);
      await svc.addMember(groupConvId, member2);
      expect(membersStore.some((m) => m.user_id === member2)).toBe(true);
    });

    it("2.3 regular member cannot add members", async () => {
      const memberships: ConversationMemberFlags[] = [
        { conversation_id: groupConvId, last_read_at: "2026-09-01T12:00:00Z", pinned: false, muted: false, archived: false, role: "member" },
      ];
      const svc = makeService(member1, membersStore, convsStore, memberships);
      await expect(svc.addMember(groupConvId, member2)).rejects.toBeInstanceOf(AuthorizationError);
    });

    it("2.4 outsider cannot add members", async () => {
      const svc = makeService(outsider, membersStore, convsStore, []);
      await expect(svc.addMember(groupConvId, member2)).rejects.toBeInstanceOf(AuthorizationError);
    });
  });

  describe("3. Remove member", () => {
    it("3.1 owner can remove a regular member", async () => {
      const svc = makeService(owner, membersStore, convsStore, membershipsStore);
      await svc.removeMember(groupConvId, member1);
      expect(membersStore.some((m) => m.user_id === member1 && m.conversation_id === groupConvId)).toBe(false);
    });

    it("3.2 owner can remove an admin", async () => {
      const svc = makeService(owner, membersStore, convsStore, membershipsStore);
      await svc.removeMember(groupConvId, admin);
      expect(membersStore.some((m) => m.user_id === admin && m.conversation_id === groupConvId)).toBe(false);
    });

    it("3.3 admin can remove a regular member", async () => {
      const memberships: ConversationMemberFlags[] = [
        { conversation_id: groupConvId, last_read_at: "2026-09-01T12:00:00Z", pinned: false, muted: false, archived: false, role: "admin" },
      ];
      const svc = makeService(admin, membersStore, convsStore, memberships);
      await svc.removeMember(groupConvId, member1);
      expect(membersStore.some((m) => m.user_id === member1 && m.conversation_id === groupConvId)).toBe(false);
    });

    it("3.4 admin cannot remove owner", async () => {
      const memberships: ConversationMemberFlags[] = [
        { conversation_id: groupConvId, last_read_at: "2026-09-01T12:00:00Z", pinned: false, muted: false, archived: false, role: "admin" },
      ];
      const svc = makeService(admin, membersStore, convsStore, memberships);
      await expect(svc.removeMember(groupConvId, owner)).rejects.toBeInstanceOf(AuthorizationError);
    });

    it("3.5 regular member cannot remove anyone", async () => {
      const memberships: ConversationMemberFlags[] = [
        { conversation_id: groupConvId, last_read_at: "2026-09-01T12:00:00Z", pinned: false, muted: false, archived: false, role: "member" },
      ];
      const svc = makeService(member1, membersStore, convsStore, memberships);
      await expect(svc.removeMember(groupConvId, admin)).rejects.toBeInstanceOf(AuthorizationError);
    });
  });

  describe("4. Update member role", () => {
    it("4.1 owner can promote member to admin", async () => {
      const svc = makeService(owner, membersStore, convsStore, membershipsStore);
      await svc.updateMemberRole(groupConvId, member1, "admin");
      expect(membersStore.find((m) => m.user_id === member1)?.role).toBe("admin");
    });

    it("4.2 owner can demote admin to member", async () => {
      const svc = makeService(owner, membersStore, convsStore, membershipsStore);
      await svc.updateMemberRole(groupConvId, admin, "member");
      expect(membersStore.find((m) => m.user_id === admin)?.role).toBe("member");
    });

    it("4.3 admin cannot change roles", async () => {
      const memberships: ConversationMemberFlags[] = [
        { conversation_id: groupConvId, last_read_at: "2026-09-01T12:00:00Z", pinned: false, muted: false, archived: false, role: "admin" },
      ];
      const svc = makeService(admin, membersStore, convsStore, memberships);
      await expect(svc.updateMemberRole(groupConvId, member1, "admin")).rejects.toBeInstanceOf(AuthorizationError);
    });

    it("4.4 member cannot change roles", async () => {
      const memberships: ConversationMemberFlags[] = [
        { conversation_id: groupConvId, last_read_at: "2026-09-01T12:00:00Z", pinned: false, muted: false, archived: false, role: "member" },
      ];
      const svc = makeService(member1, membersStore, convsStore, memberships);
      await expect(svc.updateMemberRole(groupConvId, admin, "member")).rejects.toBeInstanceOf(AuthorizationError);
    });
  });

  describe("5. Update group title", () => {
    it("5.1 owner can change group title", async () => {
      const svc = makeService(owner, membersStore, convsStore, membershipsStore);
      await svc.updateGroupTitle(groupConvId, "New Title");
      expect(convsStore.find((c) => c.id === groupConvId)?.title).toBe("New Title");
    });

    it("5.2 admin can change group title", async () => {
      const memberships: ConversationMemberFlags[] = [
        { conversation_id: groupConvId, last_read_at: "2026-09-01T12:00:00Z", pinned: false, muted: false, archived: false, role: "admin" },
      ];
      const svc = makeService(admin, membersStore, convsStore, memberships);
      await svc.updateGroupTitle(groupConvId, "Admin Renamed");
      expect(convsStore.find((c) => c.id === groupConvId)?.title).toBe("Admin Renamed");
    });

    it("5.3 member cannot change group title", async () => {
      const memberships: ConversationMemberFlags[] = [
        { conversation_id: groupConvId, last_read_at: "2026-09-01T12:00:00Z", pinned: false, muted: false, archived: false, role: "member" },
      ];
      const svc = makeService(member1, membersStore, convsStore, memberships);
      await expect(svc.updateGroupTitle(groupConvId, "Hijack")).rejects.toBeInstanceOf(AuthorizationError);
    });
  });

  describe("6. Leave group & owner transfer", () => {
    it("6.1 regular member can leave", async () => {
      const memberships: ConversationMemberFlags[] = [
        { conversation_id: groupConvId, last_read_at: "2026-09-01T12:00:00Z", pinned: false, muted: false, archived: false, role: "member" },
      ];
      const svc = makeService(member1, membersStore, convsStore, memberships);
      await svc.leave(groupConvId);
      expect(membersStore.some((m) => m.user_id === member1 && m.conversation_id === groupConvId)).toBe(false);
    });

    it("6.2 owner leaving transfers to admin first", async () => {
      const svc = makeService(owner, membersStore, convsStore, membershipsStore);
      await svc.leave(groupConvId);
      expect(membersStore.some((m) => m.user_id === owner && m.conversation_id === groupConvId)).toBe(false);
      const newOwner = membersStore.find((m) => m.conversation_id === groupConvId && m.role === "owner");
      expect(newOwner?.user_id).toBe(admin);
    });

    it("6.3 owner with no admins transfers to next member", async () => {
      const members: MemberRow[] = [
        { conversation_id: groupConvId, user_id: owner, role: "owner" },
        { conversation_id: groupConvId, user_id: member1, role: "member" },
        { conversation_id: groupConvId, user_id: member2, role: "member" },
      ];
      const svc = makeService(owner, members, convsStore, membershipsStore);
      await svc.leave(groupConvId);
      const newOwner = members.find((m) => m.conversation_id === groupConvId && m.role === "owner");
      expect(newOwner).toBeDefined();
      expect(newOwner?.user_id).not.toBe(owner);
    });
  });

  describe("7. Authorization boundaries", () => {
    it("7.1 outsider cannot add members", async () => {
      const svc = makeService(outsider, membersStore, convsStore, []);
      await expect(svc.addMember(groupConvId, member2)).rejects.toBeInstanceOf(AuthorizationError);
    });

    it("7.2 outsider cannot remove members", async () => {
      const svc = makeService(outsider, membersStore, convsStore, []);
      await expect(svc.removeMember(groupConvId, member1)).rejects.toBeInstanceOf(AuthorizationError);
    });

    it("7.3 outsider cannot update group title", async () => {
      const svc = makeService(outsider, membersStore, convsStore, []);
      await expect(svc.updateGroupTitle(groupConvId, "Attack")).rejects.toBeInstanceOf(AuthorizationError);
    });

    it("7.4 outsider cannot change member roles", async () => {
      const svc = makeService(outsider, membersStore, convsStore, []);
      await expect(svc.updateMemberRole(groupConvId, member1, "admin")).rejects.toBeInstanceOf(AuthorizationError);
    });
  });

  describe("8. ConversationSummary for groups", () => {
    it("8.1 list() returns kind=group", async () => {
      const svc = makeService(owner, membersStore, convsStore, membershipsStore);
      const list = await svc.list();
      expect(list.find((c) => c.id === groupConvId)?.kind).toBe("group");
    });

    it("8.2 list() returns correct member_count", async () => {
      const svc = makeService(owner, membersStore, convsStore, membershipsStore);
      const list = await svc.list();
      expect(list.find((c) => c.id === groupConvId)?.member_count).toBe(3);
    });

    it("8.3 list() returns group title", async () => {
      const svc = makeService(owner, membersStore, convsStore, membershipsStore);
      const list = await svc.list();
      expect(list.find((c) => c.id === groupConvId)?.title).toBe("Test Group");
    });

    it("8.4 list() sets other=null for group", async () => {
      const svc = makeService(owner, membersStore, convsStore, membershipsStore);
      const list = await svc.list();
      expect(list.find((c) => c.id === groupConvId)?.other).toBeNull();
    });
  });
});
