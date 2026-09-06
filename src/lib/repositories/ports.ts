import type {
  Call,
  CallHistoryItem,
  CallPeer,
  CallStatus,
  CallType,
  ChatProfile,
  Conversation,
  ConversationMemberFlags,
  Device,
  Friendship,
  FriendProfile,
  GroupMemberRole,
  Message,
  MessageEdit,
  MessageReceipt,
  Pin,
  Profile,
  Reaction,
  Star,
} from "@/lib/domain/types";

export type ProfilePatch = {
  username?: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string | null;
};

export interface ProfileRepository {
  getById(id: string): Promise<Profile | null>;
  update(id: string, patch: ProfilePatch): Promise<Profile>;
  search(query: string, excludeId: string): Promise<FriendProfile[]>;
  getChatProfiles(ids: string[]): Promise<ChatProfile[]>;
  getCallPeer(id: string): Promise<CallPeer | null>;
  checkUsernameAvailability(username: string): Promise<boolean>;
}

export interface FriendshipRepository {
  listForUser(userId: string): Promise<Friendship[]>;
  findByPair(requesterId: string, addresseeId: string): Promise<Friendship | null>;
  insert(row: {
    requester_id: string;
    addressee_id: string;
    status: "pending";
  }): Promise<Friendship>;
  updateStatus(id: string, status: "accepted" | "blocked", respondedAt: string): Promise<Friendship>;
  deleteAsAddressee(id: string, addresseeId: string): Promise<void>;
  deleteForParticipant(id: string, userId: string): Promise<void>;
  setBlockedBetween(userId: string, otherId: string, respondedAt: string): Promise<void>;
  unblockBetween(userId: string, otherId: string, respondedAt: string): Promise<void>;
  listBlockedForUser(userId: string): Promise<Friendship[]>;
}

export type MemberRow = { conversation_id: string; user_id: string; role?: GroupMemberRole };

export interface ConversationRepository {
  openDirect(friendId: string): Promise<string>;
  createGroup(title: string, memberIds: string[]): Promise<string>;
  addMember(conversationId: string, userId: string, role?: GroupMemberRole): Promise<void>;
  removeMember(conversationId: string, userId: string): Promise<void>;
  updateMemberRole(conversationId: string, userId: string, role: GroupMemberRole): Promise<void>;
  updateGroupTitle(conversationId: string, title: string): Promise<void>;
  listMyMemberships(userId: string): Promise<ConversationMemberFlags[]>;
  getSummaries(ids: string[]): Promise<Array<Conversation>>;
  listMembers(conversationIds: string[]): Promise<MemberRow[]>;
  getById(conversationId: string): Promise<Conversation>;
  updateFlags(
    userId: string,
    conversationId: string,
    patch: { pinned?: boolean; muted?: boolean; archived?: boolean },
  ): Promise<void>;
  updateLastRead(userId: string, conversationId: string, lastReadAt: string): Promise<void>;
  leave(userId: string, conversationId: string): Promise<void>;
}

export type InsertMessage = {
  conversation_id: string;
  sender_id: string;
  body: string;
  client_id?: string | null;
  reply_to_id?: string | null;
  forwarded_from_id?: string | null;
};

