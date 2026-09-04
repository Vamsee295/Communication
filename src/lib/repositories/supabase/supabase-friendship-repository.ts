import type { AppSupabase } from "@/lib/infra/supabase/app-client";
import { isUniqueViolation, mapInfraError } from "@/lib/infra/supabase/map-error";
import { ConflictError } from "@/lib/domain/errors";
import type { Friendship } from "@/lib/domain/types";
import type { FriendshipRepository } from "@/lib/repositories/ports";

export class SupabaseFriendshipRepository implements FriendshipRepository {
  constructor(private readonly supabase: AppSupabase) {}

  async listForUser(userId: string): Promise<Friendship[]> {
    const { data, error } = await this.supabase
      .from("friendships")
      .select("*")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .order("created_at", { ascending: false });
    if (error) mapInfraError(error);
    return (data ?? []) as Friendship[];
  }

  async findByPair(requesterId: string, addresseeId: string): Promise<Friendship | null> {
    const { data, error } = await this.supabase
      .from("friendships")
      .select("*")
      .eq("requester_id", requesterId)
      .eq("addressee_id", addresseeId)
      .maybeSingle();
    if (error) mapInfraError(error);
    return (data as Friendship | null) ?? null;
  }

  async insert(row: {
    requester_id: string;
    addressee_id: string;
    status: "pending";
  }): Promise<Friendship> {
    const { data, error } = await this.supabase.from("friendships").insert(row).select().single();
    if (error) {
      if (isUniqueViolation(error)) throw new ConflictError("Request already exists");
      mapInfraError(error);
    }
    return data as Friendship;
  }

  async updateStatus(
    id: string,
    status: "accepted" | "blocked",
    respondedAt: string,
  ): Promise<Friendship> {
    const { data, error } = await this.supabase
      .from("friendships")
      .update({ status, responded_at: respondedAt })
      .eq("id", id)
      .select()
      .single();
    if (error) mapInfraError(error);
    return data as Friendship;
  }

  async deleteAsAddressee(id: string, addresseeId: string): Promise<void> {
    const { error } = await this.supabase
      .from("friendships")
      .delete()
      .eq("id", id)
      .eq("addressee_id", addresseeId);
    if (error) mapInfraError(error);
  }

  async deleteForParticipant(id: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from("friendships")
      .delete()
      .eq("id", id)
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    if (error) mapInfraError(error);
  }

  async setBlockedBetween(userId: string, otherId: string, respondedAt: string): Promise<void> {
    const { error } = await this.supabase
      .from("friendships")
      .update({ status: "blocked", responded_at: respondedAt })
      .or(
        `and(requester_id.eq.${userId},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${userId})`,
      );
    if (error) mapInfraError(error);
  }

  async unblockBetween(userId: string, otherId: string, respondedAt: string): Promise<void> {
    const { error } = await this.supabase
      .from("friendships")
      .update({ status: "accepted", responded_at: respondedAt })
      .eq("status", "blocked")
      .or(
        `and(requester_id.eq.${userId},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${userId})`,
      );
    if (error) mapInfraError(error);
  }

  async listBlockedForUser(userId: string): Promise<Friendship[]> {
    const { data, error } = await this.supabase
      .from("friendships")
      .select("*")
      .eq("status", "blocked")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    if (error) mapInfraError(error);
    return (data ?? []) as Friendship[];
  }
}
