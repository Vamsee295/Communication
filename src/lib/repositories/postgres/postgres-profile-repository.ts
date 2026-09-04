import type { CallPeer, ChatProfile, FriendProfile, Profile } from "@/lib/domain/types";
import type { ProfilePatch, ProfileRepository } from "@/lib/repositories/ports";
import type { DbClient } from "@/lib/infra/postgres/client";

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
    if (patch.username !== undefined) sets.username = patch.username;
    if (patch.display_name !== undefined) sets.display_name = patch.display_name;
    if (patch.bio !== undefined) sets.bio = patch.bio;
    if (patch.avatar_url !== undefined) sets.avatar_url = patch.avatar_url;

    if (Object.keys(sets).length === 0) {
      const existing = await this.getById(id);
      if (!existing) throw new Error("Profile not found");
      return existing;
    }

    const rows = await this.db<Profile[]>`
      UPDATE public.profiles
         SET ${this.db(sets)}, updated_at = now()
       WHERE id = ${id}
   RETURNING id, username, display_name, avatar_url, bio,
             last_seen::text, created_at::text, updated_at::text;
    `;
    if (!rows[0]) throw new Error("Profile not found");
    return rows[0];
  }

  async search(query: string, excludeId: string): Promise<FriendProfile[]> {
    const needle = `%${query.toLowerCase()}%`;
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
}
