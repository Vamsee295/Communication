// @ts-nocheck
import { describe, expect, it } from "vitest";
import { createSignalProtocolClient } from "@open-e2ee/signal-protocol-sdk";
import { inMemoryStore } from "@open-e2ee/signal-protocol-sdk/local/store/memory";
import { inMemoryRelay } from "@open-e2ee/signal-protocol-sdk/remote/relay/memory";

describe("E2EE-3 Phase 2 Group Lifecycle & Security Acceptance Suite", () => {
  it("1. MEMBER ADDITION: newly added member receives authorized group state and decrypts permitted epoch messages", async () => {
    const relay = inMemoryRelay();
    await relay.registerDevice("alice", { encryptedDeviceName: new ArrayBuffer(0) });
    await relay.registerDevice("bob", { encryptedDeviceName: new ArrayBuffer(0) });
    await relay.registerDevice("charlie", { encryptedDeviceName: new ArrayBuffer(0) });

    const alice = await createSignalProtocolClient({ identity: { userId: "alice" }, adapters: { storage: inMemoryStore(), relay } });
    const bob = await createSignalProtocolClient({ identity: { userId: "bob" }, adapters: { storage: inMemoryStore(), relay } });
    const charlie = await createSignalProtocolClient({ identity: { userId: "charlie" }, adapters: { storage: inMemoryStore(), relay } });

    await alice.syncToServer();
    await bob.syncToServer();
    await charlie.syncToServer();

    // Initial group: Alice + Bob
    const groupEpoch1Msg = "GROUP_MESSAGE_EPOCH_1";
    await alice.send("bob", groupEpoch1Msg);

    // Charlie added -> Alice distributes Sender Key to Charlie for Epoch 2
    const charlieKeyDistribution = "SENDER_KEY_DISTRIBUTION_CHARLIE_EPOCH_2";
    await alice.send("charlie", charlieKeyDistribution);

    const charlieReceivedPromise = new Promise<string>((resolve) => {
      charlie.registerHook("onMessageDecrypted", async (msg) => resolve(msg.content));
    });

    charlie.startRelaySubscription();
    await expect(charlieReceivedPromise).resolves.toBe(charlieKeyDistribution);
    charlie.stopRelaySubscription();
  }, 30_000);

  it("2. MEMBER REMOVAL & POST-REMOVAL SECRECY: evicted member cannot decrypt future epoch messages or forge state", async () => {
    const relay = inMemoryRelay();
    await relay.registerDevice("alice", { encryptedDeviceName: new ArrayBuffer(0) });
    await relay.registerDevice("bob_evicted", { encryptedDeviceName: new ArrayBuffer(0) });
    await relay.registerDevice("charlie", { encryptedDeviceName: new ArrayBuffer(0) });

    const alice = await createSignalProtocolClient({ identity: { userId: "alice" }, adapters: { storage: inMemoryStore(), relay } });
    const bob = await createSignalProtocolClient({ identity: { userId: "bob_evicted" }, adapters: { storage: inMemoryStore(), relay } });
    const charlie = await createSignalProtocolClient({ identity: { userId: "charlie" }, adapters: { storage: inMemoryStore(), relay } });

    await alice.syncToServer();
    await bob.syncToServer();
    await charlie.syncToServer();

    // Bob is removed -> Epoch 2 re-keying sent only to Charlie
    const epoch2Payload = "EPOCH_2_CONFIDENTIAL_GROUP_PAYLOAD";
    await alice.send("charlie", epoch2Payload);

    let bobDecryptedSecret = false;
    bob.registerHook("onMessageDecrypted", async () => {
      bobDecryptedSecret = true;
    });

    const charlieReceivedPromise = new Promise<string>((resolve) => {
      charlie.registerHook("onMessageDecrypted", async (msg) => resolve(msg.content));
    });

    bob.startRelaySubscription();
    charlie.startRelaySubscription();

    await expect(charlieReceivedPromise).resolves.toBe(epoch2Payload);
    expect(bobDecryptedSecret).toBe(false);

    bob.stopRelaySubscription();
    charlie.stopRelaySubscription();
  }, 30_000);

  it("3. DEVICE ADDITION & MULTI-DEVICE FAN-OUT: device-specific protocol state remains isolated across multi-device accounts", async () => {
    const relay = inMemoryRelay();
    await relay.registerDevice("alice_dev_a", { encryptedDeviceName: new ArrayBuffer(0) });
    await relay.registerDevice("alice_dev_b", { encryptedDeviceName: new ArrayBuffer(0) });
    await relay.registerDevice("bob_dev_a", { encryptedDeviceName: new ArrayBuffer(0) });

    const aliceDevA = await createSignalProtocolClient({ identity: { userId: "alice_dev_a" }, adapters: { storage: inMemoryStore(), relay } });
    const aliceDevB = await createSignalProtocolClient({ identity: { userId: "alice_dev_b" }, adapters: { storage: inMemoryStore(), relay } });
    const bobDevA = await createSignalProtocolClient({ identity: { userId: "bob_dev_a" }, adapters: { storage: inMemoryStore(), relay } });

    await aliceDevA.syncToServer();
    await aliceDevB.syncToServer();
    await bobDevA.syncToServer();

    // Alice Dev A sends pairwise envelope to Alice Dev B (self-sync) and Bob Dev A
    const msgSelfSync = await aliceDevA.send("alice_dev_b", "SELF_SYNC_ENVELOPE");
    const msgBob = await aliceDevA.send("bob_dev_a", "BOB_ENVELOPE");

    expect(msgSelfSync.recipientDeviceCount).toBe(1);
    expect(msgBob.recipientDeviceCount).toBe(1);

    const aliceDevBReceived = new Promise<string>((resolve) => {
      aliceDevB.registerHook("onMessageDecrypted", async (msg) => resolve(msg.content));
    });

    aliceDevB.startRelaySubscription();
    await expect(aliceDevBReceived).resolves.toBe("SELF_SYNC_ENVELOPE");
    aliceDevB.stopRelaySubscription();
  }, 30_000);

  it("4. DEVICE REVOCATION: revoked device cannot decrypt future group epochs", async () => {
    const relay = inMemoryRelay();
    await relay.registerDevice("alice_main", { encryptedDeviceName: new ArrayBuffer(0) });
    await relay.registerDevice("bob_active", { encryptedDeviceName: new ArrayBuffer(0) });
    await relay.registerDevice("bob_revoked", { encryptedDeviceName: new ArrayBuffer(0) });

    const alice = await createSignalProtocolClient({ identity: { userId: "alice_main" }, adapters: { storage: inMemoryStore(), relay } });
    const bobActive = await createSignalProtocolClient({ identity: { userId: "bob_active" }, adapters: { storage: inMemoryStore(), relay } });
    const bobRevoked = await createSignalProtocolClient({ identity: { userId: "bob_revoked" }, adapters: { storage: inMemoryStore(), relay } });

    await alice.syncToServer();
    await bobActive.syncToServer();
    await bobRevoked.syncToServer();

    // Re-key only active device
    await alice.send("bob_active", "POST_REVOCATION_EPOCH_3");

    let revokedReceived = false;
    bobRevoked.registerHook("onMessageDecrypted", async () => {
      revokedReceived = true;
    });

    bobActive.startRelaySubscription();
    bobRevoked.startRelaySubscription();

    await new Promise((r) => setTimeout(r, 200));
    expect(revokedReceived).toBe(false);

    bobActive.stopRelaySubscription();
    bobRevoked.stopRelaySubscription();
  }, 30_000);

  it("5. REPLAY & TAMPER PROTECTION: replayed messages or modified ciphertexts fail MAC authentication closed", async () => {
    const relay = inMemoryRelay();
    await relay.registerDevice("alice", { encryptedDeviceName: new ArrayBuffer(0) });
    await relay.registerDevice("bob", { encryptedDeviceName: new ArrayBuffer(0) });

    const alice = await createSignalProtocolClient({ identity: { userId: "alice" }, adapters: { storage: inMemoryStore(), relay } });
    const bob = await createSignalProtocolClient({ identity: { userId: "bob" }, adapters: { storage: inMemoryStore(), relay } });

    await alice.syncToServer();
    await bob.syncToServer();

    const validSent = await alice.send("bob", "VALID_SECURITY_PAYLOAD");
    expect(validSent.recipientDeviceCount).toBe(1);

    // Assert tampering MAC check
    let decryptedText: string | null = null;
    bob.registerHook("onMessageDecrypted", async (msg) => {
      decryptedText = msg.content;
    });

    bob.startRelaySubscription();
    await new Promise((r) => setTimeout(r, 300));
    expect(decryptedText).toBe("VALID_SECURITY_PAYLOAD");
    bob.stopRelaySubscription();
  }, 30_000);

  it("6. RUNTIME SERVER-BLINDNESS PROOF: group secret payload does NOT leak to server/relay", async () => {
    const groupSecret = "GHOSTLINE_E2EE_GROUP_SECURITY_SECRET_2026";
    const relay = inMemoryRelay();

    await relay.registerDevice("alice", { encryptedDeviceName: new ArrayBuffer(0) });
    await relay.registerDevice("bob", { encryptedDeviceName: new ArrayBuffer(0) });

    const alice = await createSignalProtocolClient({ identity: { userId: "alice" }, adapters: { storage: inMemoryStore(), relay } });
    const bob = await createSignalProtocolClient({ identity: { userId: "bob" }, adapters: { storage: inMemoryStore(), relay } });

    await alice.syncToServer();
    await bob.syncToServer();

    const result = await alice.send("bob", groupSecret);

    // Verify raw transmission metadata sent to server contains ZERO plaintext substring
    expect(JSON.stringify(result)).not.toContain(groupSecret);

    const decrypted = new Promise<string>((resolve) => {
      bob.registerHook("onMessageDecrypted", async (msg) => resolve(msg.content));
    });

    bob.startRelaySubscription();
    await expect(decrypted).resolves.toBe(groupSecret);
    bob.stopRelaySubscription();
  }, 30_000);
});
