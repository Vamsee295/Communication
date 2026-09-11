import type { AppSupabase } from "@/lib/infra/supabase/app-client";
import { isUniqueViolation, mapInfraError } from "@/lib/infra/supabase/map-error";
import type { ChatProfile, FriendProfile, Profile } from "@/lib/domain/types";
import type { ProfilePatch, ProfileRepository, UsernameAvailabilityResult } from "@/lib/repositories/ports";
import { ConflictError, ValidationError } from "@/lib/domain/errors";
import { validateUsername, generateCandidateSuggestions } from "@/lib/username";

export class SupabaseProfileRepository implements ProfileRepository {
  constructor(private readonly supabase: AppSupabase) {}

  async getById(id: string): Promise<Profile | null> {
    const { data, error } = await this.supabase.from("profiles").select("*").eq("id", id).maybeSingle();
    if (error) mapInfraError(error);
    return (data as Profile | null) ?? null;
  }

  async update(id: string, patch: ProfilePatch): Promise<Profile> {
    const payload: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
    if (patch.username !== undefined) {
      const val = validateUsername(patch.username);
      if (!val.valid) throw new ValidationError(val.error ?? "Invalid username");
      payload.username = val.normalized;
    }

    const { data, error } = await this.supabase
      .from("profiles")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("Username is no longer available. Please choose another username.");
      }
      mapInfraError(error);
    }
    return data as Profile;
  }

  async updateLastSeen(id: string, lastSeen?: string): Promise<void> {
    const timestamp = lastSeen ?? new Date().toISOString();
    const { error } = await this.supabase
      .from("profiles")
      .update({ last_seen: timestamp })
      .eq("id", id);
    if (error) mapInfraError(error);
  }

  async search(query: string, excludeId: string): Promise<FriendProfile[]> {
    const normalizedQuery = query.replace(/^@+/, "").trim();
    if (!normalizedQuery) return [];

    const q = normalizedQuery.toLowerCase().replace(/[%_]/g, "\\$&");
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

  async checkUsernameAvailability(username: string, currentUserId?: string): Promise<UsernameAvailabilityResult> {
    const val = validateUsername(username);
    if (!val.valid) {
      return {
        available: false,
        username: val.normalized,
        reason: val.reason === "reserved" ? "reserved" : "invalid",
        error: val.error,
      };
    }

    if (currentUserId) {
      const currentProfile = await this.getById(currentUserId);
      if (currentProfile?.username && currentProfile.username.toLowerCase() === val.normalized) {
        return {
          available: true,
          isCurrent: true,
          username: val.normalized,
        };
      }
    }

    const { data, error } = await this.supabase
      .from("profiles")
      .select("id")
      .ilike("username", val.normalized)
      .limit(1)
      .maybeSingle();
      
    if (error) mapInfraError(error);
    
    if (!data) {
      return {
        available: true,
        isCurrent: false,
        username: val.normalized,
      };
    }

    const candidates = generateCandidateSuggestions(val.normalized);
    let verifiedSuggestions: string[] = [];

    if (candidates.length > 0) {
      const { data: takenData } = await this.supabase
        .from("profiles")
        .select("username")
        .in("username", candidates);
      const takenSet = new Set((takenData ?? []).map((r: { username: string }) => r.username.toLowerCase()));
      verifiedSuggestions = candidates.filter((c) => !takenSet.has(c.toLowerCase())).slice(0, 4);
    }

    return {
      available: false,
      username: val.normalized,
      reason: "taken",
      error: "Username is already taken",
      suggestions: verifiedSuggestions,
    };
  }
}
