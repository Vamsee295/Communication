import type { AppSupabase } from "@/lib/infra/supabase/app-client";
import { isUniqueViolation, mapInfraError } from "@/lib/infra/supabase/map-error";
import type { Message, MessageEdit } from "@/lib/domain/types";
import type { InsertMessage, MessageRepository } from "@/lib/repositories/ports";

export class SupabaseMessageRepository implements MessageRepository {
  constructor(private readonly supabase: AppSupabase) {}

  async list(conversationId: string, opts: { before?: string; limit: number }): Promise<Message[]> {
    let q = this.supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(opts.limit);
    if (opts.before) q = q.lt("created_at", opts.before);
    const { data, error } = await q;
    if (error) mapInfraError(error);
    return (data ?? []) as Message[];
  }

  async getByIds(ids: string[]): Promise<Message[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.supabase.from("messages").select("*").in("id", ids);
    if (error) mapInfraError(error);
    return (data ?? []) as Message[];
  }

  async getById(id: string): Promise<Message | null> {
    const { data, error } = await this.supabase.from("messages").select("*").eq("id", id).maybeSingle();
    if (error) mapInfraError(error);
    return (data as Message | null) ?? null;
  }

  async insert(row: InsertMessage): Promise<Message> {
    const { data, error } = await this.supabase.from("messages").insert(row).select().single();
    if (error) {
      if (isUniqueViolation(error)) {
        const existing =
          row.client_id != null
            ? await this.findByClientId(row.conversation_id, row.sender_id, row.client_id)
            : null;
        if (existing) return existing;
      }
      mapInfraError(error);
    }
    return data as Message;
  }

  async findByClientId(
    conversationId: string,
    senderId: string,
    clientId: string,
  ): Promise<Message | null> {
    const { data, error } = await this.supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .eq("sender_id", senderId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (error) mapInfraError(error);
    return (data as Message | null) ?? null;
  }

  async updateBody(id: string, body: string): Promise<Message> {
    const { data, error } = await this.supabase.from("messages").update({ body }).eq("id", id).select().single();
    if (error) mapInfraError(error);
    return data as Message;
  }

  async hardDelete(id: string): Promise<void> {
    const { error } = await this.supabase.from("messages").delete().eq("id", id);
    if (error) mapInfraError(error);
  }

  async hideForUser(userId: string, messageId: string): Promise<void> {
    const { error } = await this.supabase
      .from("message_hidden")
      .insert({ message_id: messageId, user_id: userId });
    if (error && !isUniqueViolation(error)) mapInfraError(error);
  }

  async listHiddenIds(userId: string, messageIds: string[]): Promise<string[]> {
    if (messageIds.length === 0) return [];
    const { data, error } = await this.supabase
      .from("message_hidden")
      .select("message_id")
      .eq("user_id", userId)
      .in("message_id", messageIds);
    if (error) mapInfraError(error);
    return (data ?? []).map((h) => h.message_id);
  }

  async searchInConversation(conversationId: string, needle: string): Promise<Message[]> {
    const { data, error } = await this.supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .ilike("body", `%${needle}%`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) mapInfraError(error);
    return (data ?? []) as Message[];
  }

  async searchInConversations(conversationIds: string[], needle: string): Promise<Message[]> {
    const { data, error } = await this.supabase
      .from("messages")
      .select("*")
      .in("conversation_id", conversationIds)
      .ilike("body", `%${needle}%`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) mapInfraError(error);
    return (data ?? []) as Message[];
  }

  async listRecentPreview(conversationIds: string[], limit: number): Promise<Message[]> {
    const { data, error } = await this.supabase
      .from("messages")
      .select("id, conversation_id, sender_id, body, created_at, deleted_at")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) mapInfraError(error);
    return (data ?? []) as Message[];
  }

  async lastFromOthers(
    conversationId: string,
    excludeUserId: string,
  ): Promise<{ created_at: string } | null> {
    const { data, error } = await this.supabase
      .from("messages")
      .select("created_at, sender_id")
      .eq("conversation_id", conversationId)
      .neq("sender_id", excludeUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) mapInfraError(error);
    return data ? { created_at: data.created_at } : null;
  }

  async countUnread(conversationId: string, userId: string, since: string): Promise<number> {
    const { count, error } = await this.supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .gt("created_at", since)
      .neq("sender_id", userId);
    if (error) mapInfraError(error);
    return count ?? 0;
  }

  async listIds(
    conversationId: string,
    opts: { limit: number; senderId?: string; createdAtLte?: string },
  ): Promise<string[]> {
    let q = this.supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(opts.limit);
    if (opts.senderId) q = q.eq("sender_id", opts.senderId);
    if (opts.createdAtLte) q = q.lte("created_at", opts.createdAtLte);
    const { data, error } = await q;
    if (error) mapInfraError(error);
    return (data ?? []).map((m) => m.id);
  }

  async listIdsCreatedAtLte(conversationId: string, createdAtLte: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .lte("created_at", createdAtLte);
    if (error) mapInfraError(error);
    return (data ?? []).map((m) => m.id);
  }

  async listEdits(messageId: string): Promise<MessageEdit[]> {
    const { data, error } = await this.supabase
      .from("message_edits")
      .select("previous_body, edited_at")
      .eq("message_id", messageId)
      .order("edited_at", { ascending: false });
    if (error) mapInfraError(error);
    return (data ?? []) as MessageEdit[];
  }

  async listReceipts(messageId: string) {
    const { data, error } = await this.supabase
      .from("message_receipts")
      .select("user_id, delivered_at, read_at")
      .eq("message_id", messageId);
    if (error) mapInfraError(error);
    return data ?? [];
  }

  async markReceiptsRead(userId: string, messageIds: string[], at: string): Promise<void> {
    if (messageIds.length === 0) return;
    const { error } = await this.supabase
      .from("message_receipts")
      .update({ read_at: at, delivered_at: at })
      .in("message_id", messageIds)
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) mapInfraError(error);
  }

  async listReceiptsForMessages(messageIds: string[]) {
    if (messageIds.length === 0) return [];
    const { data, error } = await this.supabase
      .from("message_receipts")
      .select("message_id, delivered_at, read_at")
      .in("message_id", messageIds);
    if (error) mapInfraError(error);
    return data ?? [];
  }

  async insertMany(rows: InsertMessage[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.supabase.from("messages").insert(rows);
    if (error) mapInfraError(error);
  }
}
