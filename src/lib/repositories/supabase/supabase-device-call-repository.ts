import type { AppSupabase } from "@/lib/infra/supabase/app-client";
import { mapInfraError } from "@/lib/infra/supabase/map-error";
import type { Call, CallStatus, CallType, Device } from "@/lib/domain/types";
import type { CallRepository, DeviceRepository } from "@/lib/repositories/ports";

export class SupabaseDeviceRepository implements DeviceRepository {
  constructor(private readonly supabase: AppSupabase) {}

  async upsert(row: {
    user_id: string;
    device_key: string;
    device_name: string;
    platform: string;
    user_agent?: string;
    last_seen_at: string;
    revoked_at: null;
  }): Promise<Device> {
    const { data, error } = await this.supabase
      .from("devices")
      .upsert(row, { onConflict: "user_id,device_key" })
      .select()
      .single();
    if (error) mapInfraError(error);
    return data as Device;
  }

  async listForUser(userId: string): Promise<Device[]> {
    const { data, error } = await this.supabase
      .from("devices")
      .select("*")
      .eq("user_id", userId)
      .order("last_seen_at", { ascending: false });
    if (error) mapInfraError(error);
    return (data ?? []) as Device[];
  }

  async revoke(userId: string, deviceId: string, revokedAt: string): Promise<void> {
    const { error } = await this.supabase
      .from("devices")
      .update({ revoked_at: revokedAt })
      .eq("id", deviceId)
      .eq("user_id", userId);
    if (error) mapInfraError(error);
  }
}

export class SupabaseCallRepository implements CallRepository {
  constructor(private readonly supabase: AppSupabase) {}

  async insert(row: {
    conversation_id: string;
    caller_id: string;
    callee_id: string;
    call_type: CallType;
    status: "ringing";
  }): Promise<Call> {
    const { data, error } = await this.supabase.from("calls").insert(row).select("*").single();
    if (error) mapInfraError(error);
    return data as Call;
  }

  async getById(id: string): Promise<Call | null> {
    const { data, error } = await this.supabase.from("calls").select("*").eq("id", id).maybeSingle();
    if (error) mapInfraError(error);
    return (data as Call | null) ?? null;
  }

  async updateStatus(
    id: string,
    patch: {
      status: CallStatus;
      started_at?: string;
      ended_at?: string;
      duration_seconds?: number;
    },
  ): Promise<void> {
    const { error } = await this.supabase.from("calls").update(patch).eq("id", id);
    if (error) mapInfraError(error);
  }

  async listForUser(userId: string, limit: number): Promise<Call[]> {
    const { data, error } = await this.supabase
      .from("calls")
      .select("*")
      .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) mapInfraError(error);
    return (data ?? []) as Call[];
  }
}
