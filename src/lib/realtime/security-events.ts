import { supabase } from "@/integrations/supabase/client";

const outChannels = new Map<string, ReturnType<typeof supabase.channel>>();

export interface SessionRevokedPayload {
  type: "SESSION_REVOKED";
  deviceId?: string;
  deviceKey?: string;
  revokedAt?: string;
}

/**
 * Broadcasts a session revocation event to the target user's global inbox channel `chat:global:${targetUserId}`.
 * Client browsers listening on this topic will immediately inspect the payload and terminate the session if matched.
 */
export async function broadcastSessionRevoked(
  targetUserId: string,
  payload: { deviceId?: string; deviceKey?: string; revokedAt?: string },
): Promise<void> {
  if (!targetUserId) return;
  try {
    let ch = outChannels.get(targetUserId);
    if (!ch) {
      ch = supabase.channel(`security:user:${targetUserId}`, {
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
      event: "session_revoked",
      payload: {
        type: "SESSION_REVOKED",
        deviceId: payload.deviceId,
        deviceKey: payload.deviceKey,
        revokedAt: payload.revokedAt ?? new Date().toISOString(),
      } satisfies SessionRevokedPayload,
    });
  } catch (err) {
    console.warn("[Realtime] broadcastSessionRevoked error:", err);
  }
}

/**
 * Server-side fallback: broadcasts a session revocation to Supabase Realtime REST API.
 */
export async function serverBroadcastSessionRevoked(
  targetUserId: string,
  payload: { deviceId?: string; deviceKey?: string; revokedAt?: string },
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
            topic: `security:user:${targetUserId}`,
            event: "session_revoked",
            payload: {
              type: "SESSION_REVOKED",
              deviceId: payload.deviceId,
              deviceKey: payload.deviceKey,
              revokedAt: payload.revokedAt ?? new Date().toISOString(),
            },
          },
        ],
      }),
    });
  } catch {
    // Non-blocking server-side broadcast fallback
  }
}
