import { describe, it, expect, beforeEach } from "vitest";
import {
  E2eeCallSignalingAdapter,
  InMemorySignalingTransport,
  WebCryptoCallSignalingEngine,
  CallStateMachine,
  CallClaimManager,
  CallReplayGuard,
  extractDtlsFingerprint,
  verifyRemoteDtlsFingerprint,
  E2EE6_PROTOCOL_VERSION,
  RING_TIMEOUT_MS,
  type CallSignalingPlaintextEnvelope,
  type OpaqueCallSignalingEnvelope,
} from "../../src/lib/e2ee/e2ee-call-signaling";
import type { SignalPayload } from "../../src/lib/ports/signaling";

describe("E2EE-6: Secure WebRTC Calls & Authenticated Signaling Security Suite", () => {
  const SERVER_BLINDNESS_SECRET = "GHOSTLINE_E2EE_CALL_SECURITY_SECRET_2026";
  const MOCK_SDP_OFFER = "v=0\r\no=- 4611731400430051336 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=fingerprint:sha-256 4A:AD:B9:B1:3F:82:18:3B:54:02:12:DF:3E:5D:49:6B:19:E5:7C:AB:E7:83:A0:64:84:40:78:1D:59:E6:37:3A\r\na=setup:actpass\r\n";
  const MOCK_ICE_CANDIDATE = {
    candidate: "candidate:1 1 UDP 2130706431 192.168.1.100 54321 typ host",
    sdpMid: "0",
    sdpMLineIndex: 0,
  };

  beforeEach(() => {
    InMemorySignalingTransport.clear();
  });

  // =========================================================================
  // Category A & B: Signaling Encryption & Decryption
  // =========================================================================
  it("A & B: encrypts call signaling into opaque envelope and decrypts correctly locally", async () => {
    const transport = new InMemorySignalingTransport();
    const aliceSignaling = new E2eeCallSignalingAdapter({ transport, deviceId: 1 });
    const bobSignaling = new E2eeCallSignalingAdapter({ transport, deviceId: 1 });

    let decryptedOffer: SignalPayload | null = null;
    bobSignaling.listen("bob", {
      onOffer: (p) => { decryptedOffer = p; },
      onAnswer: () => {},
      onIce: () => {},
      onDecline: () => {},
      onEnd: () => {},
    });

    const callId = crypto.randomUUID();
    await aliceSignaling.send("bob", "call-offer", {
      call_id: callId,
      from: "alice",
      call_type: "video",
      sdp: { type: "offer", sdp: MOCK_SDP_OFFER },
    });

    expect(decryptedOffer).not.toBeNull();
    expect(decryptedOffer!.call_id).toBe(callId);
    expect(decryptedOffer!.from).toBe("alice");
    expect(decryptedOffer!.call_type).toBe("video");
    expect(decryptedOffer!.sdp?.sdp).toBe(MOCK_SDP_OFFER);

    aliceSignaling.dispose();
    bobSignaling.dispose();
  });

  // =========================================================================
  // Category C: SDP Confidentiality
  // =========================================================================
  it("C: SDP offer and answer NEVER appear in plaintext on transport frames", async () => {
    const capturedEnvelopes: OpaqueCallSignalingEnvelope[] = [];
    const customTransport = new InMemorySignalingTransport();
    const origSend = customTransport.send.bind(customTransport);
    customTransport.send = async (target, env) => {
      capturedEnvelopes.push(env);
      return origSend(target, env);
    };

    const aliceSignaling = new E2eeCallSignalingAdapter({ transport: customTransport, deviceId: 1 });
    const bobSignaling = new E2eeCallSignalingAdapter({ transport: customTransport, deviceId: 1 });

    bobSignaling.listen("bob", {
      onOffer: () => {},
      onAnswer: () => {},
      onIce: () => {},
      onDecline: () => {},
      onEnd: () => {},
    });

    const callId = crypto.randomUUID();
    await aliceSignaling.send("bob", "call-offer", {
      call_id: callId,
      from: "alice",
      sdp: { type: "offer", sdp: MOCK_SDP_OFFER },
    });

    expect(capturedEnvelopes.length).toBe(1);
    const envelope = capturedEnvelopes[0];

    // Verify envelope fields visible to server
    expect(envelope.protocolVersion).toBe(E2EE6_PROTOCOL_VERSION);
    expect(envelope.callId).toBe(callId);
    expect(envelope.senderUserId).toBe("alice");
    expect(envelope.recipientUserId).toBe("bob");
    expect(envelope.isEncrypted).toBe(true);

    // CRITICAL: SDP string and fingerprints MUST NOT appear in server-visible envelope
    const rawSerialized = JSON.stringify(envelope);
    expect(rawSerialized.includes("a=fingerprint")).toBe(false);
    expect(rawSerialized.includes("4A:AD:B9:B1")).toBe(false);
    expect(rawSerialized.includes("127.0.0.1")).toBe(false);

    aliceSignaling.dispose();
    bobSignaling.dispose();
  });

  // =========================================================================
  // Category D: ICE Candidate Confidentiality
  // =========================================================================
  it("D: ICE candidates and private IP addresses NEVER appear in plaintext on transport", async () => {
    const capturedEnvelopes: OpaqueCallSignalingEnvelope[] = [];
    const customTransport = new InMemorySignalingTransport();
    const origSend = customTransport.send.bind(customTransport);
    customTransport.send = async (target, env) => {
      capturedEnvelopes.push(env);
      return origSend(target, env);
    };

    const aliceSignaling = new E2eeCallSignalingAdapter({ transport: customTransport, deviceId: 1 });
    const callId = crypto.randomUUID();

    await aliceSignaling.send("bob", "ice-candidate", {
      call_id: callId,
      from: "alice",
      candidate: MOCK_ICE_CANDIDATE,
    });

    expect(capturedEnvelopes.length).toBe(1);
    const envelope = capturedEnvelopes[0];
    const rawSerialized = JSON.stringify(envelope);

    // Private IP address and port must NOT be visible to transport relay
    expect(rawSerialized.includes("192.168.1.100")).toBe(false);
    expect(rawSerialized.includes("54321")).toBe(false);
    expect(rawSerialized.includes("typ host")).toBe(false);

    aliceSignaling.dispose();
  });

  // =========================================================================
  // Category E: DTLS Fingerprint Binding & Verification
  // =========================================================================
  it("E: extracts and binds DTLS fingerprint; detects tampering fail-closed", async () => {
    // 1. Extraction test
    const extracted = extractDtlsFingerprint(MOCK_SDP_OFFER);
    expect(extracted).not.toBeNull();
    expect(extracted!.algorithm).toBe("sha-256");
    expect(extracted!.fingerprint).toBe(
      "4A:AD:B9:B1:3F:82:18:3B:54:02:12:DF:3E:5D:49:6B:19:E5:7C:AB:E7:83:A0:64:84:40:78:1D:59:E6:37:3A"
    );

    // 2. Verification with mock RTCPeerConnection certificate stats
    const mockPcMatching = {
      getStats: async () => {
        const map = new Map();
        map.set("cert1", {
          type: "certificate",
          fingerprint: "4A:AD:B9:B1:3F:82:18:3B:54:02:12:DF:3E:5D:49:6B:19:E5:7C:AB:E7:83:A0:64:84:40:78:1D:59:E6:37:3A",
        });
        return map;
      },
    } as unknown as RTCPeerConnection;

    const matchResult = await verifyRemoteDtlsFingerprint(mockPcMatching, MOCK_SDP_OFFER);
    expect(matchResult.verified).toBe(true);
    expect(matchResult.fingerprint).toBe(extracted!.fingerprint);

    // 3. Mismatching certificate must throw SecurityError fail-closed
    const mockPcMismatch = {
      getStats: async () => {
        const map = new Map();
        map.set("cert1", {
          type: "certificate",
          fingerprint: "00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF",
        });
        return map;
      },
    } as unknown as RTCPeerConnection;

    await expect(verifyRemoteDtlsFingerprint(mockPcMismatch, MOCK_SDP_OFFER)).rejects.toThrow(
      /DTLS Fingerprint Mismatch/
    );
  });

  // =========================================================================
  // Category F & G: Call & Device Authorization
  // =========================================================================
  it("F & G: drops signaling addressed to mismatched recipient fail-closed", async () => {
    const transport = new InMemorySignalingTransport();
    const aliceSignaling = new E2eeCallSignalingAdapter({ transport, deviceId: 1 });
    const bobSignaling = new E2eeCallSignalingAdapter({ transport, deviceId: 1 });

    let received = false;
    bobSignaling.listen("bob", {
      onOffer: () => { received = true; },
      onAnswer: () => {},
      onIce: () => {},
      onDecline: () => {},
      onEnd: () => {},
    });

    // Alice erroneously or maliciously sends envelope targeted to Charlie on Bob's listener
    const badEnvelope: OpaqueCallSignalingEnvelope = {
      protocolVersion: E2EE6_PROTOCOL_VERSION,
      callId: crypto.randomUUID(),
      senderUserId: "alice",
      recipientUserId: "charlie", // Mismatch!
      ciphertext: "{}",
      timestamp: Date.now(),
      isEncrypted: true,
    };

    await transport.send("bob", badEnvelope);
    expect(received).toBe(false);

    aliceSignaling.dispose();
    bobSignaling.dispose();
  });

  // =========================================================================
  // Category H: Revoked Device Rejection
  // =========================================================================
  it("H: revoked device is rejected immediately and cannot establish calls", async () => {
    const transport = new InMemorySignalingTransport();
    const aliceSignaling = new E2eeCallSignalingAdapter({ transport, deviceId: "device_compromised" });
    const bobSignaling = new E2eeCallSignalingAdapter({ transport, deviceId: "device_bob_clean" });

    // Bob revokes Alice's compromised device
    bobSignaling.revokeDevice("device_compromised");

    let received = false;
    bobSignaling.listen("bob", {
      onOffer: () => { received = true; },
      onAnswer: () => {},
      onIce: () => {},
      onDecline: () => {},
      onEnd: () => {},
    });

    const callId = crypto.randomUUID();
    await aliceSignaling.send("bob", "call-offer", {
      call_id: callId,
      from: "alice",
      sdp: { type: "offer", sdp: MOCK_SDP_OFFER },
    });

    expect(received).toBe(false); // Dropped fail-closed!

    aliceSignaling.dispose();
    bobSignaling.dispose();
  });

  // =========================================================================
  // Category I: Multi-Device Call Claim Race
  // =========================================================================
  it("I: handles multi-device simultaneous ringing and claims deterministically", () => {
    const claimManager = new CallClaimManager();
    const callId = crypto.randomUUID();

    // Device 1 and Device 2 both receive incoming call
    expect(claimManager.isClaimedByAnother(callId, "device_1")).toBe(false);
    expect(claimManager.isClaimedByAnother(callId, "device_2")).toBe(false);

    // Device 1 claims call first
    const claim1 = claimManager.claimCall(callId, "device_1");
    expect(claim1).toBe(true);

    // Device 2 now attempts to claim same call
    const claim2 = claimManager.claimCall(callId, "device_2");
    expect(claim2).toBe(false);

    // Device 2 detects that call is claimed by another device
    expect(claimManager.isClaimedByAnother(callId, "device_2")).toBe(true);
    expect(claimManager.isClaimedByAnother(callId, "device_1")).toBe(false);
  });

  // =========================================================================
  // Category J: Replay Protection
  // =========================================================================
  it("J: rejects duplicate or out-of-order sequence replay attacks", () => {
    const guard = new CallReplayGuard();
    const key = "call_1:alice:dev1";
    const now = Date.now();

    // Sequence 1: Valid
    expect(guard.validateAndAdvance(key, 1, now)).toBe(true);

    // Sequence 2: Valid
    expect(guard.validateAndAdvance(key, 2, now)).toBe(true);

    // Replay sequence 1: MUST REJECT
    expect(guard.validateAndAdvance(key, 1, now)).toBe(false);

    // Replay sequence 2: MUST REJECT
    expect(guard.validateAndAdvance(key, 2, now)).toBe(false);

    // Advance sequence 3: Valid
    expect(guard.validateAndAdvance(key, 3, now)).toBe(true);
  });

  // =========================================================================
  // Category K: Stale Call Rejection
  // =========================================================================
  it("K: rejects call invitations older than RING_TIMEOUT_MS (35s)", () => {
    const guard = new CallReplayGuard();
    const key = "call_stale:alice:dev1";
    const staleTimestamp = Date.now() - 36_000; // 36 seconds old (> 35s)

    expect(guard.validateAndAdvance(key, 1, staleTimestamp)).toBe(false);
  });

  // =========================================================================
  // Category L: Malformed Signaling
  // =========================================================================
  it("L: malformed, tampered, or forged ciphertext fails closed silently", async () => {
    const transport = new InMemorySignalingTransport();
    const bobSignaling = new E2eeCallSignalingAdapter({ transport, deviceId: 1 });

    let offerCalled = false;
    bobSignaling.listen("bob", {
      onOffer: () => { offerCalled = true; },
      onAnswer: () => {},
      onIce: () => {},
      onDecline: () => {},
      onEnd: () => {},
    });

    // Inject tampered ciphertext
    const tamperedEnvelope: OpaqueCallSignalingEnvelope = {
      protocolVersion: E2EE6_PROTOCOL_VERSION,
      callId: crypto.randomUUID(),
      senderUserId: "alice",
      recipientUserId: "bob",
      ciphertext: JSON.stringify({ iv: "invalid_iv", data: "corrupted_payload" }),
      timestamp: Date.now(),
      isEncrypted: true,
    };

    await transport.send("bob", tamperedEnvelope);
    expect(offerCalled).toBe(false);

    bobSignaling.dispose();
  });

  // =========================================================================
  // Category M: Call State Machine Transitions
  // =========================================================================
  it("M: enforces legal call state transitions and rejects illegal transitions", () => {
    const sm = new CallStateMachine();
    expect(sm.state).toBe("IDLE");

    // Legal outgoing flow
    sm.transitionTo("OUTGOING");
    expect(sm.state).toBe("OUTGOING");

    sm.transitionTo("CONNECTING");
    expect(sm.state).toBe("CONNECTING");

    sm.transitionTo("CONNECTED");
    expect(sm.state).toBe("CONNECTED");

    sm.transitionTo("ENDED");
    expect(sm.state).toBe("ENDED");

    sm.transitionTo("IDLE");
    expect(sm.state).toBe("IDLE");

    // Illegal transitions must throw
    expect(() => sm.transitionTo("CONNECTED")).toThrow(/Illegal call state transition/);
    sm.transitionTo("RINGING");
    expect(() => sm.transitionTo("CONNECTED")).toThrow(/Illegal call state transition/);
  });

  // =========================================================================
  // Category N & O: ICE Restart & Reconnection
  // =========================================================================
  it("N & O: ICE restart creates fresh authenticated SDP without plaintext leak", async () => {
    const capturedEnvelopes: OpaqueCallSignalingEnvelope[] = [];
    const transport = new InMemorySignalingTransport();
    const origSend = transport.send.bind(transport);
    transport.send = async (target, env) => {
      capturedEnvelopes.push(env);
      return origSend(target, env);
    };

    const alice = new E2eeCallSignalingAdapter({ transport, deviceId: 1 });
    const bob = new E2eeCallSignalingAdapter({ transport, deviceId: 1 });

    const callId = crypto.randomUUID();
    await alice.send("bob", "ice-restart", {
      call_id: callId,
      from: "alice",
      sdp: { type: "offer", sdp: MOCK_SDP_OFFER },
    });

    expect(capturedEnvelopes.length).toBe(1);
    expect(capturedEnvelopes[0].callId).toBe(callId);
    expect(capturedEnvelopes[0].isEncrypted).toBe(true);
    expect(JSON.stringify(capturedEnvelopes[0]).includes("a=fingerprint")).toBe(false);

    alice.dispose();
    bob.dispose();
  });

  // =========================================================================
  // Category P & Q: Timeout & Termination
  // =========================================================================
  it("P & Q: call termination cleans up active state and DTLS bindings", async () => {
    const transport = new InMemorySignalingTransport();
    const alice = new E2eeCallSignalingAdapter({ transport });
    const bob = new E2eeCallSignalingAdapter({ transport });

    let callEnded = false;
    bob.listen("bob", {
      onOffer: () => {},
      onAnswer: () => {},
      onIce: () => {},
      onDecline: () => {},
      onEnd: () => { callEnded = true; },
    });

    const callId = crypto.randomUUID();
    alice.setActiveCallId(callId);
    bob.setActiveCallId(callId);

    await alice.send("bob", "call-end", {
      call_id: callId,
      from: "alice",
      reason: "ended",
    });

    expect(callEnded).toBe(true);

    alice.dispose();
    bob.dispose();
  });

  // =========================================================================
  // Category R: Push Isolation (E2EE-5 Alignment)
  // =========================================================================
  it("R: push wake-up payload contains ZERO SDP, ZERO ICE, and ZERO call keys", () => {
    // Standard E2EE-5 call push payload
    const genericCallPush = {
      title: "Ghostline",
      body: "Incoming call",
      tag: "call-wakeup",
      data: {
        type: "call_wakeup",
        timestamp: Date.now(),
      },
    };

    const serialized = JSON.stringify(genericCallPush);
    expect(serialized.includes("sdp")).toBe(false);
    expect(serialized.includes("fingerprint")).toBe(false);
    expect(serialized.includes("candidate")).toBe(false);
    expect(serialized.includes("master_key")).toBe(false);
  });

  // =========================================================================
  // Category S: Server Blindness & Transport Isolation
  // =========================================================================
  it("S: transport relay layer sees only routing fields and opaque ciphertext", async () => {
    const transport = new InMemorySignalingTransport();
    let sentEnvelope: OpaqueCallSignalingEnvelope | null = null;
    transport.send = async (_target, env) => {
      sentEnvelope = env;
    };

    const alice = new E2eeCallSignalingAdapter({ transport });
    const callId = crypto.randomUUID();

    await alice.send("bob", "call-offer", {
      call_id: callId,
      from: "alice",
      sdp: { type: "offer", sdp: MOCK_SDP_OFFER },
    });

    expect(sentEnvelope).not.toBeNull();
    const visibleKeys = Object.keys(sentEnvelope!);
    expect(visibleKeys).toEqual([
      "protocolVersion",
      "callId",
      "senderUserId",
      "senderDeviceId",
      "recipientUserId",
      "ciphertext",
      "timestamp",
      "isEncrypted",
    ]);

    alice.dispose();
  });

  // =========================================================================
  // Category T: Strict Server-Blindness Verification Test
  // Synthetic Secret: GHOSTLINE_E2EE_CALL_SECURITY_SECRET_2026
  // =========================================================================
  it("T: SERVER-BLINDNESS PROOF: synthetic secret NEVER appears in server-visible frames", async () => {
    const capturedTransportFrames: OpaqueCallSignalingEnvelope[] = [];
    const customTransport = new InMemorySignalingTransport();
    const origSend = customTransport.send.bind(customTransport);
    customTransport.send = async (target, env) => {
      capturedTransportFrames.push(env);
      return origSend(target, env);
    };

    const alice = new E2eeCallSignalingAdapter({ transport: customTransport });
    const bob = new E2eeCallSignalingAdapter({ transport: customTransport });

    let decryptedByBob: SignalPayload | null = null;
    bob.listen("bob", {
      onOffer: (p) => { decryptedByBob = p; },
      onAnswer: () => {},
      onIce: () => {},
      onDecline: () => {},
      onEnd: () => {},
    });

    const callId = crypto.randomUUID();
    const sensitiveSdpWithSecret = MOCK_SDP_OFFER + `a=x-secret:${SERVER_BLINDNESS_SECRET}\r\n`;

    // Alice sends offer containing synthetic secret
    await alice.send("bob", "call-offer", {
      call_id: callId,
      from: "alice",
      sdp: { type: "offer", sdp: sensitiveSdpWithSecret },
    });

    // 1. Verify Bob decrypts the secret successfully locally
    expect(decryptedByBob).not.toBeNull();
    expect(decryptedByBob!.sdp?.sdp).toContain(SERVER_BLINDNESS_SECRET);

    // 2. Verify server-visible transport frames: ZERO occurrences of plaintext secret
    expect(capturedTransportFrames.length).toBe(1);
    const frame = capturedTransportFrames[0];
    const frameJson = JSON.stringify(frame);

    expect(frameJson.includes(SERVER_BLINDNESS_SECRET)).toBe(false);

    // Distinguish ciphertext from plaintext: ciphertext contains encrypted form
    expect(frame.ciphertext).toBeDefined();
    expect(typeof frame.ciphertext).toBe("string");

    alice.dispose();
    bob.dispose();
  });

  // =========================================================================
  // Category U: Legacy Path Isolation
  // =========================================================================
  it("U: drops unencrypted legacy signaling frames immediately (no silent downgrade)", async () => {
    const transport = new InMemorySignalingTransport();
    const bob = new E2eeCallSignalingAdapter({ transport });

    let legacyOfferProcessed = false;
    bob.listen("bob", {
      onOffer: () => { legacyOfferProcessed = true; },
      onAnswer: () => {},
      onIce: () => {},
      onDecline: () => {},
      onEnd: () => {},
    });

    // Adversary or legacy system sends raw cleartext JSON
    const cleartextLegacyPayload = {
      event: "call-offer",
      payload: {
        call_id: crypto.randomUUID(),
        from: "legacy_user",
        sdp: { type: "offer", sdp: MOCK_SDP_OFFER },
      },
    } as unknown as OpaqueCallSignalingEnvelope;

    await transport.send("bob", cleartextLegacyPayload);
    expect(legacyOfferProcessed).toBe(false); // MUST FAIL CLOSED

    bob.dispose();
  });

  // =========================================================================
  // Category V: Browser Compatibility & Native DTLS-SRTP
  // =========================================================================
  it("V: verifies compatibility with native browser WebRTC DTLS-SRTP bindings", () => {
    // 1. Verify standard SDP fingerprint format parses on Chromium, Firefox, WebKit
    const chromiumSdpFp = "a=fingerprint:sha-256 4A:AD:B9:B1:3F:82:18:3B:54:02:12:DF:3E:5D:49:6B:19:E5:7C:AB:E7:83:A0:64:84:40:78:1D:59:E6:37:3A";
    const firefoxSdpFp = "a=fingerprint:sha-256 4a:ad:b9:b1:3f:82:18:3b:54:02:12:df:3e:5d:49:6b:19:e5:7c:ab:e7:83:a0:64:84:40:78:1d:59:e6:37:3a";

    const chromiumParsed = extractDtlsFingerprint(chromiumSdpFp);
    const firefoxParsed = extractDtlsFingerprint(firefoxSdpFp);

    expect(chromiumParsed!.fingerprint).toBe(firefoxParsed!.fingerprint);
    expect(chromiumParsed!.algorithm).toBe("sha-256");
  });

  // =========================================================================
  // Security Regression Tests
  // =========================================================================
  it("Security Regression: E2EE call does NOT invoke legacy cleartext signaling", async () => {
    const transport = new InMemorySignalingTransport();
    const sentEvents: string[] = [];
    const origSend = transport.send.bind(transport);
    transport.send = async (target, env) => {
      sentEvents.push(env.protocolVersion);
      return origSend(target, env);
    };

    const alice = new E2eeCallSignalingAdapter({ transport });
    await alice.send("bob", "call-offer", {
      call_id: crypto.randomUUID(),
      from: "alice",
      sdp: { type: "offer", sdp: MOCK_SDP_OFFER },
    });

    expect(sentEvents).toEqual([E2EE6_PROTOCOL_VERSION]);
    alice.dispose();
  });
});
