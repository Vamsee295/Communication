import { supabase } from "@/integrations/supabase/client";
import type {
  ConversationRealtimeHandlers,
  ConversationRealtimeSession,
  RealtimeService,
  Unsubscribe,
} from "@/lib/ports/realtime";

export class SupabaseRealtimeService implements RealtimeService {
  subscribeInbox(
    userId: string,
    handlers: { onMessageInsert: () => void; onFriendshipChange: () => void },
  ): Unsubscribe {
    const channel = supabase
      .channel(`chat:global:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        handlers.onMessageInsert();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        handlers.onFriendshipChange();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }

  subscribeConversation(
    conversationId: string,
    userId: string,
    handlers: ConversationRealtimeHandlers,
  ): ConversationRealtimeSession {
    const channel = supabase
      .channel(`chat:conv:${conversationId}`, {
        config: { presence: { key: userId }, broadcast: { self: false } },
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        () => handlers.onMessageInsert(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        () => handlers.onMessageUpdate(),
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const oldId = (payload.old as { id?: string } | undefined)?.id;
          handlers.onMessageDelete(oldId);
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "message_receipts" }, () =>
        handlers.onReceipts(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () =>
        handlers.onReactions(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pinned_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => handlers.onPins(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_hidden", filter: `user_id=eq.${userId}` },
        (payload) => {
          const mid = (payload.new as { message_id?: string } | undefined)?.message_id;
          handlers.onHidden(mid);
        },
      )
      .on("broadcast", { event: "typing" }, (payload) => {
        const uid = (payload.payload as { user_id?: string })?.user_id;
        if (uid) handlers.onTyping(uid);
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, unknown>;
        handlers.onPresence(new Set(Object.keys(state).filter((k) => k !== userId)));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: userId, at: Date.now() });
          handlers.onReady?.();
        }
      });

    return {
      unsubscribe: () => {
        supabase.removeChannel(channel);
      },
      sendTyping: () => {
        void channel.send({ type: "broadcast", event: "typing", payload: { user_id: userId } });
      },
    };
  }

  subscribeGlobalPresence(userId: string, onOnlineIds: (ids: Set<string>) => void): Unsubscribe {
    const channel = supabase.channel("presence:ghostline", {
      config: { presence: { key: userId } },
    });
    const sync = () => {
      const state = channel.presenceState() as Record<string, unknown>;
      onOnlineIds(new Set(Object.keys(state)));
    };
    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track({ at: Date.now() });
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }
}

export const realtimeService: RealtimeService = new SupabaseRealtimeService();
