import type { AppSupabase } from "@/lib/infra/supabase/app-client";
import { isUniqueViolation, mapInfraError } from "@/lib/infra/supabase/map-error";
import type { ChatProfile, FriendProfile, Profile } from "@/lib/domain/types";
import type { ProfilePatch, ProfileRepository } from "@/lib/repositories/ports";
import { ConflictError } from "@/lib/domain/errors";

export class SupabaseProfileRepository implements ProfileRepository {
  constructor(private readonly supabase: AppSupabase) {}

  async getById(id: string): Promise<Profile | null> {
    const { data, error } = await this.supabase.from("profiles").select("*").eq("id", id).maybeSingle();
    if (error) mapInfraError(error);
    return (data as Profile | null) ?? null;
  }

  async update(id: string, patch: ProfilePatch): Promise<Profile> {
    const { data, error } = await this.supabase
      .from("profiles")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      if (isUniqueViolation(error)) throw new ConflictError("Username is taken");
      mapInfraError(error);
    }
    return data as Profile;
  }

  async search(query: string, excludeId: string): Promise<FriendProfile[]> {
    const q = query.toLowerCase().replace(/[%_]/g, "\\$&");
    const { data, error } = await this.supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .neq("id", excludeId)
      .limit(20);
    if (error) mapInfraError(error);
    return (data ?? []) as FriendProfile[];
  }

  async getChatProfiles(ids: string[]): Promise<ChatProfile[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, last_seen")
      .in("id", ids);
    if (error) mapInfraError(error);
    return (data ?? []) as ChatProfile[];
  }

  async getCallPeer(id: string) {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .eq("id", id)
      .maybeSingle();
    if (error) mapInfraError(error);
    return data ?? null;
  }

  async checkUsernameAvailability(username: string): Promise<boolean> {
    const normalized = username.replace(/^@/, '').trim().toLowerCase();
    if (!normalized) return false;

    const { data, error } = await this.supabase
      .from("profiles")
      .select("id")
      .eq("username", normalized)
      .limit(1)
      .maybeSingle();
      
    if (error) mapInfraError(error);
    return data === null;
  }
}
