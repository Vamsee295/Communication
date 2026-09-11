import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireNotFrozen } from "@/lib/infra/write-gate";
import type { AppSupabase } from "@/lib/infra/supabase/app-client";
import { createApp } from "@/lib/infra/create-app";
import { normalizeUsername, validateUsername } from "@/lib/username";
import type { UsernameAvailabilityResult } from "@/lib/repositories/ports";

function app(context: { supabase: AppSupabase; userId: string }) {
  return createApp(context);
}

const usernameSchema = z
  .string()
  .transform((val) => normalizeUsername(val))
  .refine(
    (val) => {
      const res = validateUsername(val);
      return res.valid;
    },
    (val) => {
      const res = validateUsername(val);
      return { message: res.error ?? "Invalid username" };
    }
  );

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
    z.object({ username: z.string().trim().max(60) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<UsernameAvailabilityResult> =>
    app(context).profiles.checkUsernameAvailability(data.username)
  );

export const heartbeatLastSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        lastSeen: z.string().datetime().optional(),
      })
      .optional()
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    app(context).profiles.heartbeatLastSeen(data?.lastSeen),
  );
