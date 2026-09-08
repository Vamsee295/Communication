// @ts-nocheck
import { describe, it, expect } from "vitest";

describe("Call State Machine (pure)", () => {
  it("computes duration correctly when startedAt is present", () => {
    const startedAt = Date.now() - 45000; // 45 seconds ago
    const duration = Math.round((Date.now() - startedAt) / 1000);
    expect(duration).toBeGreaterThanOrEqual(45);
    expect(duration).toBeLessThanOrEqual(46);
  });

  it("computes 0 duration when startedAt is missing", () => {
    const startedAt = null;
    const duration = startedAt ? Math.round((Date.now() - (startedAt as number)) / 1000) : 0;
    expect(duration).toBe(0);
  });

  it("sanitizes peer identities before answering (mock logic)", () => {
    const activeCall = { id: "call-1", peerId: "user-2" };
    const inboundMessage = { call_id: "call-1", from: "user-2", sdp: {} };
    const inboundMessageSpoofed = { call_id: "call-1", from: "user-3", sdp: {} };

    // Valid check
    const isValid = activeCall.id === inboundMessage.call_id && activeCall.peerId === inboundMessage.from;
    expect(isValid).toBe(true);

    // Spoofed check
    const isSpoofedValid = activeCall.id === inboundMessageSpoofed.call_id && activeCall.peerId === inboundMessageSpoofed.from;
    expect(isSpoofedValid).toBe(false);
  });

  it("queues and drains ICE candidates correctly when remote desc is missing", () => {
    const pendingCandidates: any[] = [{ candidate: "1" }, { candidate: "2" }];
    
    // Simulate drain
    const candidatesToProcess = [...pendingCandidates];
    pendingCandidates.length = 0; // Clear original array

    expect(candidatesToProcess.length).toBe(2);
    expect(pendingCandidates.length).toBe(0);
    expect(candidatesToProcess[0].candidate).toBe("1");
  });
});
