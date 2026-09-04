/** Provider-independent domain types. Column names match the current API so UI imports stay stable. */

export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  last_seen: string;
  created_at: string;
  updated_at: string;
};

export type ChatProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  last_seen: string | null;
};

export type FriendProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type FriendshipStatus = "pending" | "accepted" | "blocked";

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  responded_at: string | null;
};

export type ConversationKind = "direct" | "group";

export type GroupMemberRole = "owner" | "admin" | "member";

export type Conversation = {
  id: string;
  kind: ConversationKind;
  title?: string | null;
  created_by?: string | null;
  created_at?: string;
  last_message_at: string;
};

export type ConversationMemberFlags = {
  conversation_id: string;
  role?: GroupMemberRole;
  last_read_at: string;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  client_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  reply_to_id: string | null;
  forwarded_from_id: string | null;
  attachments?: Attachment[];
};

export type Attachment = {
  id: string;
  conversation_id: string;
  uploader_id: string;
  message_id: string | null;
  original_filename: string;
  mime_type: string;
  file_size: number;
  status: "pending" | "uploaded" | "attached" | "failed";
  created_at: string;
};

export type Reaction = {
  message_id: string;
  user_id: string;
  emoji: string;
};

export type Pin = {
  conversation_id: string;
  message_id: string;
  pinned_by: string;
  pinned_at: string;
};

export type Star = {
  user_id: string;
  message_id: string;
  starred_at: string;
};

export type MessageReceipt = {
  message_id: string;
  user_id?: string;
  delivered_at: string | null;
  read_at: string | null;
};

export type MessageEdit = {
  previous_body: string;
  edited_at: string;
};

export type ConversationSummary = {
  id: string;
  kind: ConversationKind;
  title: string | null;
  created_by: string | null;
  member_count: number;
  members: ChatProfile[];
  other: ChatProfile | null;
  last_message_at: string;
  last_message: Pick<Message, "id" | "sender_id" | "body" | "created_at" | "deleted_at"> | null;
  unread: number;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  my_role: GroupMemberRole;
};

export type GlobalSearchHit = {
  message: Message;
  conversation_id: string;
  other: ChatProfile | null;
};

export type CallType = "voice" | "video";
export type CallStatus = "ringing" | "accepted" | "declined" | "missed" | "ended" | "failed";

export type Call = {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  call_type: CallType;
  status: CallStatus;
  created_at: string;
  started_at?: string | null;
  ended_at: string | null;
  duration_seconds?: number | null;
};

export type CallPeer = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type AuthUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
};

export type CallHistoryItem = {
  id: string;
  conversation_id: string;
  direction: "incoming" | "outgoing";
  peer: CallPeer | null;
  call_type: CallType;
  status: CallStatus;
  created_at: string;
  ended_at: string | null;
  duration_seconds?: number;
};

export type Device = {
  id: string;
  user_id: string;
  device_key: string;
  device_name: string | null;
  platform: string;
  user_agent: string | null;
  last_seen_at: string;
  revoked_at: string | null;
  created_at: string;
};

export type DeviceCryptoPublicBundle = {
  device_id: string;
  user_id: string;
  identity_key: string;
  signed_prekey: string;
  signed_prekey_signature: string;
  one_time_prekey: {
    key_id: number;
    public_key: string;
  } | null;
};

export type PublicPrekeyRecord = {
  device_id: string;
  user_id: string;
  identity_key: string;
  signed_prekey: string;
  signed_prekey_signature: string;
  created_at: string;
  updated_at: string;
};

export type OneTimePrekeyRecord = {
  id: string;
  device_id: string;
  key_id: number;
  public_key: string;
  created_at: string;
};

export type LocalDevicePrivateState = {
  device_id: string;
  identity_key_private: string;
  identity_key_public: string;
  signed_prekey_private: string;
  signed_prekey_public: string;
  signed_prekey_signature: string;
  one_time_prekeys: Array<{
    key_id: number;
    private_key: string;
    public_key: string;
  }>;
};

