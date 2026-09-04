import type { LocalDevicePrivateState } from "@/lib/domain/types";
import {
  generateIdentityKeyPair,
  generateOneTimePreKeys,
  generateSignedPreKey,
} from "@/lib/e2ee/identity/key-generator";
import { cryptoKeyStore } from "@/lib/e2ee/storage/crypto-key-store";

export class ClientCryptoService {
  /**
   * Initializes device cryptographic identity locally on the client.
   * Private key material remains in local IndexedDB.
   * Returns public bundle suitable for server registration.
   */
  async ensureDeviceCrypto(deviceId: string): Promise<{
    isNew: boolean;
    publicBundle: {
      device_id: string;
      identity_key: string;
      signed_prekey: string;
      signed_prekey_signature: string;
      one_time_prekeys: Array<{ key_id: number; public_key: string }>;
    };
  }> {
    const existing = await cryptoKeyStore.getPrivateState(deviceId);
    if (existing) {
      return {
        isNew: false,
        publicBundle: {
          device_id: existing.device_id,
          identity_key: existing.identity_key_public,
          signed_prekey: existing.signed_prekey_public,
          signed_prekey_signature: existing.signed_prekey_signature,
          one_time_prekeys: existing.one_time_prekeys.map((k) => ({
            key_id: k.key_id,
            public_key: k.public_key,
          })),
        },
      };
    }

    // Generate new Ed25519 identity key
    const ik = generateIdentityKeyPair();
    // Generate X25519 signed prekey signed with identity key
    const spk = generateSignedPreKey(ik.privateKey);
    // Generate 100 initial X25519 one-time prekeys
    const opks = generateOneTimePreKeys(1, 100);

    const privateState: LocalDevicePrivateState = {
      device_id: deviceId,
      identity_key_private: ik.privateKey,
      identity_key_public: ik.publicKey,
      signed_prekey_private: spk.privateKey,
      signed_prekey_public: spk.publicKey,
      signed_prekey_signature: spk.signature,
      one_time_prekeys: opks.map((k) => ({
        key_id: k.keyId,
        private_key: k.privateKey,
        public_key: k.publicKey,
      })),
    };

    // Store private state safely in IndexedDB
    await cryptoKeyStore.savePrivateState(privateState);

    return {
      isNew: true,
      publicBundle: {
        device_id: deviceId,
        identity_key: ik.publicKey,
        signed_prekey: spk.publicKey,
        signed_prekey_signature: spk.signature,
        one_time_prekeys: opks.map((k) => ({
          key_id: k.keyId,
          public_key: k.publicKey,
        })),
      },
    };
  }
}

export const clientCryptoService = new ClientCryptoService();
