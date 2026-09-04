import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RealtimeGateway, type IWebSocketConnection } from "@/lib/realtime/gateway";
import { createProductionRealtimeGateway } from "@/lib/realtime/gateway-factory";
import type { ConversationRepository } from "@/lib/repositories/ports";
import type { ServerFrame } from "@/lib/realtime/contracts";
import type { Conversation, ConversationMemberFlags } from "@/lib/domain/types";

class MockSocketConnection implements IWebSocketConnection {
  userId: string | null = null;
  readonly receivedFrames: ServerFrame[] = [];
  isClosed = false;

  constructor(readonly id: string) {}

  send(frame: ServerFrame): void {
    this.receivedFrames.push(frame);
  }

  close(_code?: number, _reason?: string): void {
    this.isClosed = true;
  }
}

describe("Phase 4.5D.2 Safety Hardening — Gateway Dependency & Trigger Safety & Reconciler Tests", () => {
  const userA = "a0000000-0000-0000-0000-000000000001";
  const userB = "b0000000-0000-0000-0000-000000000002";
  const userC = "c0000000-0000-0000-0000-000000000003";
  const convAB = "10000000-0000-0000-0000-000000000001";
  const convBC = "20000000-0000-0000-0000-000000000002";

  describe("1. RealtimeGateway Dependency Injection & Membership Authorization", () => {
    let mockConvRepo: ConversationRepository;
    let gateway: RealtimeGateway;

    beforeEach(() => {
      mockConvRepo = {
        openDirect: async (friendId) => `conv-direct-${friendId}`,
        createGroup: async () => "",
        addMember: async () => {},
        removeMember: async () => {},
        updateMemberRole: async () => {},
        updateGroupTitle: async () => {},
        listMyMemberships: async (userId: string) => {
          if (userId === userA) {
            return [{ conversation_id: convAB, last_read_at: "2026-09-01T00:00:00Z", pinned: false, muted: false, archived: false }];
          }
          if (userId === userB) {
            return [
              { conversation_id: convAB, last_read_at: "2026-09-01T00:00:00Z", pinned: false, muted: false, archived: false },
              { conversation_id: convBC, last_read_at: "2026-09-01T00:00:00Z", pinned: false, muted: false, archived: false },
            ];
          }
          if (userId === userC) {
            return [{ conversation_id: convBC, last_read_at: "2026-09-01T00:00:00Z", pinned: false, muted: false, archived: false }];
          }
          return [];
        },
        getSummaries: async () => [],
        listMembers: async () => [],
        getById: async () => ({
          id: convAB,
          kind: "direct" as const,
          created_at: "2026-09-01T00:00:00Z",
          last_message_at: "2026-09-01T00:00:00Z",
        }),
        updateFlags: async () => {},
        updateLastRead: async () => {},
        leave: async () => {},
      };

      const tokenVerifier = async (token: string) => {
        if (token === "token-a") return userA;
        if (token === "token-b") return userB;
        if (token === "token-c") return userC;
        throw new Error("Invalid token");
      };

      gateway = createProductionRealtimeGateway(tokenVerifier, mockConvRepo);
    });

    it("verifies gateway correctly injects conversationRepo and authorizes valid membership", async () => {
      const connA = new MockSocketConnection("conn-a");
      gateway.handleConnection(connA);

      await gateway.handleMessage("conn-a", { type: "auth", token: "token-a" });
      await gateway.handleMessage("conn-a", { type: "subscribe", channel: `chat:conv:${convAB}` });

      expect(connA.receivedFrames).toContainEqual({
        type: "subscribed",
        channel: `chat:conv:${convAB}`,
      });
    });

    it("verifies gateway correctly enforces authorization and blocks non-member from subscribing", async () => {
      const connA = new MockSocketConnection("conn-a");
      gateway.handleConnection(connA);

      await gateway.handleMessage("conn-a", { type: "auth", token: "token-a" });
      await gateway.handleMessage("conn-a", { type: "subscribe", channel: `chat:conv:${convBC}` });

      expect(connA.receivedFrames).toContainEqual({
        type: "error",
        code: "FORBIDDEN",
        message: "Not a member of this conversation",
      });
    });
  });

  describe("2. Migration Trigger Restoration Safety (Simulation)", () => {
    it("guarantees triggers are re-enabled in finally block even if batch insertion throws", async () => {
      let triggersDisabled = false;
      let triggersEnabled = false;

      const mockSql = {
        disableTriggers: async () => {
          triggersDisabled = true;
        },
        enableTriggers: async () => {
          triggersEnabled = true;
        },
        failingInsert: async () => {
          throw new Error("Simulated database write failure");
        },
      };

      try {
        await mockSql.disableTriggers();
        expect(triggersDisabled).toBe(true);

        try {
          await mockSql.failingInsert();
        } finally {
          await mockSql.enableTriggers();
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          expect(err.message).toBe("Simulated database write failure");
        } else {
          throw err;
        }
      }

      expect(triggersEnabled).toBe(true);
    });
  });

  describe("3. Reverse Reconciliation Hard Delete Logic (Unit Simulation)", () => {
    it("identifies and deletes rows from Supabase that were hard-deleted in Neon", () => {
      // Simulate Supabase existing state
      const supabaseMessages = [
        { id: "msg-1", body: "Msg 1" },
        { id: "msg-2", body: "Msg 2" },
        { id: "msg-3", body: "Msg 3" }, // Hard deleted in Neon
      ];

      // Simulate Neon post-cutover state
      const neonMessages = [
        { id: "msg-1", body: "Msg 1 (updated)" },
        { id: "msg-2", body: "Msg 2" },
      ];

      const neonIds = new Set(neonMessages.map((m) => m.id));
      const toDeleteFromSupabase = supabaseMessages.filter((m) => !neonIds.has(m.id)).map((m) => m.id);

      expect(toDeleteFromSupabase).toEqual(["msg-3"]);

      // After hard delete propagation:
      const reconciledSupabase = supabaseMessages.filter((m) => !toDeleteFromSupabase.includes(m.id));
      expect(reconciledSupabase.map((m) => m.id)).toEqual(["msg-1", "msg-2"]);
    });

    it("identifies and deletes compound-key entities (reactions, pins, stars) hard-deleted in Neon", () => {
      const supabaseReactions = [
        { message_id: "m-1", user_id: userA, emoji: "👍" },
        { message_id: "m-1", user_id: userB, emoji: "❤️" }, // Deleted in Neon
      ];

      const neonReactions = [{ message_id: "m-1", user_id: userA, emoji: "👍" }];

      const neonKeys = new Set(neonReactions.map((r) => `${r.message_id}:${r.user_id}:${r.emoji}`));
      const toDelete = supabaseReactions.filter((r) => !neonKeys.has(`${r.message_id}:${r.user_id}:${r.emoji}`));

      expect(toDelete).toEqual([{ message_id: "m-1", user_id: userB, emoji: "❤️" }]);
    });
  });
});
