import { supabase } from "@/integrations/supabase/client";

const outChannels = new Map<string, ReturnType<typeof supabase.channel>>();

/**
 * Broadcasts a friendship change event (e.g. friend request received, accepted, declined)
 * directly to the target user's global inbox channel `chat:global:${targetUserId}`.
 */
export async function broadcastFriendshipChange(
  targetUserId: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  if (!targetUserId) return;
  try {
    let ch = outChannels.get(targetUserId);
    if (!ch) {
      ch = supabase.channel(`chat:global:${targetUserId}`, {
        config: { broadcast: { self: false } },
      });
      outChannels.set(targetUserId, ch);
      await new Promise<void>((resolve) => {
        ch!.subscribe((status) => {
          if (status === "SUBSCRIBED") resolve();
        });
        setTimeout(resolve, 2000);
      });
    }

    await ch.send({
      type: "broadcast",
      event: "friendship_change",
      payload: payload ?? { action: "updated" },
    });
  } catch (err) {
    console.warn("[Realtime] broadcastFriendshipChange error:", err);
  }
}

/**
 * Server-side fallback: broadcasts a friendship change to Supabase Realtime REST API.
 */
export async function serverBroadcastFriendshipChange(
  targetUserId: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  if (!targetUserId) return;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return;

  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `chat:global:${targetUserId}`,
            event: "friendship_change",
            payload: payload ?? { action: "updated" },
          },
        ],
      }),
    });
  } catch {
    // Non-blocking server-side broadcast fallback
  }
}
