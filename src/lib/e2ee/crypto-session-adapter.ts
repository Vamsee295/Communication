/**
 * E2EE-2 boundary. The OpenE2EE SDK owns PQXDH, Double Ratchet state, skipped
 * keys, replay handling, serialization, and IndexedDB persistence. Ghostline
 * only supplies authenticated relay transport for public data and ciphertext.
 */
import { createSignalProtocolClient, type EcSignedPreKeyUpload, type Envelope, type GroupMemberDevice, type ISignalProtocolRelayServer, type KemLastResortPreKeyUpload, type PreKeyUpload, type RetryRequest } from "@open-e2ee/signal-protocol-sdk";
import { IndexedDbSignalProtocolStore } from "@open-e2ee/signal-protocol-sdk/local/store/web";
import type { AccountIdentityProvisioning, AccountIdentityRotation, DeviceInfo, DeviceRegistration, PreKeyBundle, Unsubscribe } from "@open-e2ee/signal-protocol-sdk/remote/relay";
import {
  getE2eeRelayDevices,
  getE2eeRelayIdentity,
  getE2eeRelayPreKeyBundle,
  getPendingE2eeEnvelopes,
  markE2eeEnvelopeDelivered,
  registerE2eeRelayDevice,
  sendE2eeEnvelope,
  syncE2eeRelayIdentity,
  syncE2eeRelayPrekeys,
} from "@/lib/e2ee.functions";
import { decryptedMessageStore } from "@/lib/e2ee/decrypted-message-store";

const unsupported = (): never => {
  throw new Error("This E2EE-2 relay does not enable groups, provisioning, sealed sender, or retry transport.");
};

type RelayDevice = { protocol_device_id: number; device_type: "mobile" | "desktop" | "tablet" | "web"; enabled: boolean; created_at: string; updated_at: string };

function asDeviceInfo(device: RelayDevice): DeviceInfo {
  return { deviceId: device.protocol_device_id, deviceType: device.device_type, registered: true, linked: device.protocol_device_id !== 1, enabled: device.enabled, active: false, lastSeen: Date.parse(device.updated_at), createdAt: Date.parse(device.created_at) };
}

/** Authenticated browser adapter for the SDK's relay interface. */
class GhostlineRelay implements ISignalProtocolRelayServer {
  private protocolDeviceId: number | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private polling = false;

  constructor(private readonly userId: string, private readonly deviceKey: string) {}

  async initializeDevice(): Promise<number> {
    const result = await registerE2eeRelayDevice({ data: { device_key: this.deviceKey, device_type: "web" } });
    this.protocolDeviceId = result.protocol_device_id;
    return result.protocol_device_id;
  }

  private requireDeviceId(): number {
    if (this.protocolDeviceId === null) throw new Error("E2EE relay device has not been initialized");
    return this.protocolDeviceId;
  }

  async send(envelope: Envelope): Promise<{ messageId: string; serverTimestamp: number }> {
    const result = await sendE2eeEnvelope({ data: {
      target_user_id: envelope.targetUserId,
      target_device_id: envelope.targetDeviceId,
      sender_device_id: envelope.senderDeviceId,
      ciphertext: typeof envelope.ciphertext === "string" ? envelope.ciphertext : bytesToBase64(envelope.ciphertext),
      message_type: envelope.messageType,
      timestamp: envelope.timestamp,
      client_message_id: envelope.clientMessageId,
      urgent: envelope.urgent,
      ephemeral: envelope.ephemeral,
    } });
    return { messageId: result.message_id, serverTimestamp: result.server_timestamp };
  }

  subscribe(_userId: string, _deviceId: number, onEnvelope: (envelope: Envelope) => void): Unsubscribe {
    const poll = async () => {
      if (this.polling) return;
      this.polling = true;
      try {
        const rows = await getPendingE2eeEnvelopes({ data: { protocol_device_id: this.requireDeviceId() } });
        for (const row of rows) onEnvelope({ targetUserId: this.userId, targetDeviceId: this.requireDeviceId(), senderUserId: row.sender_user_id, senderDeviceId: row.sender_device_id, ciphertext: row.ciphertext, messageType: row.message_type, timestamp: row.client_timestamp, clientMessageId: row.client_message_id ?? undefined, urgent: row.urgent, ephemeral: row.ephemeral, id: row.id, serverTimestamp: row.server_timestamp });
      } finally { this.polling = false; }
    };
    void poll();
    this.pollTimer = setInterval(() => void poll(), 2_500);
    return () => { if (this.pollTimer) clearInterval(this.pollTimer); this.pollTimer = null; };
  }

