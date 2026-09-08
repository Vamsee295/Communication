import type { GroupAction, GroupMemberRole, GroupPermissions, MemberRestriction } from "@/lib/domain/types";

export const DEFAULT_GROUP_PERMISSIONS: Omit<GroupPermissions, "conversation_id" | "updated_at"> = {
  send_messages: true,
  send_media: true,
  send_files: true,
  send_voice: true,
  send_links: true,
  create_polls: true,
  add_members: false,
  pin_messages: false,
  change_group_info: false,
};

export function isRestrictionActive(restriction: MemberRestriction | null | undefined): boolean {
  if (!restriction) return false;
  if (!restriction.restricted_until) return true; // null means indefinitely / forever
  return new Date(restriction.restricted_until).getTime() > Date.now();
}

/**
 * Checks whether a user can perform a specific group action based on their role,
 * the group's global permissions, and any individual member restrictions.
 *
 * Rules:
 * 1. Owner always has full access (cannot be restricted).
 * 2. Admin has full access by default, but can have active individual restrictions applied.
 * 3. Member requires the group permission to be enabled (group permissions are ceiling).
 *    If group allows it, active individual member restriction is checked (can only subtract, never grant).
 */
export function canPerformGroupAction(
  myRole: GroupMemberRole,
  action: GroupAction,
  groupPermissions?: Partial<GroupPermissions> | null,
  myRestriction?: MemberRestriction | null,
): boolean {
  if (myRole === "owner") return true;

  const restrictionActive = isRestrictionActive(myRestriction);

  if (myRole === "admin") {
    if (restrictionActive && myRestriction && myRestriction[action] === false) {
      return false;
    }
    return true;
  }

  // Role: member
  const groupAllows = groupPermissions?.[action] ?? DEFAULT_GROUP_PERMISSIONS[action];
  if (!groupAllows) return false;

  if (restrictionActive && myRestriction && myRestriction[action] === false) {
    return false;
  }

  return true;
}
