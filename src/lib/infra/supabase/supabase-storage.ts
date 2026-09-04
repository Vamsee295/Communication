import type { StorageService } from "@/lib/ports/storage";

/** Adapter only. UI does not upload in Phase 1. */
export class SupabaseStorageService implements StorageService {
  publicUrl(bucket: string, objectKey: string): string | null {
    const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (!base) return null;
    return `${base.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${objectKey}`;
  }
}
