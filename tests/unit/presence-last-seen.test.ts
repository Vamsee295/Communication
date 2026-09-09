import { describe, expect, it } from "vitest";
import { formatLastSeen, type UserPresenceData } from "@/components/presence-provider";
import { PostgresProfileRepository } from "@/lib/repositories/postgres/postgres-profile-repository";
import { ProfileService } from "@/lib/services/profile.service";

describe("formatLastSeen formatting helper", () => {
  it("returns 'Offline' for null or undefined or invalid date", () => {
    expect(formatLastSeen(null)).toBe("Offline");
    expect(formatLastSeen(undefined)).toBe("Offline");
    expect(formatLastSeen("invalid-date")).toBe("Offline");
  });

  it("returns 'Last seen just now' when timestamp is within the last 60 seconds", () => {
    const recent = new Date(Date.now() - 20 * 1000).toISOString();
    expect(formatLastSeen(recent)).toBe("Last seen just now");
  });

  it("returns 'Last seen today at ...' when timestamp is earlier today", () => {
    const now = new Date();
    // 2 hours ago today
    const earlierToday = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    // Ensure it's still same date string
    if (earlierToday.toDateString() === now.toDateString()) {
      const formatted = formatLastSeen(earlierToday.toISOString());
      expect(formatted).toMatch(/^Last seen today at /);
    }
  });

  it("returns 'Last seen yesterday at ...' for yesterday's timestamp", () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    yesterday.setHours(14, 30, 0, 0);

    const formatted = formatLastSeen(yesterday.toISOString());
    expect(formatted).toMatch(/^Last seen yesterday at /);
  });

  it("returns 'Last seen Mon DD at ...' for dates earlier this year", () => {
    const now = new Date();
    const earlierThisYear = new Date(now.getFullYear(), 0, 15, 10, 30, 0); // Jan 15
    if (now.getMonth() > 1) {
      const formatted = formatLastSeen(earlierThisYear.toISOString());
      expect(formatted).toMatch(/^Last seen (Jan 15|15 Jan) at /i);
    }
  });

  it("returns 'Last seen Mon DD, YYYY' for previous years", () => {
    const lastYear = new Date(2024, 8, 5, 16, 3, 0).toISOString();
    const formatted = formatLastSeen(lastYear);
    expect(formatted).toMatch(/Last seen (Sep|Sept) 5|5 (Sep|Sept).*2024/i);
  });
});

describe("PostgresProfileRepository.updateLastSeen & ProfileService", () => {
  function createSqlMock() {
    const store = {
      profiles: new Map<string, any>(),
    };

    const sql: any = async (strings: TemplateStringsArray, ...values: any[]) => {
      const query = strings.join("?");

      if (query.includes("UPDATE public.profiles") && query.includes("last_seen = GREATEST")) {
        const [timestamp, id] = values;
        const profile = store.profiles.get(id) ?? { id, last_seen: null };
        const currentTs = profile.last_seen ? new Date(profile.last_seen).getTime() : 0;
        const newTs = new Date(timestamp).getTime();
        if (newTs > currentTs) {
          profile.last_seen = new Date(newTs).toISOString();
        }
        store.profiles.set(id, profile);
        return [];
      }

      if (query.includes("SELECT") && query.includes("FROM public.profiles") && query.includes("WHERE id = ?")) {
        const id = values[0];
        const p = store.profiles.get(id);
        return p ? [p] : [];
      }

      return [];
    };

    return { sql, store };
  }

  it("updates last_seen timestamp in database", async () => {
    const { sql, store } = createSqlMock();
    const repo = new PostgresProfileRepository(sql);
    const service = new ProfileService("user-123", repo);

    const ts1 = "2026-09-09T14:00:00.000Z";
    await service.heartbeatLastSeen(ts1);

    const profile = store.profiles.get("user-123");
    expect(profile.last_seen).toBe(ts1);
  });

  it("ensures monotonic updates so older devices cannot rewind last_seen", async () => {
    const { sql, store } = createSqlMock();
    const repo = new PostgresProfileRepository(sql);

    // Device A reports 14:05:00
    await repo.updateLastSeen("user-123", "2026-09-09T14:05:00.000Z");
    expect(store.profiles.get("user-123").last_seen).toBe("2026-09-09T14:05:00.000Z");

    // Lagging Device B reports 14:02:00
    await repo.updateLastSeen("user-123", "2026-09-09T14:02:00.000Z");
    // Value remains 14:05:00
    expect(store.profiles.get("user-123").last_seen).toBe("2026-09-09T14:05:00.000Z");

    // Newer Device A reports 14:06:00
    await repo.updateLastSeen("user-123", "2026-09-09T14:06:00.000Z");
    expect(store.profiles.get("user-123").last_seen).toBe("2026-09-09T14:06:00.000Z");
  });
});

