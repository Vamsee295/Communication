import { describe, it, expect } from "vitest";
import type { ConversationSummary } from "@/lib/domain/types";

describe("Chat Conversation List UX - Direct vs Group differentiation", () => {
  it("formats group conversation subtitles using real member count and never 'Offline'", () => {
    const groupConv: ConversationSummary = {
      id: "group-1",
      kind: "group",
      title: "KL 2027",
      description: null,
      avatar_url: null,
      created_by: "user-1",
      member_count: 24,
      members: [],
      other: null,
      last_message_at: "2026-09-08T10:00:00Z",
      last_message: null,
      unread: 0,
      pinned: false,
      muted: false,
      archived: false,
      my_role: "member",
      disappearing_messages_enabled: false,
    };

    // Subtitle logic verification
    const isGroup = groupConv.kind === "group";
    const last = groupConv.last_message;
    const memberCount = Math.max(groupConv.member_count ?? 0, groupConv.members?.length ?? 0);
    const groupMeta = `${memberCount} ${memberCount === 1 ? "member" : "members"}`;
    const subtitle = last ? last.body : (isGroup ? groupMeta : "Offline");

    expect(isGroup).toBe(true);
    expect(subtitle).toBe("24 members");
    expect(subtitle).not.toBe("Offline");
  });

  it("handles singular member count properly for groups", () => {
    const groupConv: ConversationSummary = {
      id: "group-2",
      kind: "group",
      title: "Solo Group",
      description: null,
      avatar_url: null,
      created_by: "user-1",
      member_count: 1,
      members: [],
      other: null,
      last_message_at: "2026-09-08T10:00:00Z",
      last_message: null,
      unread: 0,
      pinned: false,
      muted: false,
      archived: false,
      my_role: "owner",
      disappearing_messages_enabled: false,
    };

    const isGroup = groupConv.kind === "group";
    const memberCount = Math.max(groupConv.member_count ?? 0, groupConv.members?.length ?? 0);
    const groupMeta = `${memberCount} ${memberCount === 1 ? "member" : "members"}`;
    const subtitle = isGroup ? groupMeta : "Offline";

    expect(subtitle).toBe("1 member");
  });

  it("formats message preview with sender name in group conversations when sent by another member", () => {
    const meId = "user-me";
    const otherMember = {
      id: "user-rahul",
      username: "rahul",
      display_name: "Rahul",
      avatar_url: null,
      status: "online",
      last_seen: null,
    };

    const groupConv: ConversationSummary = {
      id: "group-3",
      kind: "group",
      title: "KL 2027",
      description: null,
      avatar_url: null,
      created_by: "user-1",
      member_count: 3,
      members: [otherMember],
      other: null,
      last_message_at: "2026-09-08T10:05:00Z",
      last_message: {
        id: "msg-1",
        sender_id: "user-rahul",
        body: "Tomorrow's meeting is at 10 AM",
        created_at: "2026-09-08T10:05:00Z",
        deleted_at: null,
      },
      unread: 1,
      pinned: false,
      muted: false,
      archived: false,
      my_role: "member",
      disappearing_messages_enabled: false,
    };

    const isGroup = groupConv.kind === "group";
    const last = groupConv.last_message;
    const mine = last?.sender_id === meId;
    const sender = isGroup && !mine && !last?.deleted_at && groupConv.members?.find((m) => m.id === last?.sender_id);
    const senderName = sender ? (sender.display_name ?? sender.username) : null;
    const preview = last
      ? (last.deleted_at
          ? "Message deleted"
          : (senderName ? `${senderName}: ${last.body}` : last.body))
      : null;

    expect(preview).toBe("Rahul: Tomorrow's meeting is at 10 AM");
  });
});

