import { describe, it, expect, beforeEach } from "vitest";
import { CallService } from "@/lib/services/call.service";
import type { CallRepository, ProfileRepository } from "@/lib/repositories/ports";
import type { Call } from "@/lib/domain/types";

describe("Call Log Cleanup & Multi-Selection Backend", () => {
  const userA = "11111111-1111-4111-8111-111111111111";
  const userB = "22222222-2222-4222-8222-222222222222";
  const userC = "33333333-3333-4333-8333-333333333333";

  let callsTable: Call[] = [];
  let mockCallsRepo: CallRepository;
  let mockProfilesRepo: ProfileRepository;

  beforeEach(() => {
    callsTable = [
      {
        id: "call-1",
        conversation_id: "conv-1",
        caller_id: userA,
        callee_id: userB,
        call_type: "voice",
        status: "ended",
        started_at: new Date(Date.now() - 3600000).toISOString(),
        ended_at: new Date(Date.now() - 3500000).toISOString(),
        duration_seconds: 100,
        created_at: new Date(Date.now() - 3600000).toISOString(),
        updated_at: new Date(Date.now() - 3500000).toISOString(),
      },
      {
        id: "call-2",
        conversation_id: "conv-1",
        caller_id: userB,
        callee_id: userA,
        call_type: "video",
        status: "missed",
        created_at: new Date(Date.now() - 1800000).toISOString(),
        updated_at: new Date(Date.now() - 1800000).toISOString(),
      },
      {
        id: "call-3",
        conversation_id: "conv-2",
        caller_id: userA,
        callee_id: userC,
        call_type: "voice",
        status: "ended",
        started_at: new Date(Date.now() - 900000).toISOString(),
        ended_at: new Date(Date.now() - 800000).toISOString(),
        duration_seconds: 100,
        created_at: new Date(Date.now() - 900000).toISOString(),
        updated_at: new Date(Date.now() - 800000).toISOString(),
      },
      // Call between user B and user C (user A is not a party)
      {
        id: "call-4",
        conversation_id: "conv-3",
        caller_id: userB,
        callee_id: userC,
        call_type: "voice",
        status: "ended",
        created_at: new Date(Date.now() - 500000).toISOString(),
        updated_at: new Date(Date.now() - 500000).toISOString(),
      },
    ];

    mockCallsRepo = {
      insert: async (row) => {
        const c: Call = {
          id: `call-${Date.now()}`,
          conversation_id: row.conversation_id,
          caller_id: row.caller_id,
          callee_id: row.callee_id,
          call_type: row.call_type,
          status: row.status,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        callsTable.push(c);
        return c;
      },
      getById: async (id) => callsTable.find((c) => c.id === id) ?? null,
      updateStatus: async (id, patch) => {
        const c = callsTable.find((call) => call.id === id);
        if (c) {
          c.status = patch.status;
          if (patch.duration_seconds !== undefined) c.duration_seconds = patch.duration_seconds;
          c.updated_at = new Date().toISOString();
        }
      },
      listForUser: async (userId, limit = 50) => {
        return callsTable
          .filter((c) => c.caller_id === userId || c.callee_id === userId)
          .slice(0, limit);
      },
      deleteFromHistory: async (callId, userId) => {
        callsTable = callsTable.filter(
          (c) => !(c.id === callId && (c.caller_id === userId || c.callee_id === userId))
        );
      },
      deleteManyFromHistory: async (callIds, userId) => {
        const initialLength = callsTable.length;
        const set = new Set(callIds);
        callsTable = callsTable.filter(
          (c) => !(set.has(c.id) && (c.caller_id === userId || c.callee_id === userId))
        );
        return initialLength - callsTable.length;
      },
      clearHistory: async (userId) => {
        const initialLength = callsTable.length;
        callsTable = callsTable.filter(
          (c) => !(c.caller_id === userId || c.callee_id === userId)
        );
        return initialLength - callsTable.length;
      },
    };
    mockProfilesRepo = {
      getChatProfiles: async (userIds: string[]) =>
        userIds.map((id) => ({
          id,
          username: `user_${id.slice(0, 4)}`,
          display_name: `User ${id.slice(0, 4)}`,
          avatar_url: null,
          last_seen: null,
        })),
    } as any;
  });

  describe("Single Call Deletion", () => {
    it("allows a participant to delete a call from history", async () => {
      const service = new CallService(userA, mockCallsRepo, mockProfilesRepo);
      const res = await service.deleteFromHistory("call-1");
      expect(res.ok).toBe(true);

      const list = await service.listHistory();
      expect(list.find((c) => c.id === "call-1")).toBeUndefined();
    });

    it("prevents a non-participant from deleting a call", async () => {
      const serviceA = new CallService(userA, mockCallsRepo, mockProfilesRepo);
      await serviceA.deleteFromHistory("call-4"); // userA is neither caller nor callee

      const serviceB = new CallService(userB, mockCallsRepo, mockProfilesRepo);
      const listB = await serviceB.listHistory();
      expect(listB.find((c) => c.id === "call-4")).toBeDefined();
    });
  });

  describe("Bulk Call Deletion", () => {
    it("allows deleting multiple selected calls in one request", async () => {
      const service = new CallService(userA, mockCallsRepo, mockProfilesRepo);
      const res = await service.deleteManyFromHistory(["call-1", "call-2"]);
      expect(res.ok).toBe(true);
      expect(res.count).toBe(2);

      const list = await service.listHistory();
      expect(list.find((c) => c.id === "call-1")).toBeUndefined();
      expect(list.find((c) => c.id === "call-2")).toBeUndefined();
      expect(list.find((c) => c.id === "call-3")).toBeDefined();
    });

    it("ignores calls the user is not a party to during bulk deletion", async () => {
      const serviceA = new CallService(userA, mockCallsRepo, mockProfilesRepo);
      const res = await serviceA.deleteManyFromHistory(["call-3", "call-4"]);
      expect(res.ok).toBe(true);
      expect(res.count).toBe(1); // only call-3 was deleted

      const serviceB = new CallService(userB, mockCallsRepo, mockProfilesRepo);
      const listB = await serviceB.listHistory();
      expect(listB.find((c) => c.id === "call-4")).toBeDefined();
    });
  });

  describe("Clear All Call History", () => {
    it("clears all calls for current user while preserving unrelated calls", async () => {
      const serviceA = new CallService(userA, mockCallsRepo, mockProfilesRepo);
      const res = await serviceA.clearHistory();
      expect(res.ok).toBe(true);
      expect(res.count).toBe(3); // call-1, call-2, call-3

      const listA = await serviceA.listHistory();
      expect(listA.length).toBe(0);

      const serviceB = new CallService(userB, mockCallsRepo, mockProfilesRepo);
      const listB = await serviceB.listHistory();
      expect(listB.find((c) => c.id === "call-4")).toBeDefined();
    });
  });
});
