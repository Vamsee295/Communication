import { ValidationError } from "@/lib/domain/errors";
import type { FriendProfile, Friendship } from "@/lib/domain/types";
import type { FriendshipRepository, ProfileRepository } from "@/lib/repositories/ports";

export class FriendshipService {
  constructor(
    private readonly userId: string,
    private readonly friendships: FriendshipRepository,
    private readonly profiles: ProfileRepository,
  ) {}

  async list(): Promise<{ friendships: Friendship[]; profiles: Record<string, FriendProfile> }> {
    const friendships = await this.friendships.listForUser(this.userId);
    const otherIds = Array.from(
      new Set(friendships.map((r) => (r.requester_id === this.userId ? r.addressee_id : r.requester_id))),
    );
    if (otherIds.length === 0) return { friendships, profiles: {} };
    const rows = await this.profiles.getChatProfiles(otherIds);
    const map: Record<string, FriendProfile> = {};
    for (const p of rows) {
      map[p.id] = { id: p.id, username: p.username, display_name: p.display_name, avatar_url: p.avatar_url };
    }
    return { friendships, profiles: map };
  }

  async sendRequest(addresseeId: string): Promise<Friendship> {
    if (addresseeId === this.userId) throw new ValidationError("You can't friend yourself");

    const reverse = await this.friendships.findByPair(addresseeId, this.userId);
    if (reverse) {
      if (reverse.status === "accepted") return reverse;
      return this.friendships.updateStatus(reverse.id, "accepted", new Date().toISOString());
    }

    return this.friendships.insert({
      requester_id: this.userId,
      addressee_id: addresseeId,
      status: "pending",
    });
  }

  async respond(friendshipId: string, action: "accept" | "decline" | "block"): Promise<Friendship | { ok: true }> {
    if (action === "decline") {
      await this.friendships.deleteAsAddressee(friendshipId, this.userId);
      return { ok: true };
    }
    const status = action === "accept" ? "accepted" : "blocked";
    return this.friendships.updateStatus(friendshipId, status, new Date().toISOString());
  }

  async remove(friendshipId: string): Promise<{ ok: true }> {
    await this.friendships.deleteForParticipant(friendshipId, this.userId);
    return { ok: true };
  }
}
