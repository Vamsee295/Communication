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

  async getByKey(userId: string, deviceKey: string): Promise<Device | null> {
    const { data, error } = await this.supabase
      .from("devices")
      .select("*")
      .eq("user_id", userId)
      .eq("device_key", deviceKey)
      .maybeSingle();
    if (error) mapInfraError(error);
    return (data as Device | null) ?? null;
  }

  async revoke(userId: string, deviceId: string, revokedAt: string): Promise<{ id: string; device_key: string } | null> {
    const { data, error } = await this.supabase
      .from("devices")
      .update({ revoked_at: revokedAt })
      .eq("id", deviceId)
      .eq("user_id", userId)
      .select("id, device_key")
      .maybeSingle();
    if (error) mapInfraError(error);
    return (data as { id: string; device_key: string } | null) ?? null;
  }

  async delete(userId: string, deviceId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("devices")
      .delete()
      .eq("id", deviceId)
      .eq("user_id", userId)
      .not("revoked_at", "is", null)
      .select("id");
    if (error) mapInfraError(error);
    return ((data as Array<{ id: string }>) ?? []).length > 0;
  }

  async deleteMany(userId: string, deviceIds: string[]): Promise<number> {
    if (deviceIds.length === 0) return 0;
    const { data, error } = await this.supabase
      .from("devices")
      .delete()
      .in("id", deviceIds)
      .eq("user_id", userId)
      .not("revoked_at", "is", null)
      .select("id");
    if (error) mapInfraError(error);
    return ((data as Array<{ id: string }>) ?? []).length;
  }

  async clearRevoked(userId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from("devices")
      .delete()
      .eq("user_id", userId)
      .not("revoked_at", "is", null)
      .select("id");
    if (error) mapInfraError(error);
    return ((data as Array<{ id: string }>) ?? []).length;
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

  async deleteFromHistory(callId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from("calls")
      .delete()
      .eq("id", callId)
      .or(`caller_id.eq.${userId},callee_id.eq.${userId}`);
    if (error) mapInfraError(error);
  }

  async deleteManyFromHistory(callIds: string[], userId: string): Promise<number> {
    if (callIds.length === 0) return 0;
    const { data, error } = await this.supabase
      .from("calls")
      .delete()
      .in("id", callIds)
      .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
      .select("id");
    if (error) mapInfraError(error);
    return ((data as Array<{ id: string }>) ?? []).length;
  }

  async clearHistory(userId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from("calls")
      .delete()
      .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
      .select("id");
    if (error) mapInfraError(error);
    return ((data as Array<{ id: string }>) ?? []).length;
  }
}
