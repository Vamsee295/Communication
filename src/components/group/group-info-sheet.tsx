import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  addGroupMember,
  removeGroupMember,
  updateGroupMemberRole,
  updateGroupTitle,
  updateGroupDescription,
  getGroupPermissions,
  setGroupPermissions,
  listMemberRestrictions,
  setMemberRestriction,
  removeMemberRestriction,
  createGroupInviteLink,
  revokeGroupInviteLink,
  listGroupInviteLinks,
  listGroupAdminActions,
  leaveConversation,
  type ChatProfile,
  type GroupAction,
  type GroupAdminAction,
  type GroupInviteLink,
  type GroupMemberRole,
  type GroupPermissions,
  type MemberRestriction,
} from "@/lib/chat.functions";
import type { Attachment } from "@/lib/domain/types";
import { listFriendships } from "@/lib/friendships.functions";
import { toast } from "sonner";
import {
  X,
  Pencil,
  Check,
  Loader2,
  UserPlus,
  Trash2,
  LogOut,
  Shield,
  Crown,
  Lock,
  Link as LinkIcon,
  Copy,
  History,
  ArrowLeft,
  ChevronRight,
  Search,
  UserMinus,
  Ban,
  Clock,
  Sparkles,
} from "lucide-react";
import { canPerformGroupAction } from "@/lib/auth/group-permissions";
import { SharedMediaGallery } from "@/components/chat/shared-media-gallery";

export type GroupMember = ChatProfile & { role: GroupMemberRole };

type ViewMode = "overview" | "permissions" | "restrictions" | "links" | "actions" | "edit-restriction";

const ACTION_LABELS: Record<GroupAction, { label: string; description: string }> = {
  send_messages: { label: "Send Messages", description: "Allow members to send text messages" },
  send_media: { label: "Send Photos & Videos", description: "Allow members to upload images and videos" },
  send_files: { label: "Send Files & Docs", description: "Allow members to share attachments" },
  send_voice: { label: "Send Voice Notes", description: "Allow members to record and send audio" },
  send_links: { label: "Embed Links", description: "Allow members to send links with rich previews" },
  create_polls: { label: "Create Polls", description: "Allow members to create and share polls" },
  add_members: { label: "Add Members", description: "Allow members to invite or add other users" },
  pin_messages: { label: "Pin Messages", description: "Allow members to pin messages in the group" },
  change_group_info: { label: "Change Group Info", description: "Allow members to edit group name and bio" },
};