  async markDelivered(envelopeId: string): Promise<void> { await markE2eeEnvelopeDelivered({ data: { envelope_id: envelopeId } }); }
  async getDevices(userId: string): Promise<DeviceInfo[]> { return (await getE2eeRelayDevices({ data: { user_id: userId } })).map(asDeviceInfo); }
  async getActiveDevices(userId: string): Promise<GroupMemberDevice[]> { return (await this.getDevices(userId)).filter((d) => d.enabled).map((d) => ({ userId, deviceId: d.deviceId })); }
  async registerDevice(_userId: string, _device: DeviceRegistration): Promise<number> { return this.initializeDevice(); }
  async removeDevice(): Promise<void> { unsupported(); }
  async markDeviceConnected(): Promise<void> {}
  async markDeviceDisconnected(): Promise<void> {}
  async heartbeat(): Promise<void> {}
  async provisionIdentityKey(request: AccountIdentityProvisioning): Promise<void> { await syncE2eeRelayIdentity({ data: { device_id: request.deviceId, identity_type: request.identityType ?? "aci", x25519_public_key: request.identity.x25519PublicKey, ed25519_public_key: request.identity.ed25519PublicKey, registration_id: request.registrationId } }); }
  async rotateIdentityKey(_request: AccountIdentityRotation): Promise<void> { unsupported(); }
  async getIdentityKey(userId: string) { const result = await getE2eeRelayIdentity({ data: { user_id: userId } }); return result ? { version: 1 as const, x25519PublicKey: result.x25519_public_key as never, ed25519PublicKey: result.ed25519_public_key as never } : null; }
  async uploadPreKeys(_userId: string, deviceId: number, keys: PreKeyUpload[], identityType = "aci"): Promise<void> { await syncE2eeRelayPrekeys({ data: { device_id: deviceId, identity_type: identityType, keys } }); }
  async fetchPreKeyBundle(userId: string, deviceId: number): Promise<PreKeyBundle | null> { const result = await getE2eeRelayPreKeyBundle({ data: { user_id: userId, device_id: deviceId } }); return result as PreKeyBundle | null; }
  async getPreKeyCount(): Promise<number> { return 100; }
  async clearStaleKemPreKeys(): Promise<{ cleared: number }> { return { cleared: 0 }; }
  async uploadEcSignedPreKey(_userId: string, key: EcSignedPreKeyUpload): Promise<void> { await this.uploadPreKeys(this.userId, key.deviceId, [{ type: "ecSignedPreKey", keyId: key.keyId, publicKey: key.publicKey, signature: key.signature }]); }
  async uploadKemLastResortPreKey(_userId: string, key: KemLastResortPreKeyUpload): Promise<void> { await this.uploadPreKeys(this.userId, key.deviceId, [{ type: "kemLastResortPreKey", keyId: key.keyId, publicKey: key.publicKey, signature: key.signature }]); }
  async getEcSignedPreKeyMetadata(): Promise<null> { return null; }
  async getKemLastResortPreKeyMetadata(): Promise<null> { return null; }
  async createProvisioningSession(): Promise<{ sessionId: string }> { return unsupported(); }
  async connectNewDevice(): Promise<void> { unsupported(); }
  async sendProvisioningMessage(): Promise<void> { unsupported(); }
  async getProvisioningMessage(): Promise<never> { return unsupported(); }
  async completeProvisioning(): Promise<never> { return unsupported(); }
  async acknowledgeProvisioning(): Promise<void> { unsupported(); }
  async rollbackProvisioning(): Promise<void> { unsupported(); }
  async deleteProvisioningSession(): Promise<void> { unsupported(); }
  async sendRetryRequest(_request: RetryRequest): Promise<void> { unsupported(); }
  async createGroupState(..._args: Parameters<ISignalProtocolRelayServer["createGroupState"]>): Promise<void> { return unsupported(); }
  async getGroupState(..._args: Parameters<ISignalProtocolRelayServer["getGroupState"]>) { return unsupported(); }
  async getGroupJoinInfo(..._args: Parameters<ISignalProtocolRelayServer["getGroupJoinInfo"]>) { return unsupported(); }
  async getGroupChanges(..._args: Parameters<ISignalProtocolRelayServer["getGroupChanges"]>) { return unsupported(); }
  async submitGroupChange(..._args: Parameters<ISignalProtocolRelayServer["submitGroupChange"]>) { return unsupported(); }
  async issueAuthCredential(..._args: Parameters<ISignalProtocolRelayServer["issueAuthCredential"]>) { return unsupported(); }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export class CryptoSessionAdapter {
  private client: Awaited<ReturnType<typeof createSignalProtocolClient>> | null = null;
  private relay: GhostlineRelay | null = null;
  private initializedFor: string | null = null;

  /** Initializes one browser-local SDK store and its non-secret relay device ID. */
  async initializeDevice(userId: string, deviceKey: string): Promise<void> {
    if (this.initializedFor === `${userId}:${deviceKey}` && this.client) return;
    decryptedMessageStore.setActiveUser(userId);
    const relay = new GhostlineRelay(userId, deviceKey);
    const deviceId = await relay.initializeDevice();
    const storage = new IndexedDbSignalProtocolStore();
    (storage as unknown as { dbName: string }).dbName = `signal-protocol-storage-${userId}`;
    await storage.initialize();
    this.client = await createSignalProtocolClient({ identity: { userId, deviceId }, adapters: { storage, relay }, hooks: {
      onMessageDecrypted: async (envelope) => {
        const parsed = parseDirectMessage(envelope.content);
        if (!parsed) return;
        await decryptedMessageStore.upsert({ id: envelope.messageId, conversation_id: parsed.conversationId, sender_id: envelope.senderId, body: parsed.body, created_at: new Date(envelope.timestamp).toISOString(), outgoing: false });
      },
    } });
    this.relay = relay;
    this.initializedFor = `${userId}:${deviceKey}`;
  }

  /** SDK establishes PQXDH sessions and owns all ratchet state. */
  async establishSession(): Promise<void> { this.requireClient(); }
  async encryptMessage(recipientUserId: string, conversationId: string, plaintext: string) {
    const timestamp = Date.now();
    const result = await this.requireClient().send(recipientUserId, { body: plaintext, conversationId, timestamp, clientMessageId: crypto.randomUUID() });
    await decryptedMessageStore.upsert({ id: result.messageId, conversation_id: conversationId, sender_id: this.requireClient().userId, body: plaintext, created_at: new Date(timestamp).toISOString(), outgoing: true });
    return result;
  }
  async decryptMessage(envelope: Parameters<Awaited<ReturnType<typeof createSignalProtocolClient>>["processIncomingEnvelope"]>[0]) { return this.requireClient().processIncomingEnvelope(envelope); }
  async resetSession(): Promise<never> { throw new Error("Session reset requires verified identity-change UX and is intentionally not automatic."); }
  async listRecipientDevices(userId: string) { return this.requireRelay().getDevices(userId); }
  async fanOutEncryptedMessage(recipientUserId: string, conversationId: string, plaintext: string) { return this.encryptMessage(recipientUserId, conversationId, plaintext); }
  startReceiving(): void { this.requireClient().startRelaySubscription(); }
  stopReceiving(): void { this.requireClient().stopRelaySubscription(); }
  private requireClient() { if (!this.client) throw new Error("CryptoSessionAdapter is not initialized"); return this.client; }
  private requireRelay() { if (!this.relay) throw new Error("CryptoSessionAdapter is not initialized"); return this.relay; }
}

export const cryptoSessionAdapter = new CryptoSessionAdapter();

function parseDirectMessage(content: string): { conversationId: string; body: string } | null {
  try {
    const parsed = JSON.parse(content) as { dataMessage?: { conversationId?: unknown; body?: unknown } };
    const data = parsed.dataMessage;
    if (typeof data?.conversationId !== "string" || typeof data.body !== "string") return null;
    return { conversationId: data.conversationId, body: data.body };
  } catch { return null; }
}
