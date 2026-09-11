import { describe, it, expect, beforeEach } from "vitest";
import { DeviceService } from "@/lib/services/device.service";
import type { DeviceRepository } from "@/lib/repositories/ports";
import type { Device } from "@/lib/domain/types";

describe("Device Log Cleanup & Multi-Selection Backend", () => {
  const userA = "11111111-1111-4111-8111-111111111111";
  const userB = "22222222-2222-4222-8222-222222222222";

  let devicesTable: Device[] = [];
  let mockDevicesRepo: DeviceRepository;

  beforeEach(() => {
    // Seed in-memory devices table
    devicesTable = [
      {
        id: "d-active-a1",
        user_id: userA,
        device_key: "key-a1",
        device_name: "Windows PC (Current)",
        platform: "web",
        user_agent: "Chrome",
        last_seen_at: new Date().toISOString(),
        revoked_at: null,
      },
      {
        id: "d-revoked-a1",
        user_id: userA,
        device_key: "key-a2",
        device_name: "Windows PC",
        platform: "web",
        user_agent: "Chrome",
        last_seen_at: new Date(Date.now() - 3600000).toISOString(),
        revoked_at: new Date(Date.now() - 1800000).toISOString(),
      },
      {
        id: "d-revoked-a2",
        user_id: userA,
        device_key: "key-a3",
        device_name: "Windows PC",
        platform: "web",
        user_agent: "Chrome",
        last_seen_at: new Date(Date.now() - 7200000).toISOString(),
        revoked_at: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: "d-revoked-a3",
        user_id: userA,
        device_key: "key-a4",
        device_name: "iPhone 15",
        platform: "mobile",
        user_agent: "Safari",
        last_seen_at: new Date(Date.now() - 10000000).toISOString(),
        revoked_at: new Date(Date.now() - 5000000).toISOString(),
      },
      // User B devices
      {
        id: "d-active-b1",
        user_id: userB,
        device_key: "key-b1",
        device_name: "MacBook Pro",
        platform: "web",
        user_agent: "Safari",
        last_seen_at: new Date().toISOString(),
        revoked_at: null,
      },
      {
        id: "d-revoked-b1",
        user_id: userB,
        device_key: "key-b2",
        device_name: "iPad Air",
        platform: "tablet",
        user_agent: "Safari",
        last_seen_at: new Date(Date.now() - 3600000).toISOString(),
        revoked_at: new Date(Date.now() - 1800000).toISOString(),
      },
    ];

    mockDevicesRepo = {
      upsert: async (row) => {
        const existingIdx = devicesTable.findIndex(
          (d) => d.user_id === row.user_id && d.device_key === row.device_key
        );
        const record: Device = {
          id: existingIdx >= 0 ? devicesTable[existingIdx].id : `d-${Date.now()}`,
          ...row,
        };
        if (existingIdx >= 0) {
          devicesTable[existingIdx] = record;
        } else {
          devicesTable.push(record);
        }
        return record;
      },
      listForUser: async (userId: string) => {
        return devicesTable.filter((d) => d.user_id === userId);
      },
      getByKey: async (userId: string, deviceKey: string) => {
        return devicesTable.find((d) => d.user_id === userId && d.device_key === deviceKey) ?? null;
      },
      revoke: async (userId: string, deviceId: string, revokedAt: string) => {
        const dev = devicesTable.find((d) => d.id === deviceId && d.user_id === userId);
        if (!dev) return null;
        dev.revoked_at = revokedAt;
        return { id: dev.id, device_key: dev.device_key };
      },
      delete: async (userId: string, deviceId: string) => {
        const initialLength = devicesTable.length;
        devicesTable = devicesTable.filter(
          (d) => !(d.id === deviceId && d.user_id === userId && d.revoked_at !== null)
        );
        return devicesTable.length < initialLength;
      },
      deleteMany: async (userId: string, deviceIds: string[]) => {
        const initialLength = devicesTable.length;
        const set = new Set(deviceIds);
        devicesTable = devicesTable.filter(
          (d) => !(set.has(d.id) && d.user_id === userId && d.revoked_at !== null)
        );
        return initialLength - devicesTable.length;
      },
      clearRevoked: async (userId: string) => {
        const initialLength = devicesTable.length;
        devicesTable = devicesTable.filter(
          (d) => !(d.user_id === userId && d.revoked_at !== null)
        );
        return initialLength - devicesTable.length;
      },
    };
  });

  describe("Single Device Deletion", () => {
    it("allows authenticated user to delete their own revoked device", async () => {
      const service = new DeviceService(userA, mockDevicesRepo);
      const res = await service.delete("d-revoked-a1");
      expect(res.ok).toBe(true);
      expect(res.deleted).toBe(true);

      const list = await service.list();
      expect(list.find((d) => d.id === "d-revoked-a1")).toBeUndefined();
    });

    it("prevents deleting an active (non-revoked) device", async () => {
      const service = new DeviceService(userA, mockDevicesRepo);
      const res = await service.delete("d-active-a1");
      expect(res.ok).toBe(true);
      expect(res.deleted).toBe(false);

      const list = await service.list();
      expect(list.find((d) => d.id === "d-active-a1")).toBeDefined();
    });

    it("prevents user A from deleting user B's revoked device", async () => {
      const serviceA = new DeviceService(userA, mockDevicesRepo);
      const res = await serviceA.delete("d-revoked-b1");
      expect(res.ok).toBe(true);
      expect(res.deleted).toBe(false);

      // Verify User B's device is still intact
      const serviceB = new DeviceService(userB, mockDevicesRepo);
      const listB = await serviceB.list();
      expect(listB.find((d) => d.id === "d-revoked-b1")).toBeDefined();
    });
  });

  describe("Bulk Device Deletion", () => {
    it("allows deleting multiple revoked devices in one call", async () => {
      const service = new DeviceService(userA, mockDevicesRepo);
      const res = await service.deleteMany(["d-revoked-a1", "d-revoked-a2"]);
      expect(res.ok).toBe(true);
      expect(res.count).toBe(2);

      const list = await service.list();
      expect(list.find((d) => d.id === "d-revoked-a1")).toBeUndefined();
      expect(list.find((d) => d.id === "d-revoked-a2")).toBeUndefined();
      // d-revoked-a3 should remain
      expect(list.find((d) => d.id === "d-revoked-a3")).toBeDefined();
      // active device should remain
      expect(list.find((d) => d.id === "d-active-a1")).toBeDefined();
    });

    it("silently ignores unauthorized and active devices in bulk delete", async () => {
      const service = new DeviceService(userA, mockDevicesRepo);
      const res = await service.deleteMany([
        "d-revoked-a3",
        "d-active-a1", // active - protected
        "d-revoked-b1", // belongs to user B - protected
      ]);
      expect(res.ok).toBe(true);
      expect(res.count).toBe(1); // only d-revoked-a3 was deleted

      const listA = await service.list();
      expect(listA.find((d) => d.id === "d-revoked-a3")).toBeUndefined();
      expect(listA.find((d) => d.id === "d-active-a1")).toBeDefined();

      const serviceB = new DeviceService(userB, mockDevicesRepo);
      const listB = await serviceB.list();
      expect(listB.find((d) => d.id === "d-revoked-b1")).toBeDefined();
    });
  });

  describe("Clear All Revoked Devices", () => {
    it("clears all revoked devices for user A while keeping active devices intact", async () => {
      const serviceA = new DeviceService(userA, mockDevicesRepo);
      const res = await serviceA.clearRevoked();
      expect(res.ok).toBe(true);
      expect(res.count).toBe(3); // d-revoked-a1, d-revoked-a2, d-revoked-a3

      const listA = await serviceA.list();
      expect(listA.length).toBe(1);
      expect(listA[0].id).toBe("d-active-a1");
      expect(listA[0].revoked_at).toBeNull();
    });

    it("does not affect user B's revoked devices when user A clears revoked devices", async () => {
      const serviceA = new DeviceService(userA, mockDevicesRepo);
      await serviceA.clearRevoked();

      const serviceB = new DeviceService(userB, mockDevicesRepo);
      const listB = await serviceB.list();
      expect(listB.find((d) => d.id === "d-revoked-b1")).toBeDefined();
      expect(listB.find((d) => d.id === "d-active-b1")).toBeDefined();
    });
  });
});
