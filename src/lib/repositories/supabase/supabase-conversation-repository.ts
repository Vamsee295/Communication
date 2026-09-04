import type { AppSupabase } from "@/lib/infra/supabase/app-client";
import { mapInfraError } from "@/lib/infra/supabase/map-error";
import type { Conversation, ConversationMemberFlags } from "@/lib/domain/types";
import type { ConversationRepository, MemberRow } from "@/lib/repositories/ports";

export class SupabaseConversationRepository implements ConversationRepository {
  constructor(private readonly supabase: AppSupabase) {}

  async openDirect(friendId: string): Promise<string> {
    const { data: id, error } = await this.supabase.rpc("open_direct_conversation", {
      _friend: friendId,
    });
    if (error) mapInfraError(error);
    return id as string;
  }

  async createGroup(): Promise<string> {
    throw new Error("Supabase driver does not support group creation");
  }

  async addMember(): Promise<void> {
    throw new Error("Supabase driver does not support group member addition");
  }

  async removeMember(): Promise<void> {
    throw new Error("Supabase driver does not support group member removal");
  }

  async updateMemberRole(): Promise<void> {
    throw new Error("Supabase driver does not support group role updates");
  }

  async updateGroupTitle(): Promise<void> {
    throw new Error("Supabase driver does not support group title updates");
  }

  async listMyMemberships(userId: string): Promise<ConversationMemberFlags[]> {
    const { data, error } = await this.supabase
      .from("conversation_members")
      .select("conversation_id, last_read_at, pinned, muted, archived")
      .eq("user_id", userId);
    if (error) mapInfraError(error);
    return (data ?? []) as ConversationMemberFlags[];
  }

  async getSummaries(ids: string[]): Promise<Array<Conversation>> {
    const { data, error } = await this.supabase
      .from("conversations")
      .select("id, kind, last_message_at")
      .in("id", ids);
    if (error) mapInfraError(error);
    return (data ?? []) as Conversation[];
  }

  async listMembers(conversationIds: string[]): Promise<MemberRow[]> {
    const { data, error } = await this.supabase
      .from("conversation_members")
      .select("conversation_id, user_id")
      .in("conversation_id", conversationIds);
    if (error) mapInfraError(error);
    return (data ?? []) as MemberRow[];
  }

  async getById(conversationId: string): Promise<Conversation> {
    const { data, error } = await this.supabase
      .from("conversations")
      .select("id, kind, created_at, last_message_at")
      .eq("id", conversationId)
      .single();
    if (error) mapInfraError(error);
    return data as Conversation;
  }

  async updateFlags(
    userId: string,
    conversationId: string,
    patch: { pinned?: boolean; muted?: boolean; archived?: boolean },
  ): Promise<void> {
    const { error } = await this.supabase
      .from("conversation_members")
      .update(patch)
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);
    if (error) mapInfraError(error);
  }

  async updateLastRead(userId: string, conversationId: string, lastReadAt: string): Promise<void> {
    const { error } = await this.supabase
      .from("conversation_members")
      .update({ last_read_at: lastReadAt })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);
    if (error) mapInfraError(error);
  }

  async leave(userId: string, conversationId: string): Promise<void> {
    const { error } = await this.supabase
      .from("conversation_members")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);
    if (error) mapInfraError(error);
  }
}