export interface MessageRepository {
  list(conversationId: string, opts: { before?: string; limit: number }): Promise<Message[]>;
  getByIds(ids: string[]): Promise<Message[]>;
  getById(id: string): Promise<Message | null>;
  insert(row: InsertMessage): Promise<Message>;
  findByClientId(conversationId: string, senderId: string, clientId: string): Promise<Message | null>;
  updateBody(id: string, body: string): Promise<Message>;
  /** Current product behavior: hard DELETE (not deleted_at). */
  hardDelete(id: string): Promise<void>;
  hideForUser(userId: string, messageId: string): Promise<void>;
  listHiddenIds(userId: string, messageIds: string[]): Promise<string[]>;
  searchInConversation(conversationId: string, needle: string): Promise<Message[]>;
  searchInConversations(conversationIds: string[], needle: string): Promise<Message[]>;
  listRecentPreview(conversationIds: string[], limit: number): Promise<Message[]>;
  lastFromOthers(conversationId: string, excludeUserId: string): Promise<{ created_at: string } | null>;
  countUnread(conversationId: string, userId: string, since: string): Promise<number>;
  listIds(conversationId: string, opts: { limit: number; senderId?: string; createdAtLte?: string }): Promise<string[]>;
  listIdsCreatedAtLte(conversationId: string, createdAtLte: string): Promise<string[]>;
  listEdits(messageId: string): Promise<MessageEdit[]>;
  listReceipts(messageId: string): Promise<Array<{ user_id: string; delivered_at: string | null; read_at: string | null }>>;
  markReceiptsRead(userId: string, messageIds: string[], at: string): Promise<void>;
  listReceiptsForMessages(messageIds: string[]): Promise<Array<{ message_id: string; delivered_at: string | null; read_at: string | null }>>;
  insertMany(rows: InsertMessage[]): Promise<void>;
}

export interface ReactionRepository {
  findMine(userId: string, messageId: string, emoji: string): Promise<Reaction | null>;
  insert(row: { message_id: string; user_id: string; emoji: string }): Promise<void>;
  deleteMine(userId: string, messageId: string, emoji: string): Promise<void>;
  listForMessageIds(messageIds: string[]): Promise<Reaction[]>;
}

export interface PinRepository {
  list(conversationId: string): Promise<Pin[]>;
  insert(row: { conversation_id: string; message_id: string; pinned_by: string }): Promise<void>;
  delete(conversationId: string, messageId: string): Promise<void>;
}

export interface StarRepository {
  findMine(userId: string, messageId: string): Promise<Star | null>;
  insert(userId: string, messageId: string): Promise<void>;
  deleteMine(userId: string, messageId: string): Promise<void>;
  listMine(userId: string, limit: number): Promise<Array<{ message_id: string; starred_at: string }>>;
  listMineIn(userId: string, messageIds: string[]): Promise<string[]>;
}

export interface DeviceRepository {
  upsert(row: {
    user_id: string;
    device_key: string;
    device_name: string;
    platform: string;
    user_agent?: string;
    last_seen_at: string;
    revoked_at: null;
  }): Promise<Device>;
  listForUser(userId: string): Promise<Device[]>;
  revoke(userId: string, deviceId: string, revokedAt: string): Promise<void>;
}

export interface CallRepository {
  insert(row: {
    conversation_id: string;
    caller_id: string;
    callee_id: string;
    call_type: CallType;
    status: "ringing";
  }): Promise<Call>;
  getById(id: string): Promise<Call | null>;
  updateStatus(
    id: string,
    patch: {
      status: CallStatus;
      started_at?: string;
      ended_at?: string;
      duration_seconds?: number;
    },
  ): Promise<void>;
  listForUser(userId: string, limit: number): Promise<Call[]>;
}

export interface PrekeyRepository {
  upsertPrekeys(row: {
    device_id: string;
    user_id: string;
    identity_key: string;
    signed_prekey: string;
    signed_prekey_signature: string;
  }): Promise<void>;

  insertOneTimePrekeys(
    deviceId: string,
    keys: Array<{ key_id: number; public_key: string }>
  ): Promise<void>;

  getPublicBundle(deviceId: string): Promise<{
    device_id: string;
    user_id: string;
    identity_key: string;
    signed_prekey: string;
    signed_prekey_signature: string;
    one_time_prekey: { key_id: number; public_key: string } | null;
  } | null>;

  consumeOneTimePrekey(
    deviceId: string
  ): Promise<{ key_id: number; public_key: string } | null>;

  getOneTimePrekeyCount(deviceId: string): Promise<number>;

  revokeDevicePrekeys(deviceId: string): Promise<void>;
}

