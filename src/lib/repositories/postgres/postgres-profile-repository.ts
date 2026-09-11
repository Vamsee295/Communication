import type { CallPeer, ChatProfile, FriendProfile, Profile } from "@/lib/domain/types";
import type { ProfilePatch, ProfileRepository, UsernameAvailabilityResult } from "@/lib/repositories/ports";
import type { DbClient } from "@/lib/infra/postgres/client";
import { ConflictError, ValidationError } from "@/lib/domain/errors";
import { validateUsername, generateCandidateSuggestions } from "@/lib/username";

export class PostgresProfileRepository implements ProfileRepository {
  constructor(private readonly db: DbClient) {}

  /**
   * JIT profile provisioning helper: ensures a row in profiles exists for the verified Supabase Auth user.
   */
  async ensureProfileExists(id: string, displayName?: string | null): Promise<void> {
    await this.db`
      INSERT INTO public.profiles (id, display_name)
      VALUES (${id}, ${displayName ?? "User"})
      ON CONFLICT (id) DO NOTHING;
    `;
  }

  async getById(id: string): Promise<Profile | null> {
    const rows = await this.db<Profile[]>`
      SELECT id, username, display_name, avatar_url, bio,
             last_seen::text, created_at::text, updated_at::text
        FROM public.profiles
       WHERE id = ${id}
       LIMIT 1;
    `;
    return rows[0] ?? null;
  }

  async update(id: string, patch: ProfilePatch): Promise<Profile> {
    const sets: Record<string, unknown> = {};
    if (patch.username !== undefined) {
      const val = validateUsername(patch.username);
      if (!val.valid) {
        throw new ValidationError(val.error ?? "Invalid username");
      }
      sets.username = val.normalized;
    }
    if (patch.display_name !== undefined) sets.display_name = patch.display_name;
    if (patch.bio !== undefined) sets.bio = patch.bio;
    if (patch.avatar_url !== undefined) sets.avatar_url = patch.avatar_url;

    if (Object.keys(sets).length === 0) {
      const existing = await this.getById(id);
      if (!existing) throw new Error("Profile not found");
      return existing;
    }

    try {
      const rows = await this.db<Profile[]>`
        UPDATE public.profiles
           SET ${this.db(sets)}, updated_at = now()
         WHERE id = ${id}
     RETURNING id, username, display_name, avatar_url, bio,
               last_seen::text, created_at::text, updated_at::text;
      `;
      if (!rows[0]) throw new Error("Profile not found");
      return rows[0];
    } catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string };
      if (
        errorObj.code === "23505" ||
        (typeof errorObj.message === "string" &&
          (errorObj.message.toLowerCase().includes("unique") ||
            errorObj.message.toLowerCase().includes("username")))
      ) {
        throw new ConflictError("Username is no longer available. Please choose another username.");
      }
      throw err;
    }
  }

  async updateLastSeen(id: string, lastSeen?: string): Promise<void> {
    const timestamp = lastSeen ?? new Date().toISOString();
    await this.db`
      UPDATE public.profiles
         SET last_seen = GREATEST(COALESCE(last_seen, '1970-01-01'::timestamptz), ${timestamp}::timestamptz)
       WHERE id = ${id};
    `;
  }

  async search(query: string, excludeId: string): Promise<FriendProfile[]> {
    // Normalize query by removing leading @ and trimming
    const normalizedQuery = query.replace(/^@+/, "").trim();
    if (!normalizedQuery) return [];

    const needle = `%${normalizedQuery.toLowerCase()}%`;
    const rows = await this.db<FriendProfile[]>`
      SELECT id, username, display_name, avatar_url
        FROM public.profiles
       WHERE id <> ${excludeId}
         AND (LOWER(COALESCE(username, '')) LIKE ${needle} OR LOWER(COALESCE(display_name, '')) LIKE ${needle})
       LIMIT 20;
    `;
    return rows;
  }

  async getChatProfiles(ids: string[]): Promise<ChatProfile[]> {
    if (ids.length === 0) return [];
    const rows = await this.db<ChatProfile[]>`
      SELECT id, username, display_name, avatar_url, last_seen::text
        FROM public.profiles
       WHERE id = ANY(${ids});
    `;
    return rows;
  }

  async getCallPeer(id: string): Promise<CallPeer | null> {
    const rows = await this.db<CallPeer[]>`
      SELECT id, display_name, username, avatar_url
        FROM public.profiles
       WHERE id = ${id}
       LIMIT 1;
    `;
    return rows[0] ?? null;
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

    const rows = await this.db<Array<{ id: string }>>`
      SELECT id FROM public.profiles WHERE LOWER(username) = ${val.normalized} LIMIT 1;
    `;

    if (rows.length === 0) {
      return {
        available: true,
        isCurrent: false,
        username: val.normalized,
      };
    }

    // Taken: generate and verify suggestions against Neon database
    const candidates = generateCandidateSuggestions(val.normalized);
    let verifiedSuggestions: string[] = [];

    if (candidates.length > 0) {
      const takenRows = await this.db<Array<{ taken: string }>>`
        SELECT LOWER(username) as taken
          FROM public.profiles
         WHERE LOWER(username) = ANY(${candidates});
      `;
      const takenSet = new Set(takenRows.map((r) => r.taken));
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
