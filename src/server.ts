import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

import { handleAttachmentApiRequest } from "./lib/attachments.api";
import { getDb } from "./lib/infra/postgres/client";
import { logger } from "./lib/infra/logger";

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
    const url = new URL(request.url);

    // 1. Health liveness probe (GET /api/health)
    if (url.pathname === "/api/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          uptime: typeof process !== "undefined" && process.uptime ? Math.floor(process.uptime()) : 0,
          timestamp: new Date().toISOString(),
          service: "ghostline-api",
          version: "1.0.0",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": requestId,
            "cache-control": "no-store",
          },
        },
      );
    }

    // 2. Health readiness probe (GET /api/health/ready)
    if (url.pathname === "/api/health/ready") {
      try {
        const db = getDb();
        await db.unsafe("SELECT 1;");
        return new Response(
          JSON.stringify({
            status: "ok",
            database: "connected",
            timestamp: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-request-id": requestId,
              "cache-control": "no-store",
            },
          },
        );
      } catch (err) {
        logger.error("Readiness check database failure", { requestId }, err);
        return new Response(
          JSON.stringify({
            status: "degraded",
            database: "disconnected",
            timestamp: new Date().toISOString(),
          }),
          {
            status: 503,
            headers: {
              "content-type": "application/json",
              "x-request-id": requestId,
              "cache-control": "no-store",
            },
          },
        );
      }
    }

    // 3. Authenticated Neon BYTEA Media streaming
    if (url.pathname.startsWith("/api/attachments/")) {
      const mediaResponse = await handleAttachmentApiRequest(request);
      mediaResponse.headers.set("x-request-id", requestId);
      return mediaResponse;
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      normalized.headers.set("x-request-id", requestId);
      return normalized;
    } catch (error) {
      logger.error("Unhandled server exception during request", { requestId, path: url.pathname }, error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-request-id": requestId,
        },
      });
    }
  },
};

