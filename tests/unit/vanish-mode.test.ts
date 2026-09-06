/**
 * Unit tests for Vanish Mode logic
 *
 * Tests the pure business-logic utilities — no React rendering, no Supabase calls.
 * Focus: payload validation (security), ID generation, message model shape.
 */

import { describe, it, expect } from "vitest";
import {
  isValidVanishMessagePayload,
  generateEphemeralId,
  VANISH_MAX_BODY_LENGTH,
} from "@/hooks/use-vanish-mode";

const CONV_ID = "conv-abc-123";
const SENDER_ID = "user-xyz-999";
const OTHER_ID = "user-other-111";

function makeValidPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: `vanish_${crypto.randomUUID()}`,
    conversation_id: CONV_ID,
    sender_id: OTHER_ID,
    sender_name: "Alice",
    body: "Hello in vanish mode!",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("generateEphemeralId", () => {
  it("generates IDs prefixed with 'vanish_'", () => {
    const id = generateEphemeralId();
    expect(id).toMatch(/^vanish_/);
  });

  it("generates unique IDs each call", () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateEphemeralId()));
    expect(ids.size).toBe(20);
  });
});

describe("isValidVanishMessagePayload", () => {
  describe("valid payloads", () => {
    it("accepts a well-formed payload from another user", () => {
      const p = makeValidPayload();
      expect(isValidVanishMessagePayload(p, CONV_ID, SENDER_ID)).toBe(true);
    });

    it("accepts the maximum allowed body length", () => {
      const p = makeValidPayload({ body: "x".repeat(VANISH_MAX_BODY_LENGTH) });
      expect(isValidVanishMessagePayload(p, CONV_ID, SENDER_ID)).toBe(true);
    });
  });

  describe("rejects invalid payloads", () => {
    it("rejects null", () => {
      expect(isValidVanishMessagePayload(null, CONV_ID, SENDER_ID)).toBe(false);
    });

    it("rejects a non-object primitive", () => {
      expect(isValidVanishMessagePayload(42, CONV_ID, SENDER_ID)).toBe(false);
    });

    it("rejects an ID that doesn't start with 'vanish_'", () => {
      const p = makeValidPayload({ id: crypto.randomUUID() }); // no prefix
      expect(isValidVanishMessagePayload(p, CONV_ID, SENDER_ID)).toBe(false);
    });

    it("rejects a message from a different conversation", () => {
      const p = makeValidPayload({ conversation_id: "conv-different-99" });
      expect(isValidVanishMessagePayload(p, CONV_ID, SENDER_ID)).toBe(false);
    });

    it("rejects a message that claims to come from the authenticated user (self-echo guard)", () => {
      const p = makeValidPayload({ sender_id: SENDER_ID });
      expect(isValidVanishMessagePayload(p, CONV_ID, SENDER_ID)).toBe(false);
    });

    it("rejects an empty body", () => {
      const p = makeValidPayload({ body: "" });
      expect(isValidVanishMessagePayload(p, CONV_ID, SENDER_ID)).toBe(false);
    });

    it("rejects a whitespace-only body", () => {
      const p = makeValidPayload({ body: "   " });
      expect(isValidVanishMessagePayload(p, CONV_ID, SENDER_ID)).toBe(false);
    });

    it("rejects a body exceeding VANISH_MAX_BODY_LENGTH", () => {
      const p = makeValidPayload({ body: "x".repeat(VANISH_MAX_BODY_LENGTH + 1) });
      expect(isValidVanishMessagePayload(p, CONV_ID, SENDER_ID)).toBe(false);
    });

    it("rejects a payload with a non-string sender_id", () => {
      const p = makeValidPayload({ sender_id: 12345 });
      expect(isValidVanishMessagePayload(p, CONV_ID, SENDER_ID)).toBe(false);
    });

    it("rejects a payload with a non-string sender_name", () => {
      const p = makeValidPayload({ sender_name: null });
      expect(isValidVanishMessagePayload(p, CONV_ID, SENDER_ID)).toBe(false);
    });

    it("rejects a payload with a non-string created_at", () => {
      const p = makeValidPayload({ created_at: Date.now() }); // number, not string
      expect(isValidVanishMessagePayload(p, CONV_ID, SENDER_ID)).toBe(false);
    });

    it("rejects a payload with a missing conversation_id", () => {
      const p = makeValidPayload({ conversation_id: undefined });
      expect(isValidVanishMessagePayload(p, CONV_ID, SENDER_ID)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("treats payload wrapped in { payload: ... } correctly when unwrapped by caller", () => {
      // The chat room component calls onRemoteVanishMessage(payload) which unwraps internally.
      // Here we just validate the raw inner payload is accepted.
      const inner = makeValidPayload();
      expect(isValidVanishMessagePayload(inner, CONV_ID, SENDER_ID)).toBe(true);
    });

    it("rejects when conversation_id is an empty string", () => {
      const p = makeValidPayload({ conversation_id: "" });
      expect(isValidVanishMessagePayload(p, CONV_ID, SENDER_ID)).toBe(false);
    });

    it("rejects when id is an empty string (even though not vanish_ prefix)", () => {
      const p = makeValidPayload({ id: "" });
      expect(isValidVanishMessagePayload(p, CONV_ID, SENDER_ID)).toBe(false);
    });
  });
});

describe("VANISH_MAX_BODY_LENGTH", () => {
  it("is a positive number", () => {
    expect(typeof VANISH_MAX_BODY_LENGTH).toBe("number");
    expect(VANISH_MAX_BODY_LENGTH).toBeGreaterThan(0);
  });

  it("is set to 2000", () => {
    expect(VANISH_MAX_BODY_LENGTH).toBe(2000);
  });
});
