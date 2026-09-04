import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** User-scoped Supabase client (RLS applies). Stays behind repositories. */
export type AppSupabase = SupabaseClient<Database>;
