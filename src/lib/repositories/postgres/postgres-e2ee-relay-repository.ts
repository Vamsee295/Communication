import type { DbClient } from "@/lib/infra/postgres/client";

export interface E2eeRelayDeviceRow {
  protocol_device_id: number;
  user_id: string;
  device_key: string;
  device_type: "mobile" | "desktop" | "tablet" | "web";
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface E2eeRelayIdentityRow {
  user_id: string;
  device_id: number;
  identity_type: string;
  x25519_public_key: string;
  ed25519_public_key: string;
  registration_id: number;
}

export interface E2eeEnvelopeRow {
  id: string;
  target_user_id: string;
  target_device_id: number;
  sender_user_id: string;
  sender_device_id: number;
  ciphertext: string;
  message_type: number;
  client_message_id: string | null;
  urgent: boolean;
  ephemeral: boolean;
  client_timestamp: number;
  server_timestamp: number;
  delivered_at: string | null;
  created_at: string;
}

export class PostgresE2eeRelayRepository {
  constructor(private readonly db: DbClient) {}

  async registerDevice(userId: string, deviceKey: string, deviceType: string = "web"): Promise<{ protocol_device_id: number }> {
    const rows = await this.db<{ protocol_device_id: number }[]>`
      INSERT INTO public.e2ee_relay_devices (user_id, device_key, device_type, enabled, updated_at)
      VALUES (${userId}, ${deviceKey}, ${deviceType}, true, now())
      ON CONFLICT (user_id, device_key) DO UPDATE
        SET device_type = EXCLUDED.device_type,
            enabled = true,
            updated_at = now()
      RETURNING protocol_device_id;
    `;
    return { protocol_device_id: rows[0].protocol_device_id };
  }

  async getDevices(userId: string): Promise<E2eeRelayDeviceRow[]> {
    const rows = await this.db<E2eeRelayDeviceRow[]>`
      SELECT protocol_device_id, user_id, device_key, device_type, enabled,
             created_at::text, updated_at::text
        FROM public.e2ee_relay_devices
       WHERE user_id = ${userId}
       ORDER BY protocol_device_id ASC;
    `;
    return rows;
  }

  async syncIdentity(data: {
    user_id: string;
    device_id: number;
    identity_type: string;
    x25519_public_key: string;
    ed25519_public_key: string;
    registration_id: number;
  }): Promise<void> {
    await this.db`
      INSERT INTO public.e2ee_relay_identities (
        user_id, device_id, identity_type, x25519_public_key, ed25519_public_key, registration_id, updated_at
      ) VALUES (
        ${data.user_id}, ${data.device_id}, ${data.identity_type},
        ${data.x25519_public_key}, ${data.ed25519_public_key}, ${data.registration_id}, now()
      )
      ON CONFLICT (user_id, device_id, identity_type) DO UPDATE
        SET x25519_public_key = EXCLUDED.x25519_public_key,
            ed25519_public_key = EXCLUDED.ed25519_public_key,
            registration_id = EXCLUDED.registration_id,
            updated_at = now();
    `;
  }

  async getIdentity(userId: string): Promise<{ x25519_public_key: string; ed25519_public_key: string } | null> {
    const rows = await this.db<{ x25519_public_key: string; ed25519_public_key: string }[]>`
      SELECT x25519_public_key, ed25519_public_key
        FROM public.e2ee_relay_identities
       WHERE user_id = ${userId}
       ORDER BY updated_at DESC
       LIMIT 1;
    `;
    return rows[0] || null;
  }

  async syncPrekeys(userId: string, deviceId: number, keys: Array<{ type: string; keyId: number; publicKey: string; signature?: string }>): Promise<void> {
    for (const key of keys) {
      await this.db`
        INSERT INTO public.e2ee_relay_prekeys (
          user_id, device_id, key_id, key_type, public_key, signature
        ) VALUES (
          ${userId}, ${deviceId}, ${key.keyId}, ${key.type}, ${key.publicKey}, ${key.signature || null}
        )
        ON CONFLICT (user_id, device_id, key_type, key_id) DO UPDATE
          SET public_key = EXCLUDED.public_key,
              signature = EXCLUDED.signature,
              consumed_at = NULL;
      `;
    }
  }

