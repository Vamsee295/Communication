import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireNotFrozen } from "@/lib/infra/write-gate";
import type { AppSupabase } from "@/lib/infra/supabase/app-client";
import { createApp } from "@/lib/infra/create-app";

function app(context: { supabase: AppSupabase; userId: string }) {
  return createApp(context);
}

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "At least 3 characters")
  .max(30, "Max 30 characters")
  .regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers, underscore only");

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z
      .object({
        username: usernameSchema.optional(),
        display_name: z.string().trim().min(1).max(60).optional(),
        bio: z.string().trim().max(280).optional(),
        avatar_url: z.string().url().max(500).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => app(context).profiles.updateMe(data));

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => app(context).profiles.getMe());

export const searchUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ query: z.string().trim().min(1).max(50) }).parse(data),
  )
  .handler(async ({ data, context }) => app(context).profiles.searchUsers(data.query));

export const checkUsernameAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ username: z.string().trim().min(1).max(50) }).parse(data),
  )
  .handler(async ({ data, context }) => app(context).profiles.checkUsernameAvailability(data.username));
