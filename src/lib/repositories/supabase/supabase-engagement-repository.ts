import type { AppSupabase } from "@/lib/infra/supabase/app-client";
import { isUniqueViolation, mapInfraError } from "@/lib/infra/supabase/map-error";
import type { Pin, Reaction, Star } from "@/lib/domain/types";
import type { PinRepository, ReactionRepository, StarRepository } from "@/lib/repositories/ports";

export class SupabaseReactionRepository implements ReactionRepository {
  constructor(private readonly supabase: AppSupabase) {}

  async findMine(userId: string, messageId: string, emoji: string): Promise<Reaction | null> {
    const { data, error } = await this.supabase
      .from("message_reactions")
      .select("message_id, user_id, emoji")
      .eq("message_id", messageId)
      .eq("user_id", userId)
      .eq("emoji", emoji)
      .maybeSingle();
    if (error) mapInfraError(error);
    return (data as Reaction | null) ?? null;
  }

  async insert(row: { message_id: string; user_id: string; emoji: string }): Promise<void> {
    const { error } = await this.supabase.from("message_reactions").insert(row);
    if (error && !isUniqueViolation(error)) mapInfraError(error);
  }

  async deleteMine(userId: string, messageId: string, emoji: string): Promise<void> {
    const { error } = await this.supabase
      .from("message_reactions")
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", userId)
      .eq("emoji", emoji);
    if (error) mapInfraError(error);
  }

  async listForMessageIds(messageIds: string[]): Promise<Reaction[]> {
    if (messageIds.length === 0) return [];
    const { data, error } = await this.supabase
      .from("message_reactions")
      .select("message_id, user_id, emoji")
      .in("message_id", messageIds);
    if (error) mapInfraError(error);
    return (data ?? []) as Reaction[];
  }
}

export class SupabasePinRepository implements PinRepository {
  constructor(private readonly supabase: AppSupabase) {}

  async list(conversationId: string): Promise<Pin[]> {
    const { data, error } = await this.supabase
      .from("pinned_messages")
      .select("conversation_id, message_id, pinned_by, pinned_at")
      .eq("conversation_id", conversationId)
      .order("pinned_at", { ascending: false });
    if (error) mapInfraError(error);
    return (data ?? []) as Pin[];
  }

  async insert(row: { conversation_id: string; message_id: string; pinned_by: string }): Promise<void> {
    const { error } = await this.supabase.from("pinned_messages").insert(row);
    if (error && !isUniqueViolation(error)) mapInfraError(error);
  }

  async delete(conversationId: string, messageId: string): Promise<void> {
    const { error } = await this.supabase
      .from("pinned_messages")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("message_id", messageId);
    if (error) mapInfraError(error);
  }
}

export class SupabaseStarRepository implements StarRepository {
  constructor(private readonly supabase: AppSupabase) {}

  async findMine(userId: string, messageId: string): Promise<Star | null> {
    const { data, error } = await this.supabase
      .from("starred_messages")
      .select("user_id, message_id, starred_at")
      .eq("user_id", userId)
      .eq("message_id", messageId)
      .maybeSingle();
    if (error) mapInfraError(error);
    return (data as Star | null) ?? null;
  }

  async insert(userId: string, messageId: string): Promise<void> {
    const { error } = await this.supabase
      .from("starred_messages")
      .insert({ user_id: userId, message_id: messageId });
    if (error && !isUniqueViolation(error)) mapInfraError(error);
  }

  async deleteMine(userId: string, messageId: string): Promise<void> {
    const { error } = await this.supabase
      .from("starred_messages")
      .delete()
      .eq("user_id", userId)
      .eq("message_id", messageId);
    if (error) mapInfraError(error);
  }

  async listMine(userId: string, limit: number) {
    const { data, error } = await this.supabase
      .from("starred_messages")
      .select("message_id, starred_at")
      .eq("user_id", userId)
      .order("starred_at", { ascending: false })
      .limit(limit);
    if (error) mapInfraError(error);
    return data ?? [];
  }

  async listMineIn(userId: string, messageIds: string[]): Promise<string[]> {
    if (messageIds.length === 0) return [];
    const { data, error } = await this.supabase
      .from("starred_messages")
      .select("message_id")
      .eq("user_id", userId)
      .in("message_id", messageIds);
    if (error) mapInfraError(error);
    return (data ?? []).map((r) => r.message_id);
  }
}
