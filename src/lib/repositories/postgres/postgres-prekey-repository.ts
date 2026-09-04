import type { DbClient } from "@/lib/infra/postgres/client";
import type { PrekeyRepository } from "@/lib/repositories/ports";
import type { DeviceCryptoPublicBundle, PublicPrekeyRecord } from "@/lib/domain/types";

export class PostgresPrekeyRepository implements PrekeyRepository {
  constructor(private readonly db: DbClient) {}

  async upsertPrekeys(row: {
    device_id: string;
    user_id: string;
    identity_key: string;
    signed_prekey: string;
    signed_prekey_signature: string;
  }): Promise<void> {
    await this.db`
      INSERT INTO public.device_prekeys (
        device_id, user_id, identity_key, signed_prekey, signed_prekey_signature, updated_at
      ) VALUES (
        ${row.device_id}, ${row.user_id}, ${row.identity_key},
        ${row.signed_prekey}, ${row.signed_prekey_signature}, NOW()
      )
      ON CONFLICT (device_id) DO UPDATE SET
        identity_key = EXCLUDED.identity_key,
        signed_prekey = EXCLUDED.signed_prekey,
        signed_prekey_signature = EXCLUDED.signed_prekey_signature,
        updated_at = NOW();
    `;
  }

  async insertOneTimePrekeys(
    deviceId: string,
    keys: Array<{ key_id: number; public_key: string }>
  ): Promise<void> {
    if (keys.length === 0) return;

    for (const k of keys) {
      await this.db`
        INSERT INTO public.device_one_time_prekeys (
          device_id, key_id, public_key
        ) VALUES (
          ${deviceId}, ${k.key_id}, ${k.public_key}
        )
        ON CONFLICT (device_id, key_id) DO NOTHING;
      `;
    }
  }

  async getPublicBundle(deviceId: string): Promise<DeviceCryptoPublicBundle | null> {
    const prekeyRows = await this.db<PublicPrekeyRecord[]>`
      SELECT device_id, user_id, identity_key, signed_prekey, signed_prekey_signature,
             created_at::text, updated_at::text
        FROM public.device_prekeys
       WHERE device_id = ${deviceId}
       LIMIT 1;
    `;

    const main = prekeyRows[0];
    if (!main) return null;

    // Atomically consume one OPK if available
    const opk = await this.consumeOneTimePrekey(deviceId);

    return {
      device_id: main.device_id,
      user_id: main.user_id,
      identity_key: main.identity_key,
      signed_prekey: main.signed_prekey,
      signed_prekey_signature: main.signed_prekey_signature,
      one_time_prekey: opk,
    };
  }

  async consumeOneTimePrekey(
    deviceId: string
  ): Promise<{ key_id: number; public_key: string } | null> {
    // Atomic consumption using CTE / atomic DELETE RETURNING
    const rows = await this.db<Array<{ key_id: number; public_key: string }>>`
      DELETE FROM public.device_one_time_prekeys
       WHERE id = (
         SELECT id FROM public.device_one_time_prekeys
          WHERE device_id = ${deviceId}
          ORDER BY key_id ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
       )
       RETURNING key_id, public_key;
    `;
    return rows[0] ?? null;
  }

  async getOneTimePrekeyCount(deviceId: string): Promise<number> {
    const rows = await this.db<Array<{ count: string }>>`
      SELECT COUNT(*)::text AS count
        FROM public.device_one_time_prekeys
       WHERE device_id = ${deviceId};
    `;
    return Number(rows[0]?.count ?? 0);
  }

  async revokeDevicePrekeys(deviceId: string): Promise<void> {
    await this.db`
      DELETE FROM public.device_prekeys WHERE device_id = ${deviceId};
    `;
    await this.db`
      DELETE FROM public.device_one_time_prekeys WHERE device_id = ${deviceId};
    `;
  }
}
