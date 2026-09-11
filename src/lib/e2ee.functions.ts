import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireNotFrozen } from "@/lib/infra/write-gate";
import type { AppSupabase } from "@/lib/infra/supabase/app-client";
import { getPostgresClient } from "@/lib/infra/postgres/client";
import { PostgresPrekeyRepository } from "@/lib/repositories/postgres/postgres-prekey-repository";
import { PostgresDeviceRepository } from "@/lib/repositories/postgres/postgres-device-call-repository";
import { DeviceCryptoService } from "@/lib/services/device-crypto.service";

function service(context: { supabase: AppSupabase; userId: string }) {
  const sql = getPostgresClient();
  const prekeys = new PostgresPrekeyRepository(sql);
  const devices = new PostgresDeviceRepository(sql);
  return new DeviceCryptoService(context.userId, prekeys, devices);
}

const registerBundleSchema = z.object({
  device_id: z.string().uuid(),
  identity_key: z.string().min(10).max(1024),
  signed_prekey: z.string().min(10).max(1024),
  signed_prekey_signature: z.string().min(10).max(2048),
  one_time_prekeys: z.array(
    z.object({
      key_id: z.number().int().nonnegative(),
      public_key: z.string().min(10).max(1024),
    })
  ),
});

export const registerCryptoDeviceBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => registerBundleSchema.parse(data))
  .handler(async ({ data, context }) => service(context).registerBundle(data));

export const getDevicePublicPrekeyBundle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ device_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => service(context).getBundle(data.device_id));

const replenishSchema = z.object({
  device_id: z.string().uuid(),
  one_time_prekeys: z.array(
    z.object({
      key_id: z.number().int().nonnegative(),
      public_key: z.string().min(10).max(1024),
    })
  ),
});

export const replenishDeviceOneTimePrekeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => replenishSchema.parse(data))
  .handler(async ({ data, context }) => service(context).replenishOneTimePrekeys(data));

const rotateSignedPrekeySchema = z.object({
  device_id: z.string().uuid(),
  signed_prekey: z.string().min(10).max(1024),
  signed_prekey_signature: z.string().min(10).max(2048),
});

export const rotateDeviceSignedPrekey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => rotateSignedPrekeySchema.parse(data))
  .handler(async ({ data, context }) => service(context).rotateSignedPrekey(data));

export const revokeDeviceCrypto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ device_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => service(context).revoke(data.device_id));

import { PostgresE2eeRelayRepository } from "@/lib/repositories/postgres/postgres-e2ee-relay-repository";

function relayService() {
  const sql = getPostgresClient();
  return new PostgresE2eeRelayRepository(sql);
}

// ==============================================================================
// E2EE SIGNAL PROTOCOL RELAY TRANSPORT (ZERO-KNOWLEDGE BUFFER)
// ==============================================================================

export const registerE2eeRelayDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z.object({
      device_key: z.string().min(1),
      device_type: z.enum(["mobile", "desktop", "tablet", "web"]).default("web"),
    }).parse(data)
  )
  .handler(async ({ data, context }) => {
    return relayService().registerDevice(context.userId, data.device_key, data.device_type);
  });

export const getE2eeRelayDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ user_id: z.string().uuid() }).parse(data)
  )
  .handler(async ({ data }) => {
    return relayService().getDevices(data.user_id);
  });

export const syncE2eeRelayIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z.object({
      device_id: z.number().int().positive(),
      identity_type: z.string().default("aci"),
      x25519_public_key: z.string().min(1),
      ed25519_public_key: z.string().min(1),
      registration_id: z.number().int().nonnegative(),
    }).parse(data)
  )
  .handler(async ({ data, context }) => {
    await relayService().syncIdentity({
      user_id: context.userId,
      device_id: data.device_id,
      identity_type: data.identity_type,
      x25519_public_key: data.x25519_public_key,
      ed25519_public_key: data.ed25519_public_key,
      registration_id: data.registration_id,
    });
  });

export const getE2eeRelayIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ user_id: z.string().uuid() }).parse(data)
  )
  .handler(async ({ data }) => {
    return relayService().getIdentity(data.user_id);
  });

export const syncE2eeRelayPrekeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z.object({
      device_id: z.number().int().positive(),
      identity_type: z.string().default("aci"),
      keys: z.array(
        z.object({
          type: z.string(),
          keyId: z.number().int().nonnegative(),
          publicKey: z.string().min(1),
          signature: z.string().optional(),
        })
      ),
    }).parse(data)
  )
  .handler(async ({ data, context }) => {
    await relayService().syncPrekeys(context.userId, data.device_id, data.keys);
  });

export const getE2eeRelayPreKeyBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      device_id: z.number().int().positive(),
    }).parse(data)
  )
  .handler(async ({ data }) => {
    return relayService().getPreKeyBundle(data.user_id, data.device_id);
  });

export const sendE2eeEnvelope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z.object({
      target_user_id: z.string().uuid(),
      target_device_id: z.number().int().positive(),
      sender_device_id: z.number().int().positive(),
      ciphertext: z.string().min(1),
      message_type: z.number().int(),
      timestamp: z.number().int(),
      client_message_id: z.string().optional(),
      urgent: z.boolean().optional(),
      ephemeral: z.boolean().optional(),
    }).parse(data)
  )
  .handler(async ({ data, context }) => {
    return relayService().sendEnvelope(context.userId, data);
  });

export const getPendingE2eeEnvelopes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ protocol_device_id: z.number().int().positive() }).parse(data)
  )
  .handler(async ({ data, context }) => {
    return relayService().getPendingEnvelopes(context.userId, data.protocol_device_id);
  });

export const markE2eeEnvelopeDelivered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z.object({ envelope_id: z.string().uuid() }).parse(data)
  )
  .handler(async ({ data, context }) => {
    await relayService().markDelivered(data.envelope_id, context.userId);
  });

