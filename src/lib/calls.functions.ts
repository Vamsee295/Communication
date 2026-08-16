import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CallType = "voice" | "video";
export type CallStatus = "ringing" | "accepted" | "declined" | "missed" | "ended" | "failed";

export type CallRow = {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  call_type: CallType;
  status: CallStatus;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number;
  created_at: string;
};

export type CallPeer = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type CallHistoryItem = CallRow & {
  direction: "incoming" | "outgoing";
  peer: CallPeer | null;
};

export const createCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        callee_id: z.string().uuid(),
        call_type: z.enum(["voice", "video"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<CallRow> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("calls")
      .insert({
        conversation_id: data.conversation_id,
        caller_id: userId,
        callee_id: data.callee_id,
        call_type: data.call_type,
        status: "ringing",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as CallRow;
  });

export const getCall = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ call_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ call: CallRow; peer: CallPeer | null } | null> => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("calls")
      .select("*")
      .eq("id", data.call_id)
      .maybeSingle();
    if (!row) return null;
    const peerId = row.caller_id === userId ? row.callee_id : row.caller_id;
    const { data: peer } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .eq("id", peerId)
      .maybeSingle();
    return { call: row as CallRow, peer: (peer as CallPeer) ?? null };
  });

export const updateCallStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        call_id: z.string().uuid(),
        status: z.enum(["ringing", "accepted", "declined", "missed", "ended", "failed"]),
        duration_seconds: z.number().int().min(0).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const now = new Date().toISOString();
    const patch = {
      status: data.status,
      ...(data.status === "accepted" ? { started_at: now } : {}),
      ...(["ended", "declined", "missed", "failed"].includes(data.status)
        ? { ended_at: now, ...(data.duration_seconds !== undefined ? { duration_seconds: data.duration_seconds } : {}) }
        : {}),
    };
    const { error } = await supabase.from("calls").update(patch).eq("id", data.call_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCalls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CallHistoryItem[]> => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("calls")
      .select("*")
      .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const peerIds = Array.from(
      new Set((rows ?? []).map((r) => (r.caller_id === userId ? r.callee_id : r.caller_id))),
    );
    const peers = new Map<string, CallPeer>();
    if (peerIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", peerIds);
      for (const p of profs ?? []) peers.set(p.id, p as CallPeer);
    }

    return (rows ?? []).map((r) => {
      const peerId = r.caller_id === userId ? r.callee_id : r.caller_id;
      return {
        ...(r as CallRow),
        direction: r.caller_id === userId ? "outgoing" : "incoming",
        peer: peers.get(peerId) ?? null,
      };
    });
  });
