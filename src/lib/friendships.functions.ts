import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireNotFrozen } from "@/lib/infra/write-gate";
import type { AppSupabase } from "@/lib/infra/supabase/app-client";
import { createApp } from "@/lib/infra/create-app";
import type { Friendship, FriendProfile } from "@/lib/domain/types";

export type { FriendProfile };
export type FriendshipRow = Friendship;

function app(context: { supabase: AppSupabase; userId: string }) {
  return createApp(context);
}

export const listFriendships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => app(context).friendships.list());

export const sendFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z.object({ addressee_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => app(context).friendships.sendRequest(data.addressee_id));

export const respondToFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z
      .object({
        friendship_id: z.string().uuid(),
        action: z.enum(["accept", "decline", "block"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    app(context).friendships.respond(data.friendship_id, data.action),
  );

export const removeFriendship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ friendship_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => app(context).friendships.remove(data.friendship_id));
