import type { Device } from "@/lib/domain/types";
import type { DeviceRepository } from "@/lib/repositories/ports";

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

  async revoke(deviceId: string): Promise<{ ok: true }> {
    await this.devices.revoke(this.userId, deviceId, new Date().toISOString());
    return { ok: true };
  }
}
