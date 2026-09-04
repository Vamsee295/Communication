import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { CallSignalHandlers, CallSignaling, SignalPayload } from "@/lib/ports/signaling";

const topicFor = (userId: string) => `calls:signal:${userId}`;

export class SupabaseCallSignaling implements CallSignaling {
  private readonly outChannels = new Map<string, RealtimeChannel>();

  async send(targetUserId: string, event: string, payload: SignalPayload): Promise<void> {
    let ch = this.outChannels.get(targetUserId);
    if (!ch) {
      ch = supabase.channel(topicFor(targetUserId), { config: { broadcast: { self: false } } });
      this.outChannels.set(targetUserId, ch);
      await new Promise<void>((resolve) => {
        ch!.subscribe((status) => {
          if (status === "SUBSCRIBED") resolve();
        });
        setTimeout(resolve, 3000);
      });
    }
    await ch.send({ type: "broadcast", event, payload });
  }

  listen(myId: string, handlers: CallSignalHandlers): () => void {
    const channel = supabase.channel(topicFor(myId), { config: { broadcast: { self: false } } });
    channel
      .on("broadcast", { event: "call-offer" }, ({ payload }) => {
        handlers.onOffer(payload as SignalPayload);
      })
      .on("broadcast", { event: "call-answer" }, ({ payload }) => {
        handlers.onAnswer(payload as SignalPayload);
      })
      .on("broadcast", { event: "ice-candidate" }, ({ payload }) => {
        handlers.onIce(payload as SignalPayload);
      })
      .on("broadcast", { event: "call-decline" }, ({ payload }) => {
        handlers.onDecline(payload as SignalPayload);
      })
      .on("broadcast", { event: "call-end" }, ({ payload }) => {
        handlers.onEnd(payload as SignalPayload);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  dispose(): void {
    this.outChannels.forEach((ch) => supabase.removeChannel(ch));
    this.outChannels.clear();
  }
}
