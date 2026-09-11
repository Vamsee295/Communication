import type { Call, CallStatus, CallType, Device } from "@/lib/domain/types";
import type { CallRepository, DeviceRepository } from "@/lib/repositories/ports";
import type { DbClient } from "@/lib/infra/postgres/client";

export class PostgresDeviceRepository implements DeviceRepository {
  constructor(private readonly db: DbClient) {}

  async upsert(row: {
    user_id: string;
    device_key: string;
    device_name: string;
    platform: string;
    user_agent?: string;
    last_seen_at: string;
    revoked_at: null;
  }): Promise<Device> {
    const rows = await this.db<Device[]>`
      INSERT INTO public.devices (
        user_id, device_key, device_name, platform, user_agent, last_seen_at, revoked_at
      ) VALUES (
        ${row.user_id}, ${row.device_key}, ${row.device_name},
        ${row.platform}, ${row.user_agent ?? null}, ${row.last_seen_at}, null
      )
      ON CONFLICT (user_id, device_key) DO UPDATE
         SET device_name = EXCLUDED.device_name,
             platform = EXCLUDED.platform,
             user_agent = EXCLUDED.user_agent,
             last_seen_at = EXCLUDED.last_seen_at
   RETURNING id, user_id, device_key, device_name, platform, user_agent,
             last_seen_at::text, revoked_at::text, created_at::text;
    `;
    return rows[0];
  }

  async listForUser(userId: string): Promise<Device[]> {
    const rows = await this.db<Device[]>`
      SELECT id, user_id, device_key, device_name, platform, user_agent,
             last_seen_at::text, revoked_at::text, created_at::text
        FROM public.devices
       WHERE user_id = ${userId}
       ORDER BY last_seen_at DESC;
    `;
    return rows;
  }

  async getByKey(userId: string, deviceKey: string): Promise<Device | null> {
    const rows = await this.db<Device[]>`
      SELECT id, user_id, device_key, device_name, platform, user_agent,
             last_seen_at::text, revoked_at::text, created_at::text
        FROM public.devices
       WHERE user_id = ${userId} AND device_key = ${deviceKey}
       LIMIT 1;
    `;
    return rows[0] ?? null;
  }

  async revoke(userId: string, deviceId: string, revokedAt: string): Promise<{ id: string; device_key: string } | null> {
    const rows = await this.db<Array<{ id: string; device_key: string }>>`
      UPDATE public.devices
         SET revoked_at = ${revokedAt}
       WHERE id = ${deviceId} AND user_id = ${userId}
   RETURNING id, device_key;
    `;
    return rows[0] ?? null;
  }

  async delete(userId: string, deviceId: string): Promise<boolean> {
    const rows = await this.db<Array<{ id: string }>>`
      DELETE FROM public.devices
       WHERE id = ${deviceId}
         AND user_id = ${userId}
         AND revoked_at IS NOT NULL
      RETURNING id;
    `;
    return rows.length > 0;
  }

  async deleteMany(userId: string, deviceIds: string[]): Promise<number> {
    if (deviceIds.length === 0) return 0;
    const rows = await this.db<Array<{ id: string }>>`
      DELETE FROM public.devices
       WHERE id = ANY(${deviceIds})
         AND user_id = ${userId}
         AND revoked_at IS NOT NULL
      RETURNING id;
    `;
    return rows.length;
  }

  async clearRevoked(userId: string): Promise<number> {
    const rows = await this.db<Array<{ id: string }>>`
      DELETE FROM public.devices
       WHERE user_id = ${userId}
         AND revoked_at IS NOT NULL
      RETURNING id;
    `;
    return rows.length;
  }
}

export class PostgresCallRepository implements CallRepository {
  constructor(private readonly db: DbClient) {}

  async insert(row: {
    conversation_id: string;
    caller_id: string;
    callee_id: string;
    call_type: CallType;
    status: "ringing";
  }): Promise<Call> {
    const rows = await this.db<Call[]>`
      INSERT INTO public.calls (
        conversation_id, caller_id, callee_id, call_type, status
      ) VALUES (
        ${row.conversation_id}, ${row.caller_id}, ${row.callee_id},
        ${row.call_type}, ${row.status}
      )
      RETURNING id, conversation_id, caller_id, callee_id, call_type, status,
                started_at::text, ended_at::text, duration_seconds,
                created_at::text, updated_at::text;
    `;
    return rows[0];
  }

  async getById(id: string): Promise<Call | null> {
    const rows = await this.db<Call[]>`
      SELECT id, conversation_id, caller_id, callee_id, call_type, status,
             started_at::text, ended_at::text, duration_seconds,
             created_at::text, updated_at::text
        FROM public.calls
       WHERE id = ${id}
       LIMIT 1;
    `;
    return rows[0] ?? null;
  }

  async updateStatus(
    id: string,
    patch: {
      status: CallStatus;
      duration_seconds?: number;
      started_at?: string;
      ended_at?: string;
    },
  ): Promise<void> {
    const sets: Record<string, unknown> = {
      status: patch.status,
      updated_at: new Date().toISOString(),
    };
    if (patch.duration_seconds !== undefined) sets.duration_seconds = patch.duration_seconds;
    if (patch.started_at !== undefined) sets.started_at = patch.started_at;
    if (patch.ended_at !== undefined) sets.ended_at = patch.ended_at;

    await this.db`
      UPDATE public.calls
         SET ${this.db(sets)}
       WHERE id = ${id};
    `;
  }

  async listForUser(userId: string, limit = 50): Promise<Call[]> {
    const rows = await this.db<Call[]>`
      SELECT id, conversation_id, caller_id, callee_id, call_type, status,
             started_at::text, ended_at::text, duration_seconds,
             created_at::text, updated_at::text
        FROM public.calls
       WHERE caller_id = ${userId} OR callee_id = ${userId}
       ORDER BY created_at DESC
       LIMIT ${limit ?? 50};
    `;
    return rows;
  }

  async deleteFromHistory(callId: string, userId: string): Promise<void> {
    // Only the caller or callee can delete a call from their history.
    await this.db`
      DELETE FROM public.calls
       WHERE id = ${callId}
         AND (caller_id = ${userId} OR callee_id = ${userId});
    `;
  }

  async deleteManyFromHistory(callIds: string[], userId: string): Promise<number> {
    if (callIds.length === 0) return 0;
    const rows = await this.db<Array<{ id: string }>>`
      DELETE FROM public.calls
       WHERE id = ANY(${callIds})
         AND (caller_id = ${userId} OR callee_id = ${userId})
      RETURNING id;
    `;
    return rows.length;
  }

  async clearHistory(userId: string): Promise<number> {
    const rows = await this.db<Array<{ id: string }>>`
      DELETE FROM public.calls
       WHERE caller_id = ${userId} OR callee_id = ${userId}
      RETURNING id;
    `;
    return rows.length;
  }
}