describe("Presence and Status Rules", () => {
  function computeStatusLabel({
    userId,
    convId,
    lastSeenAt,
    presences,
    now = Date.now(),
  }: {
    userId: string | null | undefined;
    convId: string | null | undefined;
    lastSeenAt: string | null | undefined;
    presences: Map<string, UserPresenceData[]>;
    now?: number;
  }) {
    if (!userId) return "Offline";
    const userPresences = presences.get(userId) ?? [];
    const isOnline = userPresences.some((p) => now - p.heartbeat_at < 45000);

    if (isOnline) {
      const isActiveInChat = userPresences.some(
        (p) => now - p.heartbeat_at < 45000 && p.active_conversation_id === convId
      );
      if (convId && isActiveInChat) return "Active now";
      return "Online";
    }

    if (lastSeenAt) {
      return formatLastSeen(lastSeenAt);
    }
    return "Offline";
  }

  it("TEST 1: User opens app -> Online", () => {
    const presences = new Map<string, UserPresenceData[]>();
    presences.set("user-1", [
      { user_id: "user-1", active_conversation_id: null, heartbeat_at: Date.now(), tab_id: "tab-1" },
    ]);

    const status = computeStatusLabel({
      userId: "user-1",
      convId: "conv-abc",
      lastSeenAt: "2026-09-09T10:00:00Z",
      presences,
    });
    expect(status).toBe("Online");
  });

  it("TEST 2: User opens specific chat -> Active now", () => {
    const presences = new Map<string, UserPresenceData[]>();
    presences.set("user-1", [
      { user_id: "user-1", active_conversation_id: "conv-abc", heartbeat_at: Date.now(), tab_id: "tab-1" },
    ]);

    const status = computeStatusLabel({
      userId: "user-1",
      convId: "conv-abc",
      lastSeenAt: "2026-09-09T10:00:00Z",
      presences,
    });
    expect(status).toBe("Active now");
  });

  it("TEST 3: User leaves chat but remains in app -> Online", () => {
    const presences = new Map<string, UserPresenceData[]>();
    presences.set("user-1", [
      { user_id: "user-1", active_conversation_id: null, heartbeat_at: Date.now(), tab_id: "tab-1" },
    ]);

    const status = computeStatusLabel({
      userId: "user-1",
      convId: "conv-abc",
      lastSeenAt: "2026-09-09T10:00:00Z",
      presences,
    });
    expect(status).toBe("Online");
  });

  it("TEST 4: Multi-device: Phone disconnects but Laptop remains online -> Still Online", () => {
    const now = Date.now();
    const presences = new Map<string, UserPresenceData[]>();
    presences.set("user-1", [
      // Phone is stale (disconnected 60s ago)
      { user_id: "user-1", active_conversation_id: null, heartbeat_at: now - 60000, tab_id: "phone" },
      // Laptop is fresh (heartbeat 5s ago)
      { user_id: "user-1", active_conversation_id: null, heartbeat_at: now - 5000, tab_id: "laptop" },
    ]);

    const status = computeStatusLabel({
      userId: "user-1",
      convId: "conv-abc",
      lastSeenAt: "2026-09-09T10:00:00Z",
      presences,
      now,
    });
    expect(status).toBe("Online");
  });

  it("TEST 5: All devices disconnect -> shows Last Seen with DB timestamp", () => {
    const now = Date.now();
    const presences = new Map<string, UserPresenceData[]>();
    presences.set("user-1", [
      // Both stale (> 45s ago)
      { user_id: "user-1", active_conversation_id: null, heartbeat_at: now - 50000, tab_id: "phone" },
      { user_id: "user-1", active_conversation_id: null, heartbeat_at: now - 55000, tab_id: "laptop" },
    ]);

    const lastSeen = new Date(now - 120000).toISOString(); // 2 minutes ago
    const status = computeStatusLabel({
      userId: "user-1",
      convId: "conv-abc",
      lastSeenAt: lastSeen,
      presences,
      now,
    });
    expect(status).toMatch(/Last seen/);
  });
});
