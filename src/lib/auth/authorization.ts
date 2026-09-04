import { AuthorizationError, NotFoundError, ValidationError } from "@/lib/domain/errors";
import type { Call, Conversation, Friendship, Message } from "@/lib/domain/types";
import type {
  CallRepository,
  ConversationRepository,
  FriendshipRepository,
  MessageRepository,
} from "@/lib/repositories/ports";

export interface IConversationPolicy {
  requireMembership(userId: string, conversationId: string): Promise<Conversation>;
  requireMemberships(userId: string, conversationIds: string[]): Promise<Map<string, boolean>>;
}

export interface IMessagePolicy {
  requireAccess(userId: string, messageId: string): Promise<Message>;
  requireOwner(userId: string, messageId: string): Promise<Message>;
  requireReplyValid(conversationId: string, replyToId: string): Promise<Message>;
  requireForwardAccess(userId: string, messageIds: string[]): Promise<Message[]>;
}

export interface ICallPolicy {
  requireParticipant(userId: string, callId: string): Promise<Call>;
  requireInitiation(userId: string, conversationId: string, calleeId: string): Promise<void>;
}

export interface IFriendshipPolicy {
  requireParticipant(userId: string, friendshipId: string): Promise<Friendship>;
}

/**
 * Conversation Authorization Policy
 * Enforces membership before reading, sending, pinning, or fetching metadata.
 */
export class ConversationPolicy implements IConversationPolicy {
  constructor(private readonly conversations: ConversationRepository) {}

  async requireMembership(userId: string, conversationId: string): Promise<Conversation> {
    const memberships = await this.conversations.listMyMemberships(userId);
    const isMember = memberships.some((m) => m.conversation_id === conversationId);
    if (!isMember) {
      throw new AuthorizationError("You do not belong to this conversation");
    }
    return this.conversations.getById(conversationId);
  }

  async requireMemberships(userId: string, conversationIds: string[]): Promise<Map<string, boolean>> {
    if (conversationIds.length === 0) return new Map();
    const memberships = await this.conversations.listMyMemberships(userId);
    const myConvSet = new Set(memberships.map((m) => m.conversation_id));
    const result = new Map<string, boolean>();
    for (const cid of conversationIds) {
      result.set(cid, myConvSet.has(cid));
    }
    return result;
  }
}

/**
 * Message Authorization Policy
 * Enforces reading, editing, deletion, reply boundaries, and forwarding.
 */
export class MessagePolicy implements IMessagePolicy {
  constructor(
    private readonly messages: MessageRepository,
    private readonly conversationPolicy: IConversationPolicy,
  ) {}

  async requireAccess(userId: string, messageId: string): Promise<Message> {
    const msg = await this.messages.getById(messageId);
    if (!msg) {
      throw new NotFoundError("Message not found");
    }
    // Verify user belongs to the conversation containing this message
    await this.conversationPolicy.requireMembership(userId, msg.conversation_id);
    return msg;
  }

  async requireOwner(userId: string, messageId: string): Promise<Message> {
    const msg = await this.requireAccess(userId, messageId);
    if (msg.sender_id !== userId) {
      throw new AuthorizationError("Only the sender can perform this action");
    }
    return msg;
  }

  async requireReplyValid(conversationId: string, replyToId: string): Promise<Message> {
    const parent = await this.messages.getById(replyToId);
    if (!parent) {
      throw new NotFoundError("Reply target message not found");
    }
    if (parent.conversation_id !== conversationId) {
      throw new ValidationError("Cannot reply to a message from a different conversation");
    }
    return parent;
  }

  async requireForwardAccess(userId: string, messageIds: string[]): Promise<Message[]> {
    if (messageIds.length === 0) return [];
    const sourceMessages = await this.messages.getByIds(messageIds);
    if (sourceMessages.length !== messageIds.length) {
      throw new NotFoundError("One or more messages to forward were not found");
    }
    // Group by conversation and verify caller is member of each source conversation
    const convIds = Array.from(new Set(sourceMessages.map((m) => m.conversation_id)));
    for (const cid of convIds) {
      await this.conversationPolicy.requireMembership(userId, cid);
    }
    return sourceMessages;
  }
}

/**
 * Call Authorization Policy
 * Enforces participant authorization on call records and call initiation.
 */
export class CallPolicy implements ICallPolicy {
  constructor(
    private readonly calls: CallRepository,
    private readonly conversationPolicy: IConversationPolicy,
    private readonly friendships: FriendshipRepository,
  ) {}

  async requireParticipant(userId: string, callId: string): Promise<Call> {
    const call = await this.calls.getById(callId);
    if (!call) {
      throw new NotFoundError("Call record not found");
    }
    if (call.caller_id !== userId && call.callee_id !== userId) {
      throw new AuthorizationError("You are not an authorized participant in this call");
    }
    return call;
  }

  async requireInitiation(userId: string, conversationId: string, calleeId: string): Promise<void> {
    if (userId === calleeId) {
      throw new ValidationError("Cannot initiate a call with yourself");
    }
    // Must be a member of the conversation
    await this.conversationPolicy.requireMembership(userId, conversationId);

    // Caller and callee must have an accepted friendship
    const friendship = await this.friendships.findByPair(userId, calleeId);
    if (!friendship || friendship.status !== "accepted") {
      throw new AuthorizationError("Cannot initiate a call with non-friends");
    }
  }
}

/**
 * Composite Authorization Policies Container
 */
export class AuthorizationPolicies {
  readonly conversations: IConversationPolicy;
  readonly messages: IMessagePolicy;
  readonly calls: ICallPolicy;

  constructor(repos: {
    conversations: ConversationRepository;
    messages: MessageRepository;
    calls: CallRepository;
    friendships: FriendshipRepository;
  }) {
    this.conversations = new ConversationPolicy(repos.conversations);
    this.messages = new MessagePolicy(repos.messages, this.conversations);
    this.calls = new CallPolicy(repos.calls, this.conversations, repos.friendships);
  }
}
