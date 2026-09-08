import { describe, it, expect } from "vitest";
import { canPerformGroupAction, isRestrictionActive, DEFAULT_GROUP_PERMISSIONS } from "@/lib/auth/group-permissions";
import type { GroupAction, GroupPermissions, MemberRestriction } from "@/lib/domain/types";

describe("Ghostline Group Permissions & Restrictions System", () => {
  const defaultPerms: GroupPermissions = {
    conversation_id: "conv-1",
    ...DEFAULT_GROUP_PERMISSIONS,
    updated_at: new Date().toISOString(),
  };

  describe("Owner Privileges", () => {
    it("owner bypasses all group permission restrictions", () => {
      const lockedPerms: GroupPermissions = {
        conversation_id: "conv-1",
        send_messages: false,
        send_media: false,
        send_files: false,
        send_voice: false,
        send_links: false,
        create_polls: false,
        add_members: false,
        pin_messages: false,
        change_group_info: false,
        updated_at: new Date().toISOString(),
      };

      const actions: GroupAction[] = [
        "send_messages",
        "send_media",
        "send_files",
        "send_voice",
        "send_links",
        "create_polls",
        "add_members",
        "pin_messages",
        "change_group_info",
      ];

      for (const action of actions) {
        expect(canPerformGroupAction("owner", action, lockedPerms)).toBe(true);
      }
    });

    it("owner cannot be restricted by member restrictions", () => {
      const harshRestriction: MemberRestriction = {
        id: "res-1",
        conversation_id: "conv-1",
        user_id: "owner-id",
        restricted_by: "admin-id",
        send_messages: false,
        send_media: false,
        send_files: false,
        send_voice: false,
        send_links: false,
        create_polls: false,
        add_members: false,
        pin_messages: false,
        change_group_info: false,
        restricted_until: null,
        created_at: new Date().toISOString(),
      };

      expect(canPerformGroupAction("owner", "send_messages", defaultPerms, harshRestriction)).toBe(true);
      expect(canPerformGroupAction("owner", "pin_messages", defaultPerms, harshRestriction)).toBe(true);
    });
  });

  describe("Admin Privileges & Exceptions", () => {
    it("admin bypasses global group permissions by default", () => {
      const closedPerms: GroupPermissions = {
        ...defaultPerms,
        add_members: false,
        pin_messages: false,
        change_group_info: false,
      };

      expect(canPerformGroupAction("admin", "pin_messages", closedPerms)).toBe(true);
      expect(canPerformGroupAction("admin", "change_group_info", closedPerms)).toBe(true);
      expect(canPerformGroupAction("admin", "add_members", closedPerms)).toBe(true);
    });

    it("admin respects active specific individual restrictions", () => {
      const adminRestriction: MemberRestriction = {
        id: "res-2",
        conversation_id: "conv-1",
        user_id: "admin-id",
        restricted_by: "owner-id",
        send_messages: true,
        send_media: false, // muted media
        send_files: true,
        send_voice: true,
        send_links: true,
        create_polls: true,
        add_members: true,
        pin_messages: true,
        change_group_info: true,
        restricted_until: null, // forever
        created_at: new Date().toISOString(),
      };

      expect(canPerformGroupAction("admin", "send_messages", defaultPerms, adminRestriction)).toBe(true);
      expect(canPerformGroupAction("admin", "send_media", defaultPerms, adminRestriction)).toBe(false);
    });
  });

  describe("Member Permissions Ceiling & Subtractive Exceptions", () => {
    it("member is subject to group permission ceiling", () => {
      const closedPinPerms: GroupPermissions = {
        ...defaultPerms,
        pin_messages: false,
      };

      expect(canPerformGroupAction("member", "pin_messages", closedPinPerms)).toBe(false);
      expect(canPerformGroupAction("member", "send_messages", closedPinPerms)).toBe(true);
    });

    it("member exceptions subtract capabilities from group permissions", () => {
      const memberRestriction: MemberRestriction = {
        id: "res-3",
        conversation_id: "conv-1",
        user_id: "user-id",
        restricted_by: "admin-id",
        send_messages: true,
        send_media: false,
        send_files: false,
        send_voice: true,
        send_links: false,
        create_polls: true,
        add_members: true,
        pin_messages: true,
        change_group_info: true,
        restricted_until: null,
        created_at: new Date().toISOString(),
      };

      // Allowed by group, but subtracted by restriction
      expect(canPerformGroupAction("member", "send_media", defaultPerms, memberRestriction)).toBe(false);
      expect(canPerformGroupAction("member", "send_files", defaultPerms, memberRestriction)).toBe(false);
      expect(canPerformGroupAction("member", "send_links", defaultPerms, memberRestriction)).toBe(false);

      // Allowed by group and not subtracted by restriction
      expect(canPerformGroupAction("member", "send_messages", defaultPerms, memberRestriction)).toBe(true);
      expect(canPerformGroupAction("member", "send_voice", defaultPerms, memberRestriction)).toBe(true);
    });

    it("restrictions cannot grant capabilities if group globally disabled them", () => {
      const restrictiveGroup: GroupPermissions = {
        ...defaultPerms,
        send_media: false, // Group disabled media for all members
      };

      // Member's restriction object has send_media = true
      const memberRestriction: MemberRestriction = {
        id: "res-4",
        conversation_id: "conv-1",
        user_id: "user-id",
        restricted_by: "admin-id",
        send_messages: true,
        send_media: true,
        send_files: true,
        send_voice: true,
        send_links: true,
        create_polls: true,
        add_members: true,
        pin_messages: true,
        change_group_info: true,
        restricted_until: null,
        created_at: new Date().toISOString(),
      };

      // Group ceiling wins! Restrictions can only subtract, never grant.
      expect(canPerformGroupAction("member", "send_media", restrictiveGroup, memberRestriction)).toBe(false);
    });
  });

  describe("Restriction Expiration Logic", () => {
    it("recognizes indefinite restriction as always active", () => {
      const indefinite: MemberRestriction = {
        id: "res-5",
        conversation_id: "conv-1",
        user_id: "user-id",
        restricted_by: "admin-id",
        send_messages: false,
        send_media: false,
        send_files: false,
        send_voice: false,
        send_links: false,
        create_polls: false,
        add_members: false,
        pin_messages: false,
        change_group_info: false,
        restricted_until: null,
        created_at: new Date().toISOString(),
      };

      expect(isRestrictionActive(indefinite)).toBe(true);
      expect(canPerformGroupAction("member", "send_messages", defaultPerms, indefinite)).toBe(false);
    });

    it("ignores expired restriction automatically", () => {
      const expired: MemberRestriction = {
        id: "res-6",
        conversation_id: "conv-1",
        user_id: "user-id",
        restricted_by: "admin-id",
        send_messages: false,
        send_media: false,
        send_files: false,
        send_voice: false,
        send_links: false,
        create_polls: false,
        add_members: false,
        pin_messages: false,
        change_group_info: false,
        restricted_until: new Date(Date.now() - 1000 * 60).toISOString(), // 1 minute in the past
        created_at: new Date(Date.now() - 1000 * 3600).toISOString(),
      };

      expect(isRestrictionActive(expired)).toBe(false);
      expect(canPerformGroupAction("member", "send_messages", defaultPerms, expired)).toBe(true);
    });

    it("enforces active unexpired restriction", () => {
      const activeFuture: MemberRestriction = {
        id: "res-7",
        conversation_id: "conv-1",
        user_id: "user-id",
        restricted_by: "admin-id",
        send_messages: false,
        send_media: false,
        send_files: false,
        send_voice: false,
        send_links: false,
        create_polls: false,
        add_members: false,
        pin_messages: false,
        change_group_info: false,
        restricted_until: new Date(Date.now() + 1000 * 3600).toISOString(), // 1 hour in the future
        created_at: new Date().toISOString(),
      };

      expect(isRestrictionActive(activeFuture)).toBe(true);
      expect(canPerformGroupAction("member", "send_messages", defaultPerms, activeFuture)).toBe(false);
    });
  });
});
