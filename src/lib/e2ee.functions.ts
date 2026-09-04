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
