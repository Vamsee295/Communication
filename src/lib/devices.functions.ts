import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const registerDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("devices")
      .upsert(
        {
          user_id: userId,
          device_key: data.device_key,
          device_name: data.device_name,
          platform: data.platform,
          user_agent: data.user_agent,
          last_seen_at: new Date().toISOString(),
          revoked_at: null,
        },
        { onConflict: "user_id,device_key" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("devices")
      .select("*")
      .eq("user_id", userId)
      .order("last_seen_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const revokeDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ device_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("devices")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.device_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
