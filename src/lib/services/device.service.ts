import type { Device } from "@/lib/domain/types";
import type { DeviceRepository } from "@/lib/repositories/ports";
import { broadcastSessionRevoked, serverBroadcastSessionRevoked } from "@/lib/realtime/security-events";

export class DeviceService {
  constructor(
    private readonly userId: string,
    private readonly devices: DeviceRepository,
  ) {}

  register(input: {
    device_key: string;
    device_name: string;
    platform: string;
    user_agent?: string;
  }): Promise<Device> {
    return this.devices.upsert({
      user_id: this.userId,
      device_key: input.device_key,
      device_name: input.device_name,
      platform: input.platform,
      user_agent: input.user_agent,
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
    });
  }

  list(): Promise<Device[]> {
    return this.devices.listForUser(this.userId);
  }

  async validate(deviceKey: string): Promise<{ valid: boolean; reason?: "not_found" | "revoked"; device?: Device }> {
    if (!deviceKey) return { valid: false, reason: "not_found" };
    const device = await this.devices.getByKey(this.userId, deviceKey);
    if (!device) {
      return { valid: false, reason: "not_found" };
    }
    if (device.revoked_at) {
      return { valid: false, reason: "revoked", device };
    }
    return { valid: true, device };
  }

  async revoke(deviceId: string): Promise<{ ok: true; deviceId: string; deviceKey?: string }> {
    const revokedAt = new Date().toISOString();
    const revoked = await this.devices.revoke(this.userId, deviceId, revokedAt);
    
    // Broadcast security event to force immediate logout on the target device
    if (revoked?.device_key) {
      void broadcastSessionRevoked(this.userId, {
        deviceId,
        deviceKey: revoked.device_key,
        revokedAt,
      });
      void serverBroadcastSessionRevoked(this.userId, {
        deviceId,
        deviceKey: revoked.device_key,
        revokedAt,
      });
    }

    return { ok: true, deviceId, deviceKey: revoked?.device_key };
  }
}
