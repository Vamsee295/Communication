/**
 * Ghostline Health & Readiness Endpoint
 * Served at: GET /api/health
 *
 * This is a Nitro server route — it is NOT part of the TanStack Router tree.
 * It executes on the server (Cloudflare Worker) and never reaches the React SSR pipeline.
 *
 * Liveness: Is the process alive? (always 200 if this handler runs)
 * Readiness: Can we reach Neon PostgreSQL?
 *
 * Intentionally minimal — does NOT expose secrets, connection strings, or user data.
 */
import { defineEventHandler, setResponseHeaders, setResponseStatus } from "h3";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  });

  const repoDriver = (process.env.DATA_REPOSITORY_DRIVER ?? "supabase").toLowerCase();
  const realtimeDriver = (process.env.REALTIME_DRIVER ?? "supabase").toLowerCase();
  const writeFrozen =
    ["true", "1", "active"].includes((process.env.GHOSTLINE_WRITE_FREEZE ?? "").toLowerCase());

  let dbStatus: "ok" | "unavailable" | "skipped" = "skipped";
  let dbErrorCode: string | undefined;

  if (repoDriver === "neon" || repoDriver === "postgres") {
    try {
      // Dynamic import so this file never hard-crashes if postgres isn't configured
      const { getPostgresClient } = await import("../../../src/lib/infra/postgres/client");
      const sql = getPostgresClient();
      await sql`SELECT 1 AS ok`;
      dbStatus = "ok";
    } catch (err: unknown) {
      dbStatus = "unavailable";
      // Only expose the error code, not the full message (which may contain connection details)
      if (err instanceof Error) {
        // Strip anything that looks like a connection string
        const safe = err.message.replace(/postgresql:\/\/[^@]+@[^\s]*/gi, "<redacted>");
        dbErrorCode = safe.slice(0, 120);
      }
    }
  }

  const isHealthy = dbStatus === "ok" || dbStatus === "skipped";

  setResponseStatus(event, isHealthy ? 200 : 503);

  return {
    status: isHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    drivers: {
      repository: repoDriver,
      realtime: realtimeDriver,
    },
    write_freeze: writeFrozen,
    database: {
      status: dbStatus,
      ...(dbErrorCode ? { error: dbErrorCode } : {}),
    },
  };
});
