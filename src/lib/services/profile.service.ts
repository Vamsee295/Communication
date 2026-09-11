import { ValidationError } from "@/lib/domain/errors";
import type { FriendProfile, Profile } from "@/lib/domain/types";
import type { ProfilePatch, ProfileRepository, UsernameAvailabilityResult } from "@/lib/repositories/ports";
import { normalizeUsername, validateUsername } from "@/lib/username";

export class ProfileService {
  constructor(
    private readonly userId: string,
    private readonly profiles: ProfileRepository,
  ) {}

  getMe(): Promise<Profile | null> {
    return this.profiles.getById(this.userId);
  }

  async updateMe(patch: ProfilePatch): Promise<Profile> {
    const cleanedPatch: ProfilePatch = { ...patch };
    if (patch.username !== undefined) {
      const val = validateUsername(patch.username);
      if (!val.valid) {
        throw new ValidationError(val.error ?? "Invalid username");
      }
      cleanedPatch.username = val.normalized;
    }
    return this.profiles.update(this.userId, cleanedPatch);
  }

  searchUsers(query: string): Promise<FriendProfile[]> {
    if (!query.trim()) throw new ValidationError("Query is required");
    return this.profiles.search(query, this.userId);
  }

  checkUsernameAvailability(username: string): Promise<UsernameAvailabilityResult> {
    return this.profiles.checkUsernameAvailability(username, this.userId);
  }

  async heartbeatLastSeen(lastSeen?: string): Promise<{ ok: true }> {
    await this.profiles.updateLastSeen(this.userId, lastSeen);
    return { ok: true };
  }
}
