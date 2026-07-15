import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FriendProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};
export type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "blocked";
  created_at: string;
  responded_at: string | null;
};

export const listFriendships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ friendships: FriendshipRow[]; profiles: Record<string, FriendProfile> }> => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("friendships")
      .select("*")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const friendships = (rows ?? []) as FriendshipRow[];
    const otherIds = Array.from(
      new Set(friendships.map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id))),
    );
    if (otherIds.length === 0) return { friendships, profiles: {} };

    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", otherIds);
    if (pErr) throw new Error(pErr.message);

    const map: Record<string, FriendProfile> = {};
    for (const p of profiles ?? []) map[p.id] = p as FriendProfile;
    return { friendships, profiles: map };
  });

export const sendFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ addressee_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.addressee_id === userId) throw new Error("You can't friend yourself");

    // Check reverse pending — if the other user already invited us, auto-accept
    const { data: reverse } = await supabase
      .from("friendships")
      .select("*")
      .eq("requester_id", data.addressee_id)
      .eq("addressee_id", userId)
      .maybeSingle();
    if (reverse) {
      if (reverse.status === "accepted") return reverse;
      const { data: updated, error } = await supabase
        .from("friendships")
        .update({ status: "accepted", responded_at: new Date().toISOString() })
        .eq("id", reverse.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return updated;
    }

    const { data: row, error } = await supabase
      .from("friendships")
      .insert({ requester_id: userId, addressee_id: data.addressee_id, status: "pending" })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Request already exists");
      throw new Error(error.message);
    }
    return row;
  });

export const respondToFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        friendship_id: z.string().uuid(),
        action: z.enum(["accept", "decline", "block"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.action === "decline") {
      const { error } = await supabase
        .from("friendships")
        .delete()
        .eq("id", data.friendship_id)
        .eq("addressee_id", userId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const status = data.action === "accept" ? "accepted" : "blocked";
    const { data: row, error } = await supabase
      .from("friendships")
      .update({ status, responded_at: new Date().toISOString() })
      .eq("id", data.friendship_id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const removeFriendship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ friendship_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("friendships").delete().eq("id", data.friendship_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