  async getPreKeyBundle(userId: string, deviceId: number): Promise<any | null> {
    const identityRows = await this.db<E2eeRelayIdentityRow[]>`
      SELECT * FROM public.e2ee_relay_identities
       WHERE user_id = ${userId} AND device_id = ${deviceId}
       LIMIT 1;
    `;
    const identity = identityRows[0];
    if (!identity) return null;

    const signedPrekeyRows = await this.db<{ key_id: number; public_key: string; signature: string | null }[]>`
      SELECT key_id, public_key, signature
        FROM public.e2ee_relay_prekeys
       WHERE user_id = ${userId} AND device_id = ${deviceId} AND key_type = 'ecSignedPreKey'
       ORDER BY created_at DESC
       LIMIT 1;
    `;
    const signedPreKey = signedPrekeyRows[0];

    // Atomically consume one one-time prekey if available
    const opkRows = await this.db<{ key_id: number; public_key: string }[]>`
      UPDATE public.e2ee_relay_prekeys
         SET consumed_at = now()
       WHERE id IN (
         SELECT id FROM public.e2ee_relay_prekeys
          WHERE user_id = ${userId} AND device_id = ${deviceId}
            AND key_type = 'preKey' AND consumed_at IS NULL
          ORDER BY key_id ASC
          LIMIT 1
       )
       RETURNING key_id, public_key;
    `;
    const opk = opkRows[0];

    return {
      identityKey: identity.x25519_public_key,
      registrationId: identity.registration_id,
      signedPreKey: signedPreKey ? {
        keyId: signedPreKey.key_id,
        publicKey: signedPreKey.public_key,
        signature: signedPreKey.signature || "",
      } : undefined,
      preKey: opk ? {
        keyId: opk.key_id,
        publicKey: opk.public_key,
      } : undefined,
    };
  }

  async sendEnvelope(senderUserId: string, data: {
    target_user_id: string;
    target_device_id: number;
    sender_device_id: number;
    ciphertext: string;
    message_type: number;
    timestamp: number;
    client_message_id?: string;
    urgent?: boolean;
    ephemeral?: boolean;
  }): Promise<{ message_id: string; server_timestamp: number }> {
    const rows = await this.db<{ id: string; server_timestamp: number }[]>`
      INSERT INTO public.e2ee_envelopes (
        target_user_id, target_device_id, sender_user_id, sender_device_id,
        ciphertext, message_type, client_message_id, urgent, ephemeral, client_timestamp
      ) VALUES (
        ${data.target_user_id}, ${data.target_device_id}, ${senderUserId}, ${data.sender_device_id},
        ${data.ciphertext}, ${data.message_type}, ${data.client_message_id || null},
        ${data.urgent ?? false}, ${data.ephemeral ?? false}, ${data.timestamp}
      )
      RETURNING id, server_timestamp;
    `;
    return { message_id: rows[0].id, server_timestamp: Number(rows[0].server_timestamp) };
  }

  async getPendingEnvelopes(targetUserId: string, protocolDeviceId: number): Promise<E2eeEnvelopeRow[]> {
    const rows = await this.db<E2eeEnvelopeRow[]>`
      SELECT id, target_user_id, target_device_id, sender_user_id, sender_device_id,
             ciphertext, message_type, client_message_id, urgent, ephemeral,
             client_timestamp, server_timestamp, delivered_at::text, created_at::text
        FROM public.e2ee_envelopes
       WHERE target_user_id = ${targetUserId}
         AND target_device_id = ${protocolDeviceId}
         AND delivered_at IS NULL
       ORDER BY server_timestamp ASC
       LIMIT 100;
    `;
    return rows;
  }

  async markDelivered(envelopeId: string, targetUserId: string): Promise<void> {
    await this.db`
      UPDATE public.e2ee_envelopes
         SET delivered_at = now()
       WHERE id = ${envelopeId} AND target_user_id = ${targetUserId};
    `;
  }
}
