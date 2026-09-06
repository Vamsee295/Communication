import { createSignalProtocolClient } from "@open-e2ee/signal-protocol-sdk";
import { indexedDbStore } from "@open-e2ee/signal-protocol-sdk/local/store/web";
import { inMemoryStore } from "@open-e2ee/signal-protocol-sdk/local/store/memory";
import { inMemoryRelay } from "@open-e2ee/signal-protocol-sdk/remote/relay/memory";

interface SmokeResult {
  success: boolean;
  plaintext?: string;
  relayCiphertext?: string;
  indexedDbPresent?: boolean;
  webCryptoUsed?: boolean;
  errorName?: string;
  errorMessage?: string;
  errorStack?: string;
}

declare global {
  interface Window {
    runE2eeBrowserSmoke: () => Promise<SmokeResult>;
  }
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

window.runE2eeBrowserSmoke = async (): Promise<SmokeResult> => {
  let aliceStorage: Awaited<ReturnType<typeof indexedDbStore>> | null = null;
  try {
    await deleteDatabase("signal-protocol-storage");
    const relay = inMemoryRelay();
    await relay.registerDevice("alice", { encryptedDeviceName: new ArrayBuffer(0) });
    await relay.registerDevice("bob", { encryptedDeviceName: new ArrayBuffer(0) });
    aliceStorage = await indexedDbStore();
    const alice = await createSignalProtocolClient({
      identity: { userId: "alice" },
      adapters: { storage: aliceStorage, relay },
    });
    const bob = await createSignalProtocolClient({
      identity: { userId: "bob" },
      adapters: { storage: inMemoryStore(), relay },
    });
    await alice.syncToServer();
    await bob.syncToServer();
    const delivered = new Promise<string>((resolve) =>
      bob.registerHook("onMessageDecrypted", async (envelope) => resolve(envelope.content)),
    );
    await alice.send("bob", "browser-only plaintext");
    const envelope = relay.getPendingMessages("bob", 1)[0];
    if (!envelope || typeof envelope.ciphertext !== "string") throw new Error("Relay did not receive an opaque envelope");
    bob.startRelaySubscription();
    const plaintext = await delivered;
    bob.stopRelaySubscription();
    const indexedDbPresent = await new Promise<boolean>((resolve) => {
      const r = indexedDB.open("signal-protocol-storage");
      r.onsuccess = () => {
        resolve(true);
        r.result.close();
      };
      r.onerror = () => resolve(false);
    });
    const result: SmokeResult = {
      success: true,
      plaintext,
      relayCiphertext: envelope.ciphertext,
      indexedDbPresent,
      webCryptoUsed: Boolean(globalThis.crypto?.getRandomValues),
    };
    await aliceStorage.close();
    return result;
  } catch (err: unknown) {
    if (aliceStorage) {
      try {
        await aliceStorage.close();
      } catch (closeErr) {
        console.warn("Storage close error", closeErr);
      }
    }
    const errorObj = err instanceof Error ? err : new Error(String(err));
    return {
      success: false,
      errorName: errorObj.name,
      errorMessage: errorObj.message,
      errorStack: errorObj.stack,
    };
  }
};
