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
  reply_to_id: string | null;
  forwarded_from_id: string | null;
};

export type ReactionRow = {
  message_id: string;
  user_id: string;
  emoji: string;
};

export type PinRow = {
  conversation_id: string;
  message_id: string;
  pinned_by: string;
  pinned_at: string;
};

export type StarRow = {
  user_id: string;
  message_id: string;
  starred_at: string;
};

export type ConversationSummary = {
  id: string;
  last_message_at: string;
  other: ChatProfile | null;
  last_message: Pick<MessageRow, "id" | "sender_id" | "body" | "created_at" | "deleted_at"> | null;
  unread: number;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
};


/* ============================ CONVERSATIONS ============================ */

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

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConversationSummary[]> => {
    const { supabase, userId } = context;

    const { data: myMemberships, error: mErr } = await supabase
      .from("conversation_members")
      .select("conversation_id, last_read_at, pinned, muted, archived")
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

    const lastReadByConv = new Map<string, string>();
    const flagsByConv = new Map<string, { pinned: boolean; muted: boolean; archived: boolean }>();
    for (const m of myMemberships ?? []) {
      lastReadByConv.set(m.conversation_id, m.last_read_at);
      flagsByConv.set(m.conversation_id, {
        pinned: m.pinned ?? false,
        muted: m.muted ?? false,
        archived: m.archived ?? false,
      });
    }

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
        pinned: flagsByConv.get(c.id)?.pinned ?? false,
        muted: flagsByConv.get(c.id)?.muted ?? false,
        archived: flagsByConv.get(c.id)?.archived ?? false,
      };
    });
    summaries.sort((a, b) => (a.last_message_at < b.last_message_at ? 1 : -1));
    return summaries;
  });

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

/* ============================ MESSAGES ============================ */

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
    const { supabase, userId } = context;
    let q = supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", data.conversation_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.before) q = q.lt("created_at", data.before);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r) => r.id);
    if (ids.length === 0) return [];
    const { data: hidden } = await supabase
      .from("message_hidden")
      .select("message_id")
      .eq("user_id", userId)
      .in("message_id", ids);
    const hiddenSet = new Set((hidden ?? []).map((h) => h.message_id));
    return (rows as MessageRow[]).filter((m) => !hiddenSet.has(m.id));
  });

/** Fetch specific messages by id (used to preview reply targets outside the window). */
export const getMessagesByIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(50) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<MessageRow[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.from("messages").select("*").in("id", data.ids);
    if (error) throw new Error(error.message);
    return (rows ?? []) as MessageRow[];
  });

export const hideMessageForMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ message_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("message_hidden")
      .insert({ message_id: data.message_id, user_id: userId });
    if (error && error.code !== "23505") throw new Error(error.message);
    return { ok: true };
  });

export const deleteMessageForEveryone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ message_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: msg, error: mErr } = await supabase
      .from("messages")
      .select("id, sender_id")
      .eq("id", data.message_id)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!msg) throw new Error("Message not found");
    if (msg.sender_id !== userId) throw new Error("Only the sender can delete for everyone");
    const { error } = await supabase.from("messages").delete().eq("id", data.message_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        body: z.string().trim().min(1).max(4000),
        client_id: z.string().max(64).optional(),
        reply_to_id: z.string().uuid().optional().nullable(),
        forwarded_from_id: z.string().uuid().optional().nullable(),
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
        reply_to_id: data.reply_to_id ?? null,
        forwarded_from_id: data.forwarded_from_id ?? null,
      })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
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

/** Edit a message body. Sender-only. Server records prior body in `message_edits` via trigger. */
export const editMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        message_id: z.string().uuid(),
        body: z.string().trim().min(1).max(4000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<MessageRow> => {
    const { supabase, userId } = context;
    const { data: existing, error: gErr } = await supabase
      .from("messages")
      .select("id, sender_id")
      .eq("id", data.message_id)
      .maybeSingle();
    if (gErr) throw new Error(gErr.message);
    if (!existing) throw new Error("Message not found");
    if (existing.sender_id !== userId) throw new Error("Only the sender can edit");
    const { data: row, error } = await supabase
      .from("messages")
      .update({ body: data.body })
      .eq("id", data.message_id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as MessageRow;
  });

/** Forward selected messages to selected conversations. Returns count sent. */
export const forwardMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        message_ids: z.array(z.string().uuid()).min(1).max(50),
        conversation_ids: z.array(z.string().uuid()).min(1).max(20),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: sources, error } = await supabase
      .from("messages")
      .select("id, body")
      .in("id", data.message_ids);
    if (error) throw new Error(error.message);
    const inserts: Array<{
      conversation_id: string;
      sender_id: string;
      body: string;
      forwarded_from_id: string;
    }> = [];
    for (const conv of data.conversation_ids) {
      for (const src of sources ?? []) {
        inserts.push({
          conversation_id: conv,
          sender_id: userId,
          body: src.body,
          forwarded_from_id: src.id,
        });
      }
    }
    if (inserts.length === 0) return { count: 0 };
    const { error: iErr } = await supabase.from("messages").insert(inserts);
    if (iErr) throw new Error(iErr.message);
    return { count: inserts.length };
  });

