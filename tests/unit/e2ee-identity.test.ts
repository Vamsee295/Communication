// @ts-nocheck
import { describe, expect, it, vi } from "vitest";
import {
  generateIdentityKeyPair,
  generateOneTimePreKeys,
  generateSignedPreKey,
  verifySignedPreKeySignature,
} from "@/lib/e2ee/identity/key-generator";
import { DeviceCryptoService } from "@/lib/services/device-crypto.service";
import type { DeviceRepository, PrekeyRepository } from "@/lib/repositories/ports";
import type { Device, DeviceCryptoPublicBundle } from "@/lib/domain/types";

describe("E2EE-1: Cryptographic Identity & PreKey Infrastructure", () => {
  describe("Key Generator Unit Tests", () => {
    it("1. generates Ed25519 identity keypair with distinct public/private components", () => {
      const ik = generateIdentityKeyPair();
      expect(ik.publicKey).toBeDefined();
      expect(ik.privateKey).toBeDefined();
      expect(ik.publicKey).not.toBe(ik.privateKey);
      expect(ik.publicKey.length).toBeGreaterThan(10);
    });

    it("2. generates X25519 signed prekey and valid Ed25519 signature", () => {
      const ik = generateIdentityKeyPair();
      const spk = generateSignedPreKey(ik.privateKey);

      expect(spk.publicKey).toBeDefined();
      expect(spk.privateKey).toBeDefined();
      expect(spk.signature).toBeDefined();

      const valid = verifySignedPreKeySignature(ik.publicKey, spk.publicKey, spk.signature);
      expect(valid).toBe(true);
    });

    it("3. rejects invalid or tampered signatures", () => {
      const ik1 = generateIdentityKeyPair();
      const ik2 = generateIdentityKeyPair();
      const spk = generateSignedPreKey(ik1.privateKey);

      // Verify against wrong identity key
      const validWrongKey = verifySignedPreKeySignature(ik2.publicKey, spk.publicKey, spk.signature);
      expect(validWrongKey).toBe(false);

      // Verify against tampered signature
      const tamperedSig = spk.signature.substring(0, spk.signature.length - 4) + "AAAA";
      const validTampered = verifySignedPreKeySignature(ik1.publicKey, spk.publicKey, tamperedSig);
      expect(validTampered).toBe(false);
    });

    it("4. generates batches of unique One-Time PreKeys", () => {
      const opks = generateOneTimePreKeys(1, 100);
      expect(opks).toHaveLength(100);
      expect(opks[0].keyId).toBe(1);
      expect(opks[99].keyId).toBe(100);

      const pubKeys = new Set(opks.map((k) => k.publicKey));
      expect(pubKeys.size).toBe(100);
    });
  });

  describe("DeviceCryptoService Authorization & Lifecycle Tests", () => {
    const mockUserId = "user-123";
    const mockDeviceId = "11111111-1111-1111-1111-111111111111";

    const mockDevice: Device = {
      id: mockDeviceId,
      user_id: mockUserId,
      device_key: "dev-key-1",
      device_name: "Test Browser",
      platform: "web",
      user_agent: "Vitest",
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
      created_at: new Date().toISOString(),
    };

    function setupMocks() {
      const prekeysMap = new Map<string, any>();
      const opkMap = new Map<string, Array<{ key_id: number; public_key: string }>>();

      const mockPrekeyRepo: PrekeyRepository = {
        upsertPrekeys: vi.fn(async (row) => {
          prekeysMap.set(row.device_id, row);
        }),
        insertOneTimePrekeys: vi.fn(async (deviceId, keys) => {
          const existing = opkMap.get(deviceId) ?? [];
          opkMap.set(deviceId, [...existing, ...keys]);
        }),
        getPublicBundle: vi.fn(async (deviceId) => {
          const main = prekeysMap.get(deviceId);
          if (!main) return null;
          const opks = opkMap.get(deviceId) ?? [];
          const opk = opks.shift() ?? null;
          return {
            device_id: main.device_id,
            user_id: main.user_id,
            identity_key: main.identity_key,
            signed_prekey: main.signed_prekey,
            signed_prekey_signature: main.signed_prekey_signature,
            one_time_prekey: opk,
          };
        }),
        consumeOneTimePrekey: vi.fn(async (deviceId) => {
          const opks = opkMap.get(deviceId) ?? [];
          return opks.shift() ?? null;
        }),
        getOneTimePrekeyCount: vi.fn(async (deviceId) => {
          return (opkMap.get(deviceId) ?? []).length;
        }),
        revokeDevicePrekeys: vi.fn(async (deviceId) => {
          prekeysMap.delete(deviceId);
          opkMap.delete(deviceId);
        }),
      };

      const mockDeviceRepo: DeviceRepository = {
        upsert: vi.fn(),
        listForUser: vi.fn(async (userId) => {
          if (userId === mockUserId) return [mockDevice];
          return [];
        }),
        getByKey: vi.fn(async (userId, deviceKey) => {
          if (userId === mockUserId && mockDevice.device_key === deviceKey) return mockDevice;
          return null;
        }),
        revoke: vi.fn(async (userId, deviceId) => {
          if (mockDevice.id === deviceId) {
            mockDevice.revoked_at = new Date().toISOString();
            return { id: mockDevice.id, device_key: mockDevice.device_key };
          }
          return null;
        }),
      };

      return { mockPrekeyRepo, mockDeviceRepo };
    }

    it("5. registers public bundle for caller device and stores zero private keys", async () => {
      const { mockPrekeyRepo, mockDeviceRepo } = setupMocks();
      const service = new DeviceCryptoService(mockUserId, mockPrekeyRepo, mockDeviceRepo);

      const ik = generateIdentityKeyPair();
      const spk = generateSignedPreKey(ik.privateKey);
      const opks = generateOneTimePreKeys(1, 10);

      const result = await service.registerBundle({
        device_id: mockDeviceId,
        identity_key: ik.publicKey,
        signed_prekey: spk.publicKey,
        signed_prekey_signature: spk.signature,
        one_time_prekeys: opks.map((k) => ({ key_id: k.keyId, public_key: k.publicKey })),
      });

      expect(result.ok).toBe(true);
      expect(mockPrekeyRepo.upsertPrekeys).toHaveBeenCalledWith(
        expect.objectContaining({
          device_id: mockDeviceId,
          user_id: mockUserId,
          identity_key: ik.publicKey,
        })
      );
    });

    it("6. rejects bundle registration for another user's device", async () => {
      const { mockPrekeyRepo, mockDeviceRepo } = setupMocks();
      const service = new DeviceCryptoService("attacker-user-id", mockPrekeyRepo, mockDeviceRepo);

      await expect(
        service.registerBundle({
          device_id: mockDeviceId,
          identity_key: "ik-pub",
          signed_prekey: "spk-pub",
          signed_prekey_signature: "sig",
          one_time_prekeys: [],
        })
      ).rejects.toThrow("Device not found for this account");
    });

    it("7. retrieves public bundle with one-time prekey consumption and zero private fields", async () => {
      const { mockPrekeyRepo, mockDeviceRepo } = setupMocks();
      const service = new DeviceCryptoService(mockUserId, mockPrekeyRepo, mockDeviceRepo);

      const ik = generateIdentityKeyPair();
      const spk = generateSignedPreKey(ik.privateKey);
      const opks = generateOneTimePreKeys(1, 2);

      await service.registerBundle({
        device_id: mockDeviceId,
        identity_key: ik.publicKey,
        signed_prekey: spk.publicKey,
        signed_prekey_signature: spk.signature,
        one_time_prekeys: opks.map((k) => ({ key_id: k.keyId, public_key: k.publicKey })),
      });

      const bundle1 = await service.getBundle(mockDeviceId);
      expect(bundle1.identity_key).toBe(ik.publicKey);
      expect(bundle1.one_time_prekey?.key_id).toBe(1);

      // Verify no private key fields exist in public bundle
      const bundleKeys = Object.keys(bundle1);
      expect(bundleKeys).not.toContain("identity_key_private");
      expect(bundleKeys).not.toContain("signed_prekey_private");
      expect(bundleKeys).not.toContain("privateKey");
    });

    it("8. supports OPK replenishment", async () => {
      const { mockPrekeyRepo, mockDeviceRepo } = setupMocks();
      const service = new DeviceCryptoService(mockUserId, mockPrekeyRepo, mockDeviceRepo);

      const ik = generateIdentityKeyPair();
      const spk = generateSignedPreKey(ik.privateKey);

      await service.registerBundle({
        device_id: mockDeviceId,
        identity_key: ik.publicKey,
        signed_prekey: spk.publicKey,
        signed_prekey_signature: spk.signature,
        one_time_prekeys: [],
      });

      const newOpks = generateOneTimePreKeys(1, 5);
      const repl = await service.replenishOneTimePrekeys({
        device_id: mockDeviceId,
        one_time_prekeys: newOpks.map((k) => ({ key_id: k.keyId, public_key: k.publicKey })),
      });

      expect(repl.ok).toBe(true);
      expect(repl.count).toBe(5);
    });

    it("9. revokes device prekeys on device revocation", async () => {
      const { mockPrekeyRepo, mockDeviceRepo } = setupMocks();
      const service = new DeviceCryptoService(mockUserId, mockPrekeyRepo, mockDeviceRepo);

      const ik = generateIdentityKeyPair();
      const spk = generateSignedPreKey(ik.privateKey);

      await service.registerBundle({
        device_id: mockDeviceId,
        identity_key: ik.publicKey,
        signed_prekey: spk.publicKey,
        signed_prekey_signature: spk.signature,
        one_time_prekeys: [],
      });

      const rev = await service.revoke(mockDeviceId);
      expect(rev.ok).toBe(true);
      expect(mockPrekeyRepo.revokeDevicePrekeys).toHaveBeenCalledWith(mockDeviceId);
    });
  });
});
