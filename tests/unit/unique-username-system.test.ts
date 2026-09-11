import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizeUsername,
  validateUsername,
  generateCandidateSuggestions,
  RESERVED_USERNAMES,
} from "@/lib/username";
import { ProfileService } from "@/lib/services/profile.service";
import type { ProfileRepository, ProfilePatch, UsernameAvailabilityResult } from "@/lib/repositories/ports";
import type { Profile, FriendProfile, ChatProfile, CallPeer } from "@/lib/domain/types";
import { ConflictError, ValidationError } from "@/lib/domain/errors";

describe("Ghostline Global Unique Username System", () => {
  describe("1. Username Normalization & Validation Rules", () => {
    it("normalizes username by stripping leading @ and trimming whitespace", () => {
      expect(normalizeUsername("@vamsee05")).toBe("vamsee05");
      expect(normalizeUsername("@@@VAMSEE")).toBe("vamsee");
      expect(normalizeUsername("  Vamsee_05  ")).toBe("vamsee_05");
    });

    it("accepts valid usernames conforming to 3-30 chars, letters, numbers, and single underscores", () => {
      expect(validateUsername("vamsee").valid).toBe(true);
      expect(validateUsername("vamsee05").valid).toBe(true);
      expect(validateUsername("vamsee_05").valid).toBe(true);
      expect(validateUsername("user123").valid).toBe(true);
      expect(validateUsername("cse_student").valid).toBe(true);
    });

    it("rejects too short (< 3 chars) or too long (> 30 chars) usernames", () => {
      expect(validateUsername("va").valid).toBe(false);
      expect(validateUsername("v").valid).toBe(false);
      expect(validateUsername("a".repeat(31)).valid).toBe(false);
      expect(validateUsername("a".repeat(30)).valid).toBe(true);
    });

    it("rejects leading or trailing underscores", () => {
      const leading = validateUsername("_vamsee");
      expect(leading.valid).toBe(false);
      expect(leading.error).toContain("cannot start with an underscore");

      const trailing = validateUsername("vamsee_");
      expect(trailing.valid).toBe(false);
      expect(trailing.error).toContain("cannot end with an underscore");
    });

    it("rejects consecutive underscores", () => {
      const consecutive = validateUsername("vamsee__05");
      expect(consecutive.valid).toBe(false);
      expect(consecutive.error).toContain("consecutive underscores");
    });

    it("rejects invalid characters (spaces, hyphens, exclamation, symbols)", () => {
      expect(validateUsername("vamsee 05").valid).toBe(false);
      expect(validateUsername("vamsee-05").valid).toBe(false);
      expect(validateUsername("vamsee!").valid).toBe(false);
      expect(validateUsername("vam.see").valid).toBe(false);
    });

    it("rejects reserved system usernames (admin, ghostline, support, security, etc.)", () => {
      for (const reserved of ["admin", "administrator", "ghostline", "support", "help", "security", "system", "official", "api"]) {
        const res = validateUsername(reserved);
        expect(res.valid).toBe(false);
        expect(res.reason).toBe("reserved");
      }
    });
  });

  describe("2. Smart Alternative Candidate Suggestions", () => {
    it("generates deterministic and valid candidate suggestions for taken usernames", () => {
      const candidates = generateCandidateSuggestions("vamsee");
      expect(candidates.length).toBeGreaterThan(0);
      for (const cand of candidates) {
        const val = validateUsername(cand);
        expect(val.valid).toBe(true);
        expect(cand).not.toBe("vamsee");
      }
    });
  });

  describe("3. ProfileService & Repository Availability Checks", () => {
    const userA = "11111111-1111-4111-8111-111111111111";
    const userB = "22222222-2222-4222-8222-222222222222";

    let mockProfilesDb: Map<string, Profile>;
    let mockRepo: ProfileRepository;

    beforeEach(() => {
      mockProfilesDb = new Map<string, Profile>([
        [
          userA,
          {
            id: userA,
            username: "vamsee05",
            display_name: "Vamsee Krishna",
            avatar_url: null,
            bio: "Ghostline engineer",
            last_seen: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        [
          userB,
          {
            id: userB,
            username: "alex_dev",
            display_name: "Alex",
            avatar_url: null,
            bio: null,
            last_seen: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      ]);

      mockRepo = {
        async getById(id: string): Promise<Profile | null> {
          return mockProfilesDb.get(id) ?? null;
        },
        async update(id: string, patch: ProfilePatch): Promise<Profile> {
          const profile = mockProfilesDb.get(id);
          if (!profile) throw new Error("Profile not found");

          if (patch.username !== undefined) {
            const val = validateUsername(patch.username);
            if (!val.valid) throw new ValidationError(val.error ?? "Invalid username");

            // Check case-insensitive uniqueness across other users
            for (const [otherId, p] of mockProfilesDb.entries()) {
              if (otherId !== id && p.username && p.username.toLowerCase() === val.normalized) {
                throw new ConflictError("Username is no longer available. Please choose another username.");
              }
            }
            profile.username = val.normalized;
          }

          if (patch.display_name !== undefined) profile.display_name = patch.display_name;
          if (patch.bio !== undefined) profile.bio = patch.bio;
          profile.updated_at = new Date().toISOString();
          mockProfilesDb.set(id, profile);
          return profile;
        },
        async updateLastSeen(id: string, lastSeen?: string): Promise<void> {
          const p = mockProfilesDb.get(id);
          if (p) p.last_seen = lastSeen ?? new Date().toISOString();
        },
        async search(query: string, excludeId: string): Promise<FriendProfile[]> {
          const norm = normalizeUsername(query);
          return Array.from(mockProfilesDb.values())
            .filter((p) => p.id !== excludeId && (p.username?.toLowerCase().includes(norm) || p.display_name?.toLowerCase().includes(norm)))
            .map((p) => ({ id: p.id, username: p.username, display_name: p.display_name, avatar_url: p.avatar_url }));
        },
        async getChatProfiles(ids: string[]): Promise<ChatProfile[]> {
          return ids.map((id) => mockProfilesDb.get(id)!).filter(Boolean);
        },
        async getCallPeer(id: string): Promise<CallPeer | null> {
          const p = mockProfilesDb.get(id);
          if (!p) return null;
          return { id: p.id, display_name: p.display_name, username: p.username, avatar_url: p.avatar_url };
        },
        async checkUsernameAvailability(username: string, currentUserId?: string): Promise<UsernameAvailabilityResult> {
          const val = validateUsername(username);
          if (!val.valid) {
            return { available: false, username: val.normalized, reason: val.reason === "reserved" ? "reserved" : "invalid", error: val.error };
          }

          if (currentUserId) {
            const current = mockProfilesDb.get(currentUserId);
            if (current?.username && current.username.toLowerCase() === val.normalized) {
              return { available: true, isCurrent: true, username: val.normalized };
            }
          }

          const isTaken = Array.from(mockProfilesDb.values()).some(
            (p) => p.username && p.username.toLowerCase() === val.normalized
          );

          if (!isTaken) {
            return { available: true, isCurrent: false, username: val.normalized };
          }

          const candidates = generateCandidateSuggestions(val.normalized);
          const takenSet = new Set(
            Array.from(mockProfilesDb.values())
              .map((p) => p.username?.toLowerCase())
              .filter(Boolean)
          );
          const verifiedSuggestions = candidates.filter((c) => !takenSet.has(c)).slice(0, 4);

          return {
            available: false,
            username: val.normalized,
            reason: "taken",
            error: "Username is already taken",
            suggestions: verifiedSuggestions,
          };
        },
      };
    });

    it("recognizes current user's username as isCurrent: true and available", async () => {
      const serviceA = new ProfileService(userA, mockRepo);
      const res = await serviceA.checkUsernameAvailability("vamsee05");
      expect(res.available).toBe(true);
      expect(res.isCurrent).toBe(true);
      expect(res.username).toBe("vamsee05");
    });

    it("flags an existing username taken by another user with verified suggestions", async () => {
      const serviceA = new ProfileService(userA, mockRepo);
      const res = await serviceA.checkUsernameAvailability("alex_dev");
      expect(res.available).toBe(false);
      expect(res.reason).toBe("taken");
      expect(res.suggestions).toBeDefined();
      expect(res.suggestions!.length).toBeGreaterThan(0);
    });

    it("flags available when an untaken username is entered", async () => {
      const serviceA = new ProfileService(userA, mockRepo);
      const res = await serviceA.checkUsernameAvailability("ghost_hacker");
      expect(res.available).toBe(true);
      expect(res.isCurrent).toBe(false);
      expect(res.username).toBe("ghost_hacker");
    });

    it("treats uppercase / mixed case as identical to canonical lowercase (case-insensitivity)", async () => {
      const serviceA = new ProfileService(userA, mockRepo);
      const res = await serviceA.checkUsernameAvailability("ALEX_DEV");
      expect(res.available).toBe(false);
      expect(res.reason).toBe("taken");
    });

    it("allows updating username to an available username", async () => {
      const serviceA = new ProfileService(userA, mockRepo);
      const updated = await serviceA.updateMe({ username: "vamsee_prime" });
      expect(updated.username).toBe("vamsee_prime");

      const me = await serviceA.getMe();
      expect(me?.username).toBe("vamsee_prime");
    });

    it("safely rejects updating to an already-taken username and raises ConflictError", async () => {
      const serviceA = new ProfileService(userA, mockRepo);
      await expect(serviceA.updateMe({ username: "alex_dev" })).rejects.toThrow(ConflictError);
    });

    it("protects against race conditions where another user claims the name prior to save", async () => {
      const serviceA = new ProfileService(userA, mockRepo);
      const serviceB = new ProfileService(userB, mockRepo);

      // User A checks "cool_tag" -> available
      const checkA = await serviceA.checkUsernameAvailability("cool_tag");
      expect(checkA.available).toBe(true);

      // User B claims "cool_tag" first
      await serviceB.updateMe({ username: "cool_tag" });

      // User A now tries to save "cool_tag" -> fails with ConflictError
      await expect(serviceA.updateMe({ username: "cool_tag" })).rejects.toThrow(ConflictError);
    });

    it("allows separate Display Name update without altering username", async () => {
      const serviceA = new ProfileService(userA, mockRepo);
      const updated = await serviceA.updateMe({ display_name: "Vamsee K." });
      expect(updated.display_name).toBe("Vamsee K.");
      expect(updated.username).toBe("vamsee05"); // preserved
    });
  });
});