/** Full delivery/read info for one message (sender-only view). */
export const getMessageInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ message_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: msg } = await supabase
      .from("messages")
      .select("id, sender_id, created_at, body, edited_at")
      .eq("id", data.message_id)
      .maybeSingle();
    if (!msg) throw new Error("Not found");
    if (msg.sender_id !== userId) throw new Error("Forbidden");
    const { data: receipts } = await supabase
      .from("message_receipts")
      .select("user_id, delivered_at, read_at")
      .eq("message_id", data.message_id);
    const { data: edits } = await supabase
      .from("message_edits")
      .select("previous_body, edited_at")
      .eq("message_id", data.message_id)
      .order("edited_at", { ascending: false });
    return { message: msg, receipts: receipts ?? [], edits: edits ?? [] };
  });

/* ============================ SEARCH ============================ */

export const searchMessagesInConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        q: z.string().trim().min(1).max(100),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<MessageRow[]> => {
    const { supabase } = context;
    const needle = data.q.replace(/[%_\\]/g, "\\$&");
    const { data: rows, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", data.conversation_id)
      .ilike("body", `%${needle}%`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (rows ?? []) as MessageRow[];
  });

export type GlobalHit = {
  message: MessageRow;
  conversation_id: string;
  other: ChatProfile | null;
};

export const searchMessagesGlobal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ q: z.string().trim().min(1).max(100) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<GlobalHit[]> => {
    const { supabase, userId } = context;
    const { data: mems } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", userId);
    const convIds = (mems ?? []).map((m) => m.conversation_id);
    if (convIds.length === 0) return [];
    const needle = data.q.replace(/[%_\\]/g, "\\$&");
    const { data: rows } = await supabase
      .from("messages")
      .select("*")
      .in("conversation_id", convIds)
      .ilike("body", `%${needle}%`)
      .order("created_at", { ascending: false })
      .limit(50);

    const { data: allMembers } = await supabase
      .from("conversation_members")
      .select("conversation_id, user_id")
      .in("conversation_id", convIds);
    const otherIdByConv = new Map<string, string>();
    for (const m of allMembers ?? []) {
      if (m.user_id !== userId) otherIdByConv.set(m.conversation_id, m.user_id);
    }
    const otherIds = Array.from(new Set(otherIdByConv.values()));
    const profilesById = new Map<string, ChatProfile>();
    if (otherIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, last_seen")
        .in("id", otherIds);
      for (const p of profs ?? []) profilesById.set(p.id, p as ChatProfile);
    }
    return (rows ?? []).map((m) => {
      const oid = otherIdByConv.get(m.conversation_id);
      return {
        message: m as MessageRow,
        conversation_id: m.conversation_id,
        other: oid ? profilesById.get(oid) ?? null : null,
      };
    });
  });

/* ============================ REACTIONS ============================ */

/** Toggle: if my reaction with same emoji exists, remove it; else insert it. */
export const toggleReaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        message_id: z.string().uuid(),
        emoji: z.string().min(1).max(24),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("message_reactions")
      .select("emoji")
      .eq("message_id", data.message_id)
      .eq("user_id", userId)
      .eq("emoji", data.emoji)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from("message_reactions")
        .delete()
        .eq("message_id", data.message_id)
        .eq("user_id", userId)
        .eq("emoji", data.emoji);
      if (error) throw new Error(error.message);
      return { added: false };
    }
    const { error } = await supabase
      .from("message_reactions")
      .insert({ message_id: data.message_id, user_id: userId, emoji: data.emoji });
    if (error && error.code !== "23505") throw new Error(error.message);
    return { added: true };
  });

export const listReactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ conversation_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<ReactionRow[]> => {
    const { supabase } = context;
    const { data: msgs } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", data.conversation_id)
      .order("created_at", { ascending: false })
      .limit(500);
    const ids = (msgs ?? []).map((m) => m.id);
    if (ids.length === 0) return [];
    const { data: rows, error } = await supabase
      .from("message_reactions")
      .select("message_id, user_id, emoji")
      .in("message_id", ids);
    if (error) throw new Error(error.message);
    return (rows ?? []) as ReactionRow[];
  });

/* ============================ PINS ============================ */

export const listPins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ conversation_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: pins, error } = await supabase
      .from("pinned_messages")
      .select("conversation_id, message_id, pinned_by, pinned_at")
      .eq("conversation_id", data.conversation_id)
      .order("pinned_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (pins ?? []).map((p) => p.message_id);
    let messages: MessageRow[] = [];
    if (ids.length > 0) {
      const { data: msgs } = await supabase.from("messages").select("*").in("id", ids);
      messages = (msgs ?? []) as MessageRow[];
    }
    return { pins: (pins ?? []) as PinRow[], messages };
  });

