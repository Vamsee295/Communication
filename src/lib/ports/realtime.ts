export type Unsubscribe = () => void;

export type ConversationRealtimeHandlers = {
  onMessageInsert: () => void;
  onMessageUpdate: () => void;
  onMessageDelete: (oldId?: string) => void;
  onReceipts: () => void;
  onReactions: () => void;
  onPins: () => void;
  onHidden: (messageId?: string) => void;
  onTyping: (userId: string) => void;
  onPresence: (presentIds: Set<string>) => void;
  onReady?: () => void;
};

export type ConversationRealtimeSession = {
  unsubscribe: Unsubscribe;
  sendTyping: () => void;
};

export interface RealtimeService {
  subscribeInbox(
    userId: string,
    handlers: { onMessageInsert: () => void; onFriendshipChange: () => void },
  ): Unsubscribe;
  subscribeConversation(
    conversationId: string,
    userId: string,
    handlers: ConversationRealtimeHandlers,
  ): ConversationRealtimeSession;
  subscribeGlobalPresence(userId: string, onOnlineIds: (ids: Set<string>) => void): Unsubscribe;
}
