import { describe, expect, it, vi, beforeEach } from "vitest";
import { DeviceService } from "@/lib/services/device.service";
import type { DeviceRepository } from "@/lib/repositories/ports";
import type { Device } from "@/lib/domain/types";
import { rotateDeviceKey, getDeviceKey, clearDeviceKey } from "@/lib/device-key";

describe("Device Revocation & Cross-Browser Session Security", () => {
  let devicesStore: Device[];
  let mockRepo: DeviceRepository;
  const userId = "user-alice-123";

  beforeEach(() => {
    devicesStore = [];
    mockRepo = {
      upsert: vi.fn(async (input) => {
        const existing = devicesStore.find(
          (d) => d.user_id === input.user_id && d.device_key === input.device_key,
        );
        if (existing) {
          existing.device_name = input.device_name;
          existing.platform = input.platform;
          existing.user_agent = input.user_agent ?? null;
          existing.last_seen_at = input.last_seen_at;
          // Crucial: do NOT overwrite revoked_at!
          return existing;
        }
        const newDevice: Device = {
          id: `dev-${devicesStore.length + 1}`,
          user_id: input.user_id,
          device_key: input.device_key,
          device_name: input.device_name,
          platform: input.platform,
          user_agent: input.user_agent ?? null,
          last_seen_at: input.last_seen_at,
          revoked_at: null,
          created_at: new Date().toISOString(),
        };
        devicesStore.push(newDevice);
        return newDevice;
      }),
      listForUser: vi.fn(async (uid) => devicesStore.filter((d) => d.user_id === uid)),
      getByKey: vi.fn(async (uid, key) => {
        return devicesStore.find((d) => d.user_id === uid && d.device_key === key) ?? null;
      }),
      revoke: vi.fn(async (uid, deviceId, revokedAt) => {
        const d = devicesStore.find((dev) => dev.id === deviceId && dev.user_id === uid);
        if (d) {
          d.revoked_at = revokedAt;
          return { id: d.id, device_key: d.device_key };
        }
        return null;
      }),
    };
  });

  it("1. registers multiple independent devices for the same user account", async () => {
    const service = new DeviceService(userId, mockRepo);

    const devA = await service.register({
      device_key: "key-chrome-mac",
      device_name: "Mac Chrome",
      platform: "web",
    });

    const devB = await service.register({
      device_key: "key-edge-win",
      device_name: "Windows PC",
      platform: "web",
    });

    expect(devA.id).toBe("dev-1");
    expect(devB.id).toBe("dev-2");
    expect(devA.device_key).not.toBe(devB.device_key);

    const list = await service.list();
    expect(list).toHaveLength(2);
    expect(list.every((d) => d.revoked_at === null)).toBe(true);
  });

  it("2. validate() returns valid for active device and invalid for revoked device", async () => {
    const service = new DeviceService(userId, mockRepo);

    await service.register({
      device_key: "key-device-b",
      device_name: "Browser B",
      platform: "web",
    });

    // Valid prior to revocation
    const check1 = await service.validate("key-device-b");
    expect(check1.valid).toBe(true);
    expect(check1.device?.device_name).toBe("Browser B");

    // Revoke Device B
    await service.revoke("dev-1");

    // Invalidation check
    const check2 = await service.validate("key-device-b");
    expect(check2.valid).toBe(false);
    expect(check2.reason).toBe("revoked");
  });

  it("3. refreshing or heartbeating an already-revoked device does not un-revoke it", async () => {
    const service = new DeviceService(userId, mockRepo);

    await service.register({
      device_key: "key-revoked-browser",
      device_name: "Revoked Browser",
      platform: "web",
    });

    await service.revoke("dev-1");
    const deviceBefore = await mockRepo.getByKey(userId, "key-revoked-browser");
    expect(deviceBefore?.revoked_at).not.toBeNull();

    // Device tries to re-register/refresh itself
    const deviceAfter = await service.register({
      device_key: "key-revoked-browser",
      device_name: "Revoked Browser",
      platform: "web",
    });

    // Must still be revoked!
    expect(deviceAfter.revoked_at).not.toBeNull();
    const validation = await service.validate("key-revoked-browser");
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe("revoked");
  });

  it("4. revoking Device B leaves Device A active and authorized (multi-device isolation)", async () => {
    const service = new DeviceService(userId, mockRepo);

    await service.register({
      device_key: "key-device-a",
      device_name: "Browser A",
      platform: "web",
    });

    await service.register({
      device_key: "key-device-b",
      device_name: "Browser B",
      platform: "web",
    });

    // Revoke only Device B
    const revokeRes = await service.revoke("dev-2");
    expect(revokeRes.ok).toBe(true);
    expect(revokeRes.deviceKey).toBe("key-device-b");

    // Device B is revoked
    const checkB = await service.validate("key-device-b");
    expect(checkB.valid).toBe(false);
    expect(checkB.reason).toBe("revoked");

    // Device A remains active
    const checkA = await service.validate("key-device-a");
    expect(checkA.valid).toBe(true);
    expect(checkA.device?.revoked_at).toBeNull();
  });

  it("5. validate() returns not_found for non-existent or empty device keys", async () => {
    const service = new DeviceService(userId, mockRepo);
    const check = await service.validate("unknown-key");
    expect(check.valid).toBe(false);
    expect(check.reason).toBe("not_found");
  });

  it("6. rotateDeviceKey() generates a new distinct key for subsequent fresh logins", () => {
    if (typeof window !== "undefined") {
      clearDeviceKey();
      const initialKey = getDeviceKey();
      const rotated = rotateDeviceKey();
      expect(rotated).not.toBe(initialKey);
      expect(getDeviceKey()).toBe(rotated);
    }
  });
});