export const pinMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        message_id: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("pinned_messages").insert({
      conversation_id: data.conversation_id,
      message_id: data.message_id,
      pinned_by: userId,
    });
    if (error) {
      if (error.code === "23505") return { ok: true };
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const unpinMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        message_id: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("pinned_messages")
      .delete()
      .eq("conversation_id", data.conversation_id)
      .eq("message_id", data.message_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================ STARS ============================ */

export const toggleStar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ message_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("starred_messages")
      .select("message_id")
      .eq("user_id", userId)
      .eq("message_id", data.message_id)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from("starred_messages")
        .delete()
        .eq("user_id", userId)
        .eq("message_id", data.message_id);
      if (error) throw new Error(error.message);
      return { starred: false };
    }
    const { error } = await supabase
      .from("starred_messages")
      .insert({ user_id: userId, message_id: data.message_id });
    if (error && error.code !== "23505") throw new Error(error.message);
    return { starred: true };
  });

export const listMyStarred = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: stars, error } = await supabase
      .from("starred_messages")
      .select("message_id, starred_at")
      .eq("user_id", userId)
      .order("starred_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const ids = (stars ?? []).map((s) => s.message_id);
    if (ids.length === 0) return [] as Array<{ message: MessageRow; other: ChatProfile | null }>;
    const { data: msgs } = await supabase.from("messages").select("*").in("id", ids);
    const messages = (msgs ?? []) as MessageRow[];
    const convIds = Array.from(new Set(messages.map((m) => m.conversation_id)));
    const { data: allMembers } = await supabase
      .from("conversation_members")
      .select("conversation_id, user_id")
      .in("conversation_id", convIds);
    const otherIdByConv = new Map<string, string>();
    for (const m of allMembers ?? []) {
      if (m.user_id !== userId) otherIdByConv.set(m.conversation_id, m.user_id);
    }
    const otherIds = Array.from(new Set(otherIdByConv.values()));
    const profilesById = new Map<string, ChatProfile>();
    if (otherIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, last_seen")
        .in("id", otherIds);
      for (const p of profs ?? []) profilesById.set(p.id, p as ChatProfile);
    }
    // Preserve star ordering
    const orderById = new Map(ids.map((id, i) => [id, i]));
    messages.sort((a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0));
    return messages.map((m) => ({
      message: m,
      other: (otherIdByConv.get(m.conversation_id) &&
        profilesById.get(otherIdByConv.get(m.conversation_id)!)) ||
        null,
    }));
  });

export const listMyStarIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ conversation_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: msgs } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", data.conversation_id)
      .order("created_at", { ascending: false })
      .limit(500);
    const ids = (msgs ?? []).map((m) => m.id);
    if (ids.length === 0) return [] as string[];
    const { data: rows } = await supabase
      .from("starred_messages")
      .select("message_id")
      .eq("user_id", userId)
      .in("message_id", ids);
    return (rows ?? []).map((r) => r.message_id);
  });

/* ============================ RECEIPTS ============================ */

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


/* ======================= CONVERSATION MANAGEMENT ======================= */

export const setConversationFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        pinned: z.boolean().optional(),
        muted: z.boolean().optional(),
        archived: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Record<string, boolean> = {};
    if (data.pinned !== undefined) patch['pinned'] = data.pinned;
    if (data.muted !== undefined) patch['muted'] = data.muted;
    if (data.archived !== undefined) patch['archived'] = data.archived;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabase
      .from("conversation_members")
      .update(patch)
      .eq("conversation_id", data.conversation_id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markConversationUnread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: last } = await supabase
      .from("messages")
      .select("created_at, sender_id")
      .eq("conversation_id", data.conversation_id)
      .neq("sender_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const stamp = last?.created_at
      ? new Date(new Date(last.created_at).getTime() - 1000).toISOString()
      : new Date(0).toISOString();
    const { error } = await supabase
      .from("conversation_members")
      .update({ last_read_at: stamp })
      .eq("conversation_id", data.conversation_id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const leaveConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("conversation_members")
      .delete()
      .eq("conversation_id", data.conversation_id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const blockContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("friendships")
      .update({ status: "blocked", responded_at: new Date().toISOString() })
      .or(
        `and(requester_id.eq.${userId},addressee_id.eq.${data.user_id}),and(requester_id.eq.${data.user_id},addressee_id.eq.${userId})`,
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listBlockedContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("friendships")
      .select("id, requester_id, addressee_id, status")
      .eq("status", "blocked")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    if (error) throw new Error(error.message);
    const others = (rows ?? []).map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id));
    if (others.length === 0) return [] as ChatProfile[];
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, last_seen")
      .in("id", others);
    return (profs ?? []) as ChatProfile[];
  });

export const unblockContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("status", "blocked")
      .or(
        `and(requester_id.eq.${userId},addressee_id.eq.${data.user_id}),and(requester_id.eq.${data.user_id},addressee_id.eq.${userId})`,
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
