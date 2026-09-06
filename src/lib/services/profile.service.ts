import { ValidationError } from "@/lib/domain/errors";
import type { FriendProfile, Profile } from "@/lib/domain/types";
import type { ProfilePatch, ProfileRepository } from "@/lib/repositories/ports";

export class ProfileService {
  constructor(
    private readonly userId: string,
    private readonly profiles: ProfileRepository,
  ) {}

  getMe(): Promise<Profile | null> {
    return this.profiles.getById(this.userId);
  }

  updateMe(patch: ProfilePatch): Promise<Profile> {
    return this.profiles.update(this.userId, patch);
  }

  searchUsers(query: string): Promise<FriendProfile[]> {
    if (!query.trim()) throw new ValidationError("Query is required");
    return this.profiles.search(query, this.userId);
  }

  checkUsernameAvailability(username: string): Promise<boolean> {
    return this.profiles.checkUsernameAvailability(username);
  }
}