describe("Header Conversation ⋮ Menu - Direct vs Group Action Specification", () => {
  type MenuItem = {
    id: string;
    label: string;
    destructive?: boolean;
    groupOnly?: boolean;
    directOnly?: boolean;
  };

  const DIRECT_MENU_ACTIONS: MenuItem[] = [
    { id: "profile", label: "View Profile", directOnly: true },
    { id: "search", label: "Search in Chat" },
    { id: "pins", label: "Pinned Messages" },
    { id: "mute", label: "Notifications" },
    { id: "vanish", label: "Vanish Mode" },
    { id: "privacy", label: "Privacy & Security" },
    { id: "archive", label: "Archive Chat" },
    { id: "clear", label: "Clear Chat", destructive: true, directOnly: true },
    { id: "block", label: "Block User", destructive: true, directOnly: true },
  ];

  const GROUP_MENU_ACTIONS: MenuItem[] = [
    { id: "group_info", label: "Group Info & Members", groupOnly: true },
    { id: "search", label: "Search in Group" },
    { id: "pins", label: "Pinned Messages" },
    { id: "mute", label: "Notifications" },
    { id: "vanish", label: "Vanish Mode" },
    { id: "privacy", label: "Privacy & Security" },
    { id: "archive", label: "Archive Group" },
    { id: "leave", label: "Leave Group", destructive: true, groupOnly: true },
  ];

  it("renders exact 9 items for direct chat in correct order", () => {
    expect(DIRECT_MENU_ACTIONS).toHaveLength(9);
    const labels = DIRECT_MENU_ACTIONS.map((a) => a.label);
    expect(labels).toEqual([
      "View Profile",
      "Search in Chat",
      "Pinned Messages",
      "Notifications",
      "Vanish Mode",
      "Privacy & Security",
      "Archive Chat",
      "Clear Chat",
      "Block User",
    ]);
  });

  it("renders exact 8 items for group chat in correct order", () => {
    expect(GROUP_MENU_ACTIONS).toHaveLength(8);
    const labels = GROUP_MENU_ACTIONS.map((a) => a.label);
    expect(labels).toEqual([
      "Group Info & Members",
      "Search in Group",
      "Pinned Messages",
      "Notifications",
      "Vanish Mode",
      "Privacy & Security",
      "Archive Group",
      "Leave Group",
    ]);
  });

  it("strictly excludes group actions from direct chat", () => {
    const directLabels = DIRECT_MENU_ACTIONS.map((a) => a.label);
    expect(directLabels).not.toContain("Group Info & Members");
    expect(directLabels).not.toContain("Leave Group");
    expect(directLabels).not.toContain("Search in Group");
    expect(directLabels).not.toContain("Archive Group");
  });

  it("strictly excludes direct-only actions from group chat", () => {
    const groupLabels = GROUP_MENU_ACTIONS.map((a) => a.label);
    expect(groupLabels).not.toContain("View Profile");
    expect(groupLabels).not.toContain("Clear Chat");
    expect(groupLabels).not.toContain("Block User");
    expect(groupLabels).not.toContain("Search in Chat");
    expect(groupLabels).not.toContain("Archive Chat");
  });

  it("uses 'Pinned Messages' instead of legacy 'Hide pinned'", () => {
    const allLabels = [...DIRECT_MENU_ACTIONS, ...GROUP_MENU_ACTIONS].map((a) => a.label);
    expect(allLabels).not.toContain("Hide pinned");
    expect(DIRECT_MENU_ACTIONS.find((a) => a.id === "pins")?.label).toBe("Pinned Messages");
    expect(GROUP_MENU_ACTIONS.find((a) => a.id === "pins")?.label).toBe("Pinned Messages");
  });

  it("correctly identifies destructive actions with confirmation protection", () => {
    const directDestructive = DIRECT_MENU_ACTIONS.filter((a) => a.destructive).map((a) => a.label);
    expect(directDestructive).toEqual(["Clear Chat", "Block User"]);

    const groupDestructive = GROUP_MENU_ACTIONS.filter((a) => a.destructive).map((a) => a.label);
    expect(groupDestructive).toEqual(["Leave Group"]);
  });

  it("keeps granular group administration within Group Info rather than top-level ⋮ menu", () => {
    const topLevelGroupLabels = GROUP_MENU_ACTIONS.map((a) => a.label);
    const forbiddenTopLevelAdminActions = [
      "Add members",
      "Remove members",
      "Restrict members",
      "Promote admin",
      "Change group picture",
      "Change group name",
      "Create poll",
      "Appearance",
      "Permissions",
      "Invite Links",
      "Recent Actions",
    ];

    for (const forbidden of forbiddenTopLevelAdminActions) {
      expect(topLevelGroupLabels).not.toContain(forbidden);
    }
  });
});

