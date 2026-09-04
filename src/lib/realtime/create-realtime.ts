import type { RealtimeService } from "@/lib/ports/realtime";
import { SupabaseRealtimeService } from "@/lib/infra/supabase/supabase-realtime";

export type RealtimeDriver = "supabase" | "websocket";

/**
 * Returns currently active realtime driver.
 * Default is 'supabase' until Phase 4 cutover rehearsal is authorized.
 */
export function getRealtimeDriver(): RealtimeDriver {
  const driver = (typeof process !== "undefined" ? process.env?.REALTIME_DRIVER : "") || "";
  if (driver.toLowerCase() === "websocket" || driver.toLowerCase() === "gateway") {
    return "websocket";
  }
  return "supabase";
}

let activeRealtimeService: RealtimeService | null = null;

export function getRealtimeService(): RealtimeService {
  if (!activeRealtimeService) {
    // Default to SupabaseRealtimeService to maintain 100% backward compatibility
    activeRealtimeService = new SupabaseRealtimeService();
  }
  return activeRealtimeService;
}

export function setRealtimeService(service: RealtimeService) {
  activeRealtimeService = service;
}

export const realtimeService: RealtimeService = new Proxy({} as RealtimeService, {
  get(_, prop, receiver) {
    const target = getRealtimeService();
    return Reflect.get(target, prop, receiver);
  },
});
