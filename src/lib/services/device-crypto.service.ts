import { AuthorizationError, NotFoundError, ValidationError } from "@/lib/domain/errors";
import type { DeviceCryptoPublicBundle } from "@/lib/domain/types";
import type { DeviceRepository, PrekeyRepository } from "@/lib/repositories/ports";

export class DeviceCryptoService {
  constructor(
    private readonly userId: string,
    private readonly prekeys: PrekeyRepository,
    private readonly devices: DeviceRepository,
  ) {}

  async registerBundle(input: {
    device_id: string;
    identity_key: string;
    signed_prekey: string;
    signed_prekey_signature: string;
    one_time_prekeys: Array<{ key_id: number; public_key: string }>;
  }): Promise<{ ok: true }> {
    // 1. Verify device belongs to caller and is not revoked
    const myDevices = await this.devices.listForUser(this.userId);
    const target = myDevices.find((d) => d.id === input.device_id);
    if (!target) throw new NotFoundError("Device not found for this account");
    if (target.revoked_at) throw new AuthorizationError("Cannot register keys for a revoked device");

    if (!input.identity_key || !input.signed_prekey || !input.signed_prekey_signature) {
      throw new ValidationError("Invalid public prekey bundle data");
    }

    // 2. Save public identity & signed prekey
    await this.prekeys.upsertPrekeys({
      device_id: input.device_id,
      user_id: this.userId,
      identity_key: input.identity_key,
      signed_prekey: input.signed_prekey,
      signed_prekey_signature: input.signed_prekey_signature,
    });

    // 3. Save initial batch of one-time prekeys
    if (input.one_time_prekeys.length > 0) {
      await this.prekeys.insertOneTimePrekeys(input.device_id, input.one_time_prekeys);
    }

    return { ok: true };
  }

  async getBundle(deviceId: string): Promise<DeviceCryptoPublicBundle> {
    const bundle = await this.prekeys.getPublicBundle(deviceId);
    if (!bundle) throw new NotFoundError("Prekey bundle not found for device");
    return bundle;
  }

  async replenishOneTimePrekeys(input: {
    device_id: string;
    one_time_prekeys: Array<{ key_id: number; public_key: string }>;
  }): Promise<{ ok: true; count: number }> {
    const myDevices = await this.devices.listForUser(this.userId);
    const target = myDevices.find((d) => d.id === input.device_id);
    if (!target) throw new NotFoundError("Device not found for this account");
    if (target.revoked_at) throw new AuthorizationError("Cannot replenish keys for a revoked device");

    await this.prekeys.insertOneTimePrekeys(input.device_id, input.one_time_prekeys);
    const count = await this.prekeys.getOneTimePrekeyCount(input.device_id);
    return { ok: true, count };
  }

  async rotateSignedPrekey(input: {
    device_id: string;
    signed_prekey: string;
    signed_prekey_signature: string;
  }): Promise<{ ok: true }> {
    const myDevices = await this.devices.listForUser(this.userId);
    const target = myDevices.find((d) => d.id === input.device_id);
    if (!target) throw new NotFoundError("Device not found for this account");
    if (target.revoked_at) throw new AuthorizationError("Cannot rotate signed prekey for a revoked device");

    const existingBundle = await this.prekeys.getPublicBundle(input.device_id);
    if (!existingBundle) throw new NotFoundError("No active identity found for device");

    await this.prekeys.upsertPrekeys({
      device_id: input.device_id,
      user_id: this.userId,
      identity_key: existingBundle.identity_key,
      signed_prekey: input.signed_prekey,
      signed_prekey_signature: input.signed_prekey_signature,
    });

    return { ok: true };
  }

  async revoke(deviceId: string): Promise<{ ok: true }> {
    const myDevices = await this.devices.listForUser(this.userId);
    const target = myDevices.find((d) => d.id === deviceId);
    if (!target) throw new NotFoundError("Device not found for this account");

    await this.devices.revoke(this.userId, deviceId, new Date().toISOString());
    await this.prekeys.revokeDevicePrekeys(deviceId);

    return { ok: true };
  }
}
