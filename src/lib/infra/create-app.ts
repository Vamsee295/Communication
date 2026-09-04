import type { AppSupabase } from "@/lib/infra/supabase/app-client";
import { createSupabaseApp, type AppServices, createServices } from "@/lib/services/create-services";
import { getPostgresClient } from "@/lib/infra/postgres/client";
import { createPostgresRepositories } from "@/lib/repositories/postgres/create-postgres-repositories";

import { PostgresProfileRepository } from "@/lib/repositories/postgres/postgres-profile-repository";

export type DataRepositoryDriver = "supabase" | "neon";

/**
 * Returns the currently active data repository driver based on environment configuration.
 * Default is 'supabase'.
 */
export function getRepositoryDriver(): DataRepositoryDriver {
  const driver = (process.env.DATA_REPOSITORY_DRIVER ?? "").toLowerCase();
  if (driver === "neon" || driver === "postgres") {
    return "neon";
  }
  return "supabase";
}

/**
 * Instantiates the application services using the native Neon PostgreSQL repositories.
 * The caller identity is strictly derived from the verified Supabase JWT session (claims.sub).
 */
export function createPostgresApp(userId: string): AppServices {
  const db = getPostgresClient();
  const repos = createPostgresRepositories(db, userId);

  // Asynchronously ensure the profiles row exists in Neon so foreign keys don't fail
  if (repos.profiles instanceof PostgresProfileRepository) {
    void repos.profiles.ensureProfileExists(userId).catch(() => {});
  }

  return createServices(userId, repos);
}

/**
 * Central application factory dispatching to the configured repository driver.
 * - DATA_REPOSITORY_DRIVER=neon -> Native PostgreSQL repository backed by Neon.
 * - DATA_REPOSITORY_DRIVER=supabase -> PostgREST client under Supabase RLS.
 */
export function createApp(context: { supabase: AppSupabase; userId: string }): AppServices {
  if (getRepositoryDriver() === "neon") {
    return createPostgresApp(context.userId);
  }
  return createSupabaseApp(context.supabase, context.userId);
}