export function GroupInfoSheet({
  conversationId,
  title: initialTitle,
  description: initialDescription,
  avatar_url: initialAvatarUrl,
  created_by,
  members,
  myRole,
  meId,
  onClose,
  onOpenMedia,
}: {
  conversationId: string;
  title: string;
  description?: string | null;
  avatar_url?: string | null;
  created_by: string | null;
  members: GroupMember[];
  myRole: GroupMemberRole;
  meId: string | undefined;
  onClose: () => void;
  onOpenMedia?: (attachmentId: string, allMedia: Attachment[]) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const doAddMember = useServerFn(addGroupMember);
  const doRemoveMember = useServerFn(removeGroupMember);
  const doUpdateRole = useServerFn(updateGroupMemberRole);
  const doUpdateTitle = useServerFn(updateGroupTitle);
  const doUpdateDescription = useServerFn(updateGroupDescription);
  const doGetPermissions = useServerFn(getGroupPermissions);
  const doSetPermissions = useServerFn(setGroupPermissions);
  const doListRestrictions = useServerFn(listMemberRestrictions);
  const doSetRestriction = useServerFn(setMemberRestriction);
  const doRemoveRestriction = useServerFn(removeMemberRestriction);
  const doCreateInviteLink = useServerFn(createGroupInviteLink);
  const doRevokeInviteLink = useServerFn(revokeGroupInviteLink);
  const doListInviteLinks = useServerFn(listGroupInviteLinks);
  const doListAdminActions = useServerFn(listGroupAdminActions);
  const doLeave = useServerFn(leaveConversation);
  const doFetchFriendships = useServerFn(listFriendships);

  const [currentView, setCurrentView] = useState<ViewMode>("overview");
  const [memberSearch, setMemberSearch] = useState("");
  const [editTitle, setEditTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(initialTitle);
  const [editBio, setEditBio] = useState(false);
  const [bioDraft, setBioDraft] = useState(initialDescription ?? "");
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [pickedFriendId, setPickedFriendId] = useState<string | null>(null);

  // Selected member for editing restrictions
  const [selectedRestrictedMember, setSelectedRestrictedMember] = useState<GroupMember | null>(null);
  const [restrictionDraft, setRestrictionDraft] = useState<Partial<Record<GroupAction, boolean>>>({
    send_messages: true,
    send_media: true,
    send_files: true,
    send_voice: true,
    send_links: true,
    create_polls: true,
    add_members: true,
    pin_messages: true,
    change_group_info: true,
  });
  const [restrictionDuration, setRestrictionDuration] = useState<"1h" | "1d" | "1w" | "forever">("forever");

  // Queries
  const friendships = useQuery({
    queryKey: ["friendships-list"],
    queryFn: () => doFetchFriendships(),
    staleTime: 30_000,
  });

  const permissionsQuery = useQuery({
    queryKey: ["group-permissions", conversationId],
    queryFn: () => doGetPermissions({ data: { conversation_id: conversationId } }),
    staleTime: 10_000,
  });

  const restrictionsQuery = useQuery({
    queryKey: ["member-restrictions", conversationId],
    queryFn: () => doListRestrictions({ data: { conversation_id: conversationId } }),
    staleTime: 10_000,
  });

  const inviteLinksQuery = useQuery({
    queryKey: ["group-invite-links", conversationId],
    queryFn: () => doListInviteLinks({ data: { conversation_id: conversationId } }),
    staleTime: 10_000,
    enabled: myRole === "owner" || myRole === "admin",
  });

  const adminActionsQuery = useQuery({
    queryKey: ["group-admin-actions", conversationId],
    queryFn: () => doListAdminActions({ data: { conversation_id: conversationId } }),
    staleTime: 10_000,
    enabled: currentView === "actions",
  });

  const groupPermissions = permissionsQuery.data as GroupPermissions | null | undefined;
  const memberRestrictions = (restrictionsQuery.data ?? []) as MemberRestriction[];
  const inviteLinks = (inviteLinksQuery.data ?? []) as GroupInviteLink[];
  const adminActions = (adminActionsQuery.data ?? []) as GroupAdminAction[];

  const isOwner = myRole === "owner";
  const isAdmin = myRole === "admin";
  const canManage = isOwner || isAdmin;
  const canEditInfo = canPerformGroupAction(myRole, "change_group_info", groupPermissions);

  // Friends not already in group
  const acceptedFriends = (friendships.data?.friendships ?? []).filter((f) => f.status === "accepted");
  const memberIds = new Set(members.map((m) => m.id));
  const friendsMap = (friendships.data?.profiles ?? {}) as Record<
    string,
    { display_name?: string | null; username?: string | null }
  >;
  const addableFriends = acceptedFriends.filter((f) => {
    const friendId = f.requester_id === meId ? f.addressee_id : f.requester_id;
    return !memberIds.has(friendId);
  });

  const filteredMembers = members.filter((m) => {
    const name = (m.display_name ?? m.username ?? "").toLowerCase();
    return name.includes(memberSearch.toLowerCase().trim());
  });

  const saveTitle = async () => {
    if (titleDraft.trim() === initialTitle) {
      setEditTitle(false);
      return;
    }
    setLoading("title");
    try {
      await doUpdateTitle({ data: { conversation_id: conversationId, title: titleDraft.trim() } });
      qc.invalidateQueries({ queryKey: ["conv", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Group name updated");
      setEditTitle(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update group name");
    } finally {
      setLoading(null);
    }
  };

  const saveBio = async () => {
    if (bioDraft.trim() === (initialDescription ?? "")) {
      setEditBio(false);
      return;
    }
    setLoading("bio");
    try {
      await doUpdateDescription({ data: { conversation_id: conversationId, description: bioDraft.trim() } });
      qc.invalidateQueries({ queryKey: ["conv", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Group description updated");
      setEditBio(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update description");
    } finally {
      setLoading(null);
    }
  };

  const removeMember = async (memberId: string) => {
    setLoading(`remove-${memberId}`);
    try {
      await doRemoveMember({ data: { conversation_id: conversationId, member_id: memberId } });
      qc.invalidateQueries({ queryKey: ["conv", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Member removed");
      setConfirmRemove(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove member");
    } finally {
      setLoading(null);
    }
  };

  const changeRole = async (memberId: string, role: GroupMemberRole) => {
    setLoading(`role-${memberId}`);
    try {
      await doUpdateRole({ data: { conversation_id: conversationId, member_id: memberId, role } });
      qc.invalidateQueries({ queryKey: ["conv", conversationId] });
      toast.success(role === "admin" ? "Promoted to Admin" : "Demoted to Member");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update role");
    } finally {
      setLoading(null);
    }
  };

  const addFriend = async () => {
    if (!pickedFriendId) return;
    setLoading("add");
    try {
      await doAddMember({ data: { conversation_id: conversationId, member_id: pickedFriendId } });
      qc.invalidateQueries({ queryKey: ["conv", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Member added to group");
      setAddMode(false);
      setPickedFriendId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add member");
    } finally {
      setLoading(null);
    }
  };

  const leaveGroup = async () => {
    setLoading("leave");
    try {
      await doLeave({ data: { conversation_id: conversationId } });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("You left the group");
      navigate({ to: "/chats" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not leave group");
      setLoading(null);
    }
  };

  const toggleGroupPermission = async (action: GroupAction, currentVal: boolean) => {
    setLoading(`perm-${action}`);
    try {
      await doSetPermissions({
        data: {
          conversation_id: conversationId,
          [action]: !currentVal,
        },
      });
      qc.invalidateQueries({ queryKey: ["group-permissions", conversationId] });
      toast.success("Permission updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update permission");
    } finally {
      setLoading(null);
    }
  };

  const openRestrictionEditor = (member: GroupMember) => {
    setSelectedRestrictedMember(member);
    const existing = memberRestrictions.find((r) => r.user_id === member.id);
    if (existing) {
      setRestrictionDraft({
        send_messages: existing.send_messages,
        send_media: existing.send_media,
        send_files: existing.send_files,
        send_voice: existing.send_voice,
        send_links: existing.send_links,
        create_polls: existing.create_polls,
        add_members: existing.add_members,
        pin_messages: existing.pin_messages,
        change_group_info: existing.change_group_info,
      });
      setRestrictionDuration("forever");
    } else {
      setRestrictionDraft({
        send_messages: true,
        send_media: true,
        send_files: true,
        send_voice: true,
        send_links: true,
        create_polls: true,
        add_members: true,
        pin_messages: true,
        change_group_info: true,
      });
      setRestrictionDuration("forever");
    }
    setCurrentView("edit-restriction");
  };

  const saveMemberRestriction = async () => {
    if (!selectedRestrictedMember) return;
    setLoading("save-restriction");
    try {
      let until: string | null = null;
      if (restrictionDuration === "1h") until = new Date(Date.now() + 3600 * 1000).toISOString();
      else if (restrictionDuration === "1d") until = new Date(Date.now() + 86400 * 1000).toISOString();
      else if (restrictionDuration === "1w") until = new Date(Date.now() + 7 * 86400 * 1000).toISOString();

      await doSetRestriction({
        data: {
          conversation_id: conversationId,
          target_user_id: selectedRestrictedMember.id,
          restricted_until: until,
          ...restrictionDraft,
        },
      });
      qc.invalidateQueries({ queryKey: ["member-restrictions", conversationId] });
      toast.success("Member restrictions saved");
      setCurrentView("restrictions");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save restriction");
    } finally {
      setLoading(null);
    }
  };

  const removeRestriction = async (userId: string) => {
    setLoading(`remove-res-${userId}`);
    try {
      await doRemoveRestriction({
        data: {
          conversation_id: conversationId,
          target_user_id: userId,
        },
      });
      qc.invalidateQueries({ queryKey: ["member-restrictions", conversationId] });
      toast.success("Restriction removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove restriction");
    } finally {
      setLoading(null);
    }
  };

  const createInviteLink = async () => {
    setLoading("create-link");
    try {
      await doCreateInviteLink({
        data: {
          conversation_id: conversationId,
        },
      });
      qc.invalidateQueries({ queryKey: ["group-invite-links", conversationId] });
      toast.success("New invite link created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create invite link");
    } finally {
      setLoading(null);
    }
  };

  const revokeInviteLink = async (linkId: string) => {
    setLoading(`revoke-${linkId}`);
    try {
      await doRevokeInviteLink({
        data: {
          conversation_id: conversationId,
          link_id: linkId,
        },
      });
      qc.invalidateQueries({ queryKey: ["group-invite-links", conversationId] });
      toast.success("Invite link revoked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not revoke invite link");
    } finally {
      setLoading(null);
    }
  };

  const copyToClipboard = (text: string, label: string = "Link") => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-border bg-card p-5 shadow-2xl animate-scale-in max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            {currentView !== "overview" && (
              <button
                onClick={() => setCurrentView("overview")}
                className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted text-muted-foreground transition"
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h3 className="text-lg font-bold text-foreground capitalize">
              {currentView === "overview" && "Group Info"}
              {currentView === "permissions" && "Group Permissions"}
              {currentView === "restrictions" && "Member Exceptions"}
              {currentView === "links" && "Invite Links"}
              {currentView === "actions" && "Recent Admin Actions"}
              {currentView === "edit-restriction" && "Edit Member Restriction"}
            </h3>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted text-muted-foreground transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable View Area */}
        <div className="flex-1 overflow-y-auto py-3 space-y-4">
          {/* VIEW: OVERVIEW */}
          {currentView === "overview" && (
            <>
              {/* Group Identity Card */}
              <div className="flex flex-col items-center text-center p-4 rounded-2xl bg-surface-2/40 border border-border/40">
                <div className="relative mb-3">
                  <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-tr from-primary/30 to-primary/10 border-2 border-primary/20 text-primary font-bold text-2xl shadow-sm">
                    {initialTitle.charAt(0).toUpperCase()}
                  </div>
                  {isOwner && (
                    <div className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-amber-500 text-white shadow" title="You are the Owner">
                      <Crown className="h-3.5 w-3.5" />
                    </div>
                  )}
                  {!isOwner && isAdmin && (
                    <div className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-primary text-white shadow" title="You are an Admin">
                      <Shield className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>

                {/* Title Edit */}
                {editTitle ? (
                  <div className="flex gap-2 w-full max-w-sm mb-2">
                    <input
                      autoFocus
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      maxLength={100}
                      className="flex-1 rounded-xl border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveTitle();
                        if (e.key === "Escape") setEditTitle(false);
                      }}
                    />
                    <button
                      onClick={saveTitle}
                      disabled={loading === "title"}
                      className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground shadow"
                    >
                      {loading === "title" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <h2 className="text-xl font-bold tracking-tight text-foreground">{titleDraft}</h2>
                    {canEditInfo && (
                      <button
                        onClick={() => setEditTitle(true)}
                        className="grid h-7 w-7 place-items-center rounded-full hover:bg-muted text-muted-foreground hover:text-primary transition"
                        title="Edit group name"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {/* Bio / Description */}
                {editBio ? (
                  <div className="flex flex-col gap-2 w-full max-w-sm mt-1">
                    <textarea
                      autoFocus
                      value={bioDraft}
                      onChange={(e) => setBioDraft(e.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder="Add a group description or bio..."
                      className="w-full rounded-xl border border-border bg-surface-2 p-2.5 text-xs outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditBio(false)} className="px-3 py-1 text-xs rounded-full border border-border">Cancel</button>
                      <button onClick={saveBio} disabled={loading === "bio"} className="px-3 py-1 text-xs rounded-full bg-primary text-primary-foreground font-semibold">
                        {loading === "bio" ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-1.5 mt-0.5">
                    <p className="text-xs text-muted-foreground max-w-sm">
                      {bioDraft ? bioDraft : <span className="italic">No group description yet</span>}
                    </p>
                    {canEditInfo && (
                      <button
                        onClick={() => setEditBio(true)}
                        className="grid h-6 w-6 place-items-center rounded-full hover:bg-muted text-muted-foreground hover:text-primary transition"
                        title="Edit description"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <span className="px-2.5 py-0.5 rounded-full bg-surface-2 border border-border/40">
                    {members.length} {members.length === 1 ? "member" : "members"}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-surface-2 border border-border/40">
                    Role: <strong className="text-primary capitalize">{myRole}</strong>
                  </span>
                </div>
              </div>

              {/* Admin Management Navigation Rows */}
              {canManage && (
                <div className="rounded-2xl border border-border/50 bg-surface-2/30 overflow-hidden divide-y divide-border/40">
                  <button
                    onClick={() => setCurrentView("permissions")}
                    className="flex w-full items-center justify-between p-3.5 hover:bg-surface-2/60 transition text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500/15 text-primary">
                        <Lock className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Group Permissions</p>
                        <p className="text-xs text-muted-foreground">Configure what standard members can do</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>

                  <button
                    onClick={() => setCurrentView("restrictions")}
                    className="flex w-full items-center justify-between p-3.5 hover:bg-surface-2/60 transition text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/15 text-amber-600">
                        <Ban className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Member Exceptions</p>
                        <p className="text-xs text-muted-foreground">
                          {memberRestrictions.length} individual {memberRestrictions.length === 1 ? "restriction" : "restrictions"}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>

                  <button
                    onClick={() => setCurrentView("links")}
                    className="flex w-full items-center justify-between p-3.5 hover:bg-surface-2/60 transition text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600">
                        <LinkIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Invite Links</p>
                        <p className="text-xs text-muted-foreground">Create and manage join links</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>

                  <button
                    onClick={() => setCurrentView("actions")}
                    className="flex w-full items-center justify-between p-3.5 hover:bg-surface-2/60 transition text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-purple-500/15 text-purple-600">
                        <History className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Recent Actions</p>
                        <p className="text-xs text-muted-foreground">View audit log of admin activities</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              )}

              {/* Members Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Members ({members.length})
                  </h4>
                  {canPerformGroupAction(myRole, "add_members", groupPermissions) && !addMode && (
                    <button
                      onClick={() => setAddMode(true)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                    >
                      <UserPlus className="h-3.5 w-3.5" /> Add Member
                    </button>
                  )}
                </div>

                {/* Add Member Panel */}
                {addMode && (
                  <div className="p-3.5 rounded-2xl bg-surface-2/60 border border-border space-y-3">
                    <p className="text-xs font-semibold text-foreground">Select a friend to add:</p>
                    {addableFriends.length === 0 ? (
                      <p className="py-2 text-center text-xs text-muted-foreground">All your friends are already in this group</p>
                    ) : (
                      <ul className="max-h-36 overflow-y-auto space-y-1 pr-1">
                        {addableFriends.map((f) => {
                          const friendId = f.requester_id === meId ? f.addressee_id : f.requester_id;
                          const prof = friendsMap[friendId];
                          const name = prof?.display_name ?? prof?.username ?? "Friend";
                          return (
                            <li key={f.id}>
                              <button
                                onClick={() => setPickedFriendId(friendId)}
                                className={[
                                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition",
                                  pickedFriendId === friendId ? "bg-primary/20 ring-1 ring-primary text-primary font-semibold" : "hover:bg-muted/60",
                                ].join(" ")}
                              >
                                <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/20 font-bold text-primary text-xs">
                                  {name.charAt(0).toUpperCase()}
                                </div>
                                <span className="truncate flex-1">{name}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => {
                          setAddMode(false);
                          setPickedFriendId(null);
                        }}
                        className="flex-1 h-8 rounded-xl border border-border text-xs font-semibold hover:bg-muted"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={addFriend}
                        disabled={!pickedFriendId || loading === "add"}
                        className="flex-1 h-8 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40"
                      >
                        {loading === "add" ? "Adding…" : "Add Member"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Member Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Search members..."
                    className="w-full rounded-xl border border-border/60 bg-surface-2/40 pl-9 pr-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>

                {/* Member List */}
                <ul className="space-y-1 max-h-56 overflow-y-auto pr-1">
                  {filteredMembers.map((m) => {
                    const name = m.display_name ?? m.username ?? "Ghost";
                    const isMe = m.id === meId;
                    const memberRole = m.role ?? (m.id === created_by ? "owner" : "member");
                    const isLoading = loading === `remove-${m.id}` || loading === `role-${m.id}`;

                    return (
                      <li key={m.id} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-surface-2/50 transition">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative">
                            <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 font-bold text-primary text-xs shrink-0">
                              {name.charAt(0).toUpperCase()}
                            </div>
                            {memberRole === "owner" && (
                              <div className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-amber-500 text-white" title="Owner">
                                <Crown className="h-2.5 w-2.5" />
                              </div>
                            )}
                            {memberRole === "admin" && (
                              <div className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-primary text-white" title="Admin">
                                <Shield className="h-2.5 w-2.5" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {name} {isMe && <span className="text-xs text-muted-foreground font-normal">(you)</span>}
                              </p>
                              {memberRole === "owner" && (
                                <span className="rounded-full bg-amber-500/15 text-amber-600 px-1.5 py-0.2 text-[10px] font-bold">
                                  Owner
                                </span>
                              )}
                              {memberRole === "admin" && (
                                <span className="rounded-full bg-primary/15 text-primary px-1.5 py-0.2 text-[10px] font-bold">
                                  Admin
                                </span>
                              )}
                            </div>
                            {m.username && <p className="truncate text-[11px] text-muted-foreground">@{m.username}</p>}
                          </div>
                        </div>

                        {/* Actions for this member */}
                        {!isMe && canManage && memberRole !== "owner" && (
                          <div className="flex items-center gap-1">
                            {isLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : (
                              <>
                                {/* Owner can promote/demote */}
                                {isOwner && memberRole === "member" && (
                                  <button
                                    onClick={() => changeRole(m.id, "admin")}
                                    className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition text-xs"
                                    title="Promote to Admin"
                                  >
                                    <Shield className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {isOwner && memberRole === "admin" && (
                                  <button
                                    onClick={() => changeRole(m.id, "member")}
                                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition text-xs"
                                    title="Demote to Member"
                                  >
                                    <UserMinus className="h-3.5 w-3.5" />
                                  </button>
                                )}

                                {/* Admin / Owner can set individual restrictions */}
                                <button
                                  onClick={() => openRestrictionEditor(m)}
                                  className="p-1.5 rounded-lg hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600 transition"
                                  title="Restrict Permissions"
                                >
                                  <Ban className="h-3.5 w-3.5" />
                                </button>

                                {/* Remove Member */}
                                <button
                                  onClick={() => setConfirmRemove(m.id)}
                                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                                  title="Remove Member"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {/* Confirm Remove Member Dialog */}
                {confirmRemove && (
                  <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 space-y-2">
                    <p className="text-xs font-semibold text-destructive">Remove this member from the group?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmRemove(null)}
                        className="flex-1 h-8 rounded-lg border border-border text-xs font-semibold hover:bg-muted"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => removeMember(confirmRemove)}
                        disabled={loading === `remove-${confirmRemove}`}
                        className="flex-1 h-8 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold"
                      >
                        {loading === `remove-${confirmRemove}` ? "Removing..." : "Confirm Remove"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Shared Media Section */}
              <div className="pt-2 border-t border-border/50">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  Shared Media & Files
                </h4>
                <SharedMediaGallery
                  conversationId={conversationId}
                  onOpenMedia={(id, allMedia) => {
                    onClose();
                    onOpenMedia?.(id, allMedia);
                  }}
                />
              </div>

              {/* Leave Group Button */}
              <div className="pt-2">
                {!confirmLeave ? (
                  <button
                    onClick={() => setConfirmLeave(true)}
                    className="flex w-full items-center justify-center gap-2 h-10 rounded-xl border border-destructive/30 text-destructive text-xs font-semibold hover:bg-destructive/10 transition"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Leave Group
                  </button>
                ) : (
                  <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 space-y-2">
                    <p className="text-xs font-semibold text-destructive">
                      {isOwner && members.length > 1
                        ? "Leaving will transfer group ownership to another admin or member."
                        : "Are you sure you want to leave this group?"}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmLeave(false)}
                        className="flex-1 h-8 rounded-lg border border-border text-xs font-semibold hover:bg-muted"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={leaveGroup}
                        disabled={loading === "leave"}
                        className="flex-1 h-8 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold"
                      >
                        {loading === "leave" ? "Leaving..." : "Leave Group"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* VIEW: PERMISSIONS */}
          {currentView === "permissions" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Define default permissions for standard group members. Group admins bypass these settings.
              </p>

              <div className="rounded-2xl border border-border/50 bg-surface-2/30 divide-y divide-border/30 overflow-hidden">
                {(Object.keys(ACTION_LABELS) as GroupAction[]).map((action) => {
                  const info = ACTION_LABELS[action];
                  const currentVal = groupPermissions ? groupPermissions[action] : true;
                  const isBusy = loading === `perm-${action}`;

                  return (
                    <div key={action} className="flex items-center justify-between p-3.5">
                      <div className="min-w-0 pr-3">
                        <p className="text-sm font-semibold text-foreground">{info.label}</p>
                        <p className="text-[11px] text-muted-foreground">{info.description}</p>
                      </div>
                      <button
                        onClick={() => toggleGroupPermission(action, currentVal)}
                        disabled={isBusy || !canManage}
                        className={[
                          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                          currentVal ? "bg-primary" : "bg-muted-foreground/30",
                          !canManage ? "opacity-50 cursor-not-allowed" : "",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                            currentVal ? "translate-x-5" : "translate-x-0",
                          ].join(" ")}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW: RESTRICTIONS */}
          {currentView === "restrictions" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Individual member restrictions subtract capabilities from specific users.
                </p>
              </div>

              {memberRestrictions.length === 0 ? (
                <div className="text-center py-8 px-4 rounded-2xl bg-surface-2/20 border border-dashed border-border/60">
                  <Ban className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm font-semibold text-foreground">No member exceptions</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    All members have standard group permissions.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {memberRestrictions.map((res) => {
                    const targetMember = members.find((m) => m.id === res.user_id);
                    const name = targetMember?.display_name ?? targetMember?.username ?? "Member";
                    const isExpired = res.restricted_until && new Date(res.restricted_until).getTime() < Date.now();

                    const restrictedActions = (Object.keys(ACTION_LABELS) as GroupAction[]).filter(
                      (action) => res[action] === false
                    );

                    return (
                      <li key={res.id} className="p-3.5 rounded-2xl bg-surface-2/40 border border-border/50 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="grid h-8 w-8 place-items-center rounded-full bg-amber-500/15 text-amber-600 font-bold text-xs">
                              {name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground">{name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {res.restricted_until
                                  ? isExpired
                                    ? "Expired"
                                    : `Until ${new Date(res.restricted_until).toLocaleDateString()}`
                                  : "Indefinite restriction"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {targetMember && (
                              <button
                                onClick={() => openRestrictionEditor(targetMember)}
                                className="px-2.5 py-1 text-xs rounded-lg border border-border hover:bg-muted font-medium"
                              >
                                Edit
                              </button>
                            )}
                            <button
                              onClick={() => removeRestriction(res.user_id)}
                              disabled={loading === `remove-res-${res.user_id}`}
                              className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10"
                              title="Remove restriction"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {restrictedActions.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {restrictedActions.map((act) => (
                              <span
                                key={act}
                                className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-[10px] font-medium"
                              >
                                No {ACTION_LABELS[act].label}
                              </span>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* VIEW: EDIT RESTRICTION FOR A MEMBER */}
          {currentView === "edit-restriction" && selectedRestrictedMember && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-surface-2/40 border border-border/50">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/20 font-bold text-primary text-sm">
                  {(selectedRestrictedMember.display_name ?? selectedRestrictedMember.username ?? "M").charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {selectedRestrictedMember.display_name ?? selectedRestrictedMember.username}
                  </p>
                  <p className="text-xs text-muted-foreground">Customize restrictions for this member</p>
                </div>
              </div>

              {/* Duration selector */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">
                  Duration
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(["1h", "1d", "1w", "forever"] as const).map((dur) => (
                    <button
                      key={dur}
                      onClick={() => setRestrictionDuration(dur)}
                      className={[
                        "h-8 rounded-xl text-xs font-semibold transition border",
                        restrictionDuration === dur
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-surface-2/40 border-border hover:bg-muted text-muted-foreground",
                      ].join(" ")}
                    >
                      {dur === "1h" && "1 Hour"}
                      {dur === "1d" && "1 Day"}
                      {dur === "1w" && "1 Week"}
                      {dur === "forever" && "Forever"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles for capabilities */}
              <div className="rounded-2xl border border-border/50 bg-surface-2/30 divide-y divide-border/30 overflow-hidden">
                {(Object.keys(ACTION_LABELS) as GroupAction[]).map((action) => {
                  const info = ACTION_LABELS[action];
                  const allows = restrictionDraft[action] ?? true;

                  return (
                    <div key={action} className="flex items-center justify-between p-3">
                      <div className="min-w-0 pr-3">
                        <p className="text-xs font-semibold text-foreground">{info.label}</p>
                      </div>
                      <button
                        onClick={() =>
                          setRestrictionDraft((prev) => ({
                            ...prev,
                            [action]: !allows,
                          }))
                        }
                        className={[
                          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                          allows ? "bg-primary" : "bg-destructive/70",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                            allows ? "translate-x-4" : "translate-x-0",
                          ].join(" ")}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setCurrentView("restrictions")}
                  className="flex-1 h-9 rounded-xl border border-border text-xs font-semibold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={saveMemberRestriction}
                  disabled={loading === "save-restriction"}
                  className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow"
                >
                  {loading === "save-restriction" ? "Saving..." : "Apply Restrictions"}
                </button>
              </div>
            </div>
          )}

          {/* VIEW: INVITE LINKS */}
          {currentView === "links" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Anyone with an active link can join this group.</p>
                {canManage && (
                  <button
                    onClick={createInviteLink}
                    disabled={loading === "create-link"}
                    className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    <Sparkles className="h-3 w-3" /> Create New
                  </button>
                )}
              </div>

              {inviteLinks.length === 0 ? (
                <div className="text-center py-8 px-4 rounded-2xl bg-surface-2/20 border border-dashed border-border/60">
                  <LinkIcon className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm font-semibold text-foreground">No active invite links</p>
                  <button
                    onClick={createInviteLink}
                    className="mt-3 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow"
                  >
                    Create First Invite Link
                  </button>
                </div>
              ) : (
                <ul className="space-y-2">
                  {inviteLinks.map((link) => {
                    const isRevoked = Boolean(link.revoked_at);
                    const isExpired = link.expires_at && new Date(link.expires_at).getTime() < Date.now();
                    const fullUrl = `${window.location.origin}/join/${link.token}`;

                    return (
                      <li key={link.id} className="p-3.5 rounded-2xl bg-surface-2/40 border border-border/50 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <LinkIcon className="h-4 w-4 text-primary shrink-0" />
                            <p className="text-xs font-mono font-semibold truncate text-foreground">
                              {link.token}
                            </p>
                          </div>
                          {!isRevoked && !isExpired && (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => copyToClipboard(fullUrl, "Invite Link")}
                                className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold flex items-center gap-1"
                              >
                                <Copy className="h-3 w-3" /> Copy
                              </button>
                              <button
                                onClick={() => revokeInviteLink(link.id)}
                                disabled={loading === `revoke-${link.id}`}
                                className="px-2.5 py-1 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 text-xs font-semibold"
                              >
                                Revoke
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span>Uses: <strong>{link.use_count}</strong> {link.max_uses ? `/ ${link.max_uses}` : ""}</span>
                          {isRevoked && <span className="text-destructive font-semibold">Revoked</span>}
                          {isExpired && !isRevoked && <span className="text-amber-600 font-semibold">Expired</span>}
                          {!isRevoked && !isExpired && <span className="text-emerald-600 font-semibold">Active</span>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* VIEW: ACTIONS LOG */}
          {currentView === "actions" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Recent administrative events in this group.</p>

              {adminActions.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">No administrative actions logged yet</div>
              ) : (
                <ul className="space-y-2">
                  {adminActions.map((act) => {
                    const actor = members.find((m) => m.id === act.actor_id);
                    const target = members.find((m) => m.id === act.target_user_id);
                    const actorName = actor?.display_name ?? actor?.username ?? "Admin";
                    const targetName = target?.display_name ?? target?.username ?? "Member";

                    let actionText = act.action;
                    if (act.action === "group_created") actionText = "created the group";
                    else if (act.action === "member_added") actionText = `added ${targetName}`;
                    else if (act.action === "member_removed") actionText = `removed ${targetName}`;
                    else if (act.action === "role_changed") actionText = `changed role for ${targetName}`;
                    else if (act.action === "title_changed") actionText = "updated group name";
                    else if (act.action === "description_changed") actionText = "updated group bio";
                    else if (act.action === "avatar_changed") actionText = "updated group photo";
                    else if (act.action === "permissions_updated") actionText = "updated group permissions";
                    else if (act.action === "member_restricted") actionText = `restricted permissions for ${targetName}`;
                    else if (act.action === "restriction_removed") actionText = `removed restriction for ${targetName}`;
                    else if (act.action === "invite_link_created") actionText = "created an invite link";
                    else if (act.action === "invite_link_revoked") actionText = "revoked an invite link";
                    else if (act.action === "member_joined_via_link") actionText = "joined via invite link";

                    return (
                      <li key={act.id} className="p-3 rounded-xl bg-surface-2/30 border border-border/40 text-xs flex items-start gap-2.5">
                        <Clock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-foreground">
                            <strong className="font-semibold">{actorName}</strong> {actionText}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(act.created_at).toLocaleString()}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
