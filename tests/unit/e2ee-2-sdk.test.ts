import { describe, expect, it } from "vitest";
import { createSignalProtocolClient } from "@open-e2ee/signal-protocol-sdk";
import { inMemoryStore } from "@open-e2ee/signal-protocol-sdk/local/store/memory";
import { inMemoryRelay } from "@open-e2ee/signal-protocol-sdk/remote/relay/memory";

describe("E2EE-2 SDK boundary", () => {
  it("establishes a PQXDH session and delivers only after local decryption", async () => {
    const relay = inMemoryRelay();
    await relay.registerDevice("alice", { encryptedDeviceName: new ArrayBuffer(0) });
    await relay.registerDevice("bob", { encryptedDeviceName: new ArrayBuffer(0) });
    const alice = await createSignalProtocolClient({ identity: { userId: "alice" }, adapters: { storage: inMemoryStore(), relay } });
    const bob = await createSignalProtocolClient({ identity: { userId: "bob" }, adapters: { storage: inMemoryStore(), relay } });
    await alice.syncToServer();
    await bob.syncToServer();
    const received = new Promise<string>((resolve) => {
      bob.registerHook("onMessageDecrypted", async (message) => resolve(message.content));
    });

    const sent = await alice.send("bob", "E2EE test payload");
    expect(sent.recipientDeviceCount).toBe(1);
    bob.startRelaySubscription();
    await expect(received).resolves.toBe("E2EE test payload");
    bob.stopRelaySubscription();
  }, 30_000);
});
