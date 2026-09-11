import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireNotFrozen } from "@/lib/infra/write-gate";
import type { AppSupabase } from "@/lib/infra/supabase/app-client";
import { createApp } from "@/lib/infra/create-app";

function app(context: { supabase: AppSupabase; userId: string }) {
  return createApp(context);
}

export const registerDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z
      .object({
        device_key: z.string().min(1).max(100),
        device_name: z.string().min(1).max(60),
        platform: z.string().min(1).max(20).default("web"),
        user_agent: z.string().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => app(context).devices.register(data));

export const listDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => app(context).devices.list());

export const revokeDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ device_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => app(context).devices.revoke(data.device_id));

export const validateDeviceSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ device_key: z.string().min(1).max(100) }).parse(data)
  )
  .handler(async ({ data, context }) => app(context).devices.validate(data.device_key));

export const deleteDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ device_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => app(context).devices.delete(data.device_id));

export const deleteDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z.object({ device_ids: z.array(z.string().uuid()).min(1).max(500) }).parse(data)
  )
  .handler(async ({ data, context }) => app(context).devices.deleteMany(data.device_ids));

export const clearRevokedDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .handler(async ({ context }) => app(context).devices.clearRevoked());
