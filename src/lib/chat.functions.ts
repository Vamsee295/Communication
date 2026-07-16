import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ChatProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  last_seen: string | null;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  client_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export type ConversationSummary = {
  id: string;
  last_message_at: string;
  other: ChatProfile | null;
  last_message: Pick<MessageRow, "id" | "sender_id" | "body" | "created_at" | "deleted_at"> | null;
  unread: number;
};

/** Open (or reuse) a 1:1 conversation with an accepted friend. */
export const openDirectConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ friend_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: id, error } = await supabase.rpc("open_direct_conversation", {
      _friend: data.friend_id,
    });
    if (error) throw new Error(error.message);
    return { conversation_id: id as string };
  });

/** List my conversations with the other participant + last message + unread count. */
export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConversationSummary[]> => {
    const { supabase, userId } = context;

    const { data: myMemberships, error: mErr } = await supabase
      .from("conversation_members")
      .select("conversation_id, last_read_at")
      .eq("user_id", userId);
    if (mErr) throw new Error(mErr.message);
    const convIds = (myMemberships ?? []).map((m) => m.conversation_id);
    if (convIds.length === 0) return [];

    const [{ data: convs, error: cErr }, { data: allMembers, error: amErr }] = await Promise.all([
      supabase.from("conversations").select("id, last_message_at").in("id", convIds),
      supabase
        .from("conversation_members")
        .select("conversation_id, user_id")
        .in("conversation_id", convIds),
    ]);
    if (cErr) throw new Error(cErr.message);
    if (amErr) throw new Error(amErr.message);

    // Map: conv -> other user id
    const otherByConv = new Map<string, string>();
    for (const m of allMembers ?? []) {
      if (m.user_id !== userId) otherByConv.set(m.conversation_id, m.user_id);
    }

    const otherIds = Array.from(new Set(Array.from(otherByConv.values())));
    const profilesById = new Map<string, ChatProfile>();
    if (otherIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, last_seen")
        .in("id", otherIds);
      for (const p of profs ?? []) profilesById.set(p.id, p as ChatProfile);
    }

    // Last messages (one per conversation) — fetch recent then group
    const { data: recent } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_id, body, created_at, deleted_at")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false })
      .limit(convIds.length * 4);
    const lastByConv = new Map<string, MessageRow>();
    for (const m of recent ?? []) {
      if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m as MessageRow);
    }

    // Unread counts: messages after last_read_at, not sent by me
    const lastReadByConv = new Map<string, string>();
    for (const m of myMemberships ?? []) lastReadByConv.set(m.conversation_id, m.last_read_at);

    const unreadByConv = new Map<string, number>();
    await Promise.all(
      convIds.map(async (cid) => {
        const since = lastReadByConv.get(cid) ?? "1970-01-01";
        const { count } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", cid)
          .gt("created_at", since)
          .neq("sender_id", userId);
        unreadByConv.set(cid, count ?? 0);
      }),
    );

    const summaries: ConversationSummary[] = (convs ?? []).map((c) => {
      const otherId = otherByConv.get(c.id);
      return {
        id: c.id,
        last_message_at: c.last_message_at,
        other: otherId ? profilesById.get(otherId) ?? null : null,
        last_message: lastByConv.get(c.id) ?? null,
        unread: unreadByConv.get(c.id) ?? 0,
      };
    });
    summaries.sort((a, b) => (a.last_message_at < b.last_message_at ? 1 : -1));
    return summaries;
  });

/** Get one conversation's metadata (guarded by RLS). */
export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: conv, error } = await supabase
      .from("conversations")
      .select("id, kind, created_at, last_message_at")
      .eq("id", data.conversation_id)
      .single();
    if (error) throw new Error(error.message);

    const { data: members } = await supabase
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", data.conversation_id);
    const otherId = (members ?? []).map((m) => m.user_id).find((id) => id !== userId) ?? null;

    let other: ChatProfile | null = null;
    if (otherId) {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, last_seen")
        .eq("id", otherId)
        .maybeSingle();
      other = (p as ChatProfile | null) ?? null;
    }
    return { conversation: conv, other };
  });

/** Paginated messages, newest first. */
export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        before: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<MessageRow[]> => {
    const { supabase } = context;
    let q = supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", data.conversation_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.before) q = q.lt("created_at", data.before);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as MessageRow[];
  });

/** Send a message. `client_id` allows optimistic dedupe. */
export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        body: z.string().trim().min(1).max(4000),
        client_id: z.string().max(64).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<MessageRow> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: data.conversation_id,
        sender_id: userId,
        body: data.body,
        client_id: data.client_id ?? null,
      })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        // Duplicate client_id — fetch the existing row
        const { data: existing } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", data.conversation_id)
          .eq("sender_id", userId)
          .eq("client_id", data.client_id!)
          .maybeSingle();
        if (existing) return existing as MessageRow;
      }
      throw new Error(error.message);
    }
    return row as MessageRow;
  });

/** Mark my receipts read up to and including a given message. */
export const markRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        up_to_created_at: z.string().datetime(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();

    // Fetch receipts that belong to me for messages in this conversation up to the cutoff
    const { data: msgs } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", data.conversation_id)
      .lte("created_at", data.up_to_created_at);

    const ids = (msgs ?? []).map((m) => m.id);
    if (ids.length > 0) {
      await supabase
        .from("message_receipts")
        .update({ read_at: now, delivered_at: now })
        .in("message_id", ids)
        .eq("user_id", userId)
        .is("read_at", null);
    }

    await supabase
      .from("conversation_members")
      .update({ last_read_at: data.up_to_created_at })
      .eq("conversation_id", data.conversation_id)
      .eq("user_id", userId);

    return { ok: true };
  });

/** Read receipts for messages I sent in a conversation. */
export const listMyMessageReceipts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ conversation_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: mine } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", data.conversation_id)
      .eq("sender_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    const ids = (mine ?? []).map((m) => m.id);
    if (ids.length === 0) return [];
    const { data: rec } = await supabase
      .from("message_receipts")
      .select("message_id, delivered_at, read_at")
      .in("message_id", ids);
    return rec ?? [];
  });
