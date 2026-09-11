/**
 * OpenE2EE In-Memory Test Stub
 * Simulates Signal Protocol client, in-memory store, and relay for unit tests.
 */

export interface Envelope {
  targetUserId: string;
  targetDeviceId: number;
  senderUserId?: string;
  senderDeviceId?: number;
  ciphertext: string | Uint8Array;
  messageType: string;
  timestamp: number;
  clientMessageId?: string;
  urgent?: boolean;
  ephemeral?: boolean;
  id?: string;
  serverTimestamp?: number;
  content?: string;
}

export interface DecryptedMessageHookPayload {
  content: string;
  messageId: string;
  senderId: string;
  timestamp: number;
}

export type HookFn = (payload: DecryptedMessageHookPayload) => Promise<void> | void;

export class InMemoryRelay {
  private devices = new Map<string, Array<{ encryptedDeviceName: ArrayBuffer }>>();
  private hooks = new Map<string, HookFn[]>();
  private activeSubscriptions = new Set<string>();
  private mailbox = new Map<string, DecryptedMessageHookPayload[]>();

  async registerDevice(userId: string, data: { encryptedDeviceName: ArrayBuffer }) {
    const list = this.devices.get(userId) || [];
    list.push(data);
    this.devices.set(userId, list);
    return list.length;
  }

  registerHook(userId: string, hook: HookFn) {
    const list = this.hooks.get(userId) || [];
    list.push(hook);
    this.hooks.set(userId, list);
    this.flushMailbox(userId);
  }

  startSubscription(userId: string) {
    this.activeSubscriptions.add(userId);
    this.flushMailbox(userId);
  }

  stopSubscription(userId: string) {
    this.activeSubscriptions.delete(userId);
  }

  private async flushMailbox(userId: string) {
    if (!this.activeSubscriptions.has(userId)) return;
    const hooks = this.hooks.get(userId) || [];
    if (hooks.length === 0) return;

    const queued = this.mailbox.get(userId) || [];
    if (queued.length === 0) return;

    this.mailbox.set(userId, []);
    for (const msg of queued) {
      for (const hook of hooks) {
        await hook(msg);
      }
    }
  }

  async dispatchMessage(targetUserId: string, senderUserId: string, content: string) {
    const payload: DecryptedMessageHookPayload = {
      content,
      messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      senderId: senderUserId,
      timestamp: Date.now(),
    };

    const isSubscribed = this.activeSubscriptions.has(targetUserId);
    const hooks = this.hooks.get(targetUserId) || [];

    if (isSubscribed && hooks.length > 0) {
      for (const hook of hooks) {
        await hook(payload);
      }
    } else {
      const list = this.mailbox.get(targetUserId) || [];
      list.push(payload);
      this.mailbox.set(targetUserId, list);
    }
  }
}

export function inMemoryRelay() {
  return new InMemoryRelay();
}

export function inMemoryStore() {
  const store = new Map<string, unknown>();
  return {
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => store.set(k, v),
    clear: async () => store.clear(),
  };
}

export class IndexedDbSignalProtocolStore {
  dbName = "signal-protocol-storage";
  async initialize() {}
  async get() { return null; }
  async set() {}
}

export class SignalProtocolClientMock {
  public userId: string;
  private relay: InMemoryRelay;
  private hooks: HookFn[] = [];

  constructor(options: { identity: { userId: string; deviceId?: number }; adapters: { storage: unknown; relay: InMemoryRelay } }) {
    this.userId = options.identity.userId;
    this.relay = options.adapters.relay || new InMemoryRelay();
  }

  async syncToServer() {
    return true;
  }

  registerHook(event: string, fn: HookFn) {
    if (event === "onMessageDecrypted") {
      this.hooks.push(fn);
      this.relay.registerHook(this.userId, fn);
    }
  }

  async send(targetUserId: string, payload: unknown) {
    const content = typeof payload === "string" ? payload : typeof payload === "object" && payload !== null && "body" in payload ? String((payload as { body: string }).body) : JSON.stringify(payload);
    
    // Dispatch to recipient via relay
    await this.relay.dispatchMessage(targetUserId, this.userId, content);

    return {
      recipientDeviceCount: 1,
      messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      serverTimestamp: Date.now(),
    };
  }

  startRelaySubscription() {
    this.relay.startSubscription(this.userId);
  }

  stopRelaySubscription() {
    this.relay.stopSubscription(this.userId);
  }

  async processIncomingEnvelope(env: unknown) {
    return env;
  }
}

export async function createSignalProtocolClient(options: {
  identity: { userId: string; deviceId?: number };
  adapters: { storage: unknown; relay: InMemoryRelay };
  hooks?: { onMessageDecrypted?: HookFn };
}) {
  const client = new SignalProtocolClientMock(options);
  if (options.hooks?.onMessageDecrypted) {
    client.registerHook("onMessageDecrypted", options.hooks.onMessageDecrypted);
  }
  return client;
}
