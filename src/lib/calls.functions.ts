import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireNotFrozen } from "@/lib/infra/write-gate";
import type { AppSupabase } from "@/lib/infra/supabase/app-client";
import { createApp } from "@/lib/infra/create-app";
import type { Call, CallHistoryItem, CallPeer, CallStatus, CallType } from "@/lib/domain/types";

export type { CallType, CallStatus, CallPeer, CallHistoryItem };
export type CallRow = Call;

function app(context: { supabase: AppSupabase; userId: string }) {
  return createApp(context);
}

export const createCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        callee_id: z.string().uuid(),
        call_type: z.enum(["voice", "video"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<CallRow> => app(context).calls.create(data));

export const getCall = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ call_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => app(context).calls.get(data.call_id));

export const updateCallStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z
      .object({
        call_id: z.string().uuid(),
        status: z.enum(["ringing", "accepted", "declined", "missed", "ended", "failed"]),
        duration_seconds: z.number().int().min(0).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    app(context).calls.updateStatus(data.call_id, data.status, data.duration_seconds),
  );

export const listCalls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CallHistoryItem[]> => app(context).calls.listHistory());

export const deleteCallFromHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) => z.object({ call_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => app(context).calls.deleteFromHistory(data.call_id));

export const deleteCallsFromHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .inputValidator((data: unknown) =>
    z.object({ call_ids: z.array(z.string().uuid()).min(1).max(500) }).parse(data)
  )
  .handler(async ({ data, context }) => app(context).calls.deleteManyFromHistory(data.call_ids));

export const clearCallHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireNotFrozen])
  .handler(async ({ context }) => app(context).calls.clearHistory());
