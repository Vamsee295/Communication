/**
 * Ghostline Structured Observability Logger
 *
 * Provides JSON/pretty logging with level filtering, request correlation,
 * and strict secret redaction to prevent accidental exposure of tokens,
 * passwords, database URLs, AI keys, or binary payloads in server logs.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const CURRENT_LOG_LEVEL: LogLevel =
  (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "secret",
  "database_url",
  "databaseurl",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "session",
  "bytea",
  "file_data",
  "privatekey",
  "private_key",
]);

/**
 * Recursively redacts sensitive keys and values from log payloads.
 */
export function redactSensitiveData<T>(obj: T, depth = 0): T {
  if (depth > 5 || obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    // Redact postgres connection strings if found in text
    if (obj.includes("postgres://") || obj.includes("postgresql://")) {
      return "[REDACTED_DATABASE_URL]" as unknown as T;
    }
    // Redact Bearer tokens
    if (/^Bearer\s+[A-Za-z0-9-_=.]+/i.test(obj)) {
      return "Bearer [REDACTED_JWT]" as unknown as T;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveData(item, depth + 1)) as unknown as T;
  }

  if (typeof obj === "object") {
    // If it's a Buffer or Uint8Array, don't dump raw bytes
    if (obj instanceof Uint8Array || (typeof Buffer !== "undefined" && Buffer.isBuffer(obj))) {
      return `[BINARY_DATA ${(obj as Uint8Array).byteLength} bytes]` as unknown as T;
    }

    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes("secret") || lowerKey.includes("token")) {
        cleaned[key] = "[REDACTED]";
      } else {
        cleaned[key] = redactSensitiveData(value, depth + 1);
      }
    }
    return cleaned as unknown as T;
  }

  return obj;
}

export interface LogContext {
  requestId?: string;
  userId?: string;
  conversationId?: string;
  action?: string;
  [key: string]: unknown;
}

class Logger {
  private formatLog(level: LogLevel, message: string, context?: LogContext, error?: unknown) {
    const timestamp = new Date().toISOString();
    const isProd = process.env.NODE_ENV === "production";

    const entry = {
      timestamp,
      level,
      message,
      ...(context ? { context: redactSensitiveData(context) } : {}),
      ...(error
        ? {
            error:
              error instanceof Error
                ? {
                    name: error.name,
                    message: error.message,
                    ...(isProd ? {} : { stack: error.stack }),
                  }
                : String(error),
          }
        : {}),
    };

    if (isProd) {
      // Production: structured JSON line for log aggregators (Datadog, CloudWatch, Papertrail, etc.)
      return JSON.stringify(entry);
    } else {
      // Local development: clean, color-aware readable output
      const ctxStr = context ? ` ${JSON.stringify(redactSensitiveData(context))}` : "";
      const errStr = error instanceof Error ? ` - ${error.message}` : error ? ` - ${String(error)}` : "";
      return `[${timestamp}] [${level.toUpperCase()}] ${message}${ctxStr}${errStr}`;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[CURRENT_LOG_LEVEL];
  }

  debug(message: string, context?: LogContext) {
    if (this.shouldLog("debug")) {
      console.debug(this.formatLog("debug", message, context));
    }
  }

  info(message: string, context?: LogContext) {
    if (this.shouldLog("info")) {
      console.info(this.formatLog("info", message, context));
    }
  }

  warn(message: string, context?: LogContext, error?: unknown) {
    if (this.shouldLog("warn")) {
      console.warn(this.formatLog("warn", message, context, error));
    }
  }

  error(message: string, context?: LogContext, error?: unknown) {
    if (this.shouldLog("error")) {
      console.error(this.formatLog("error", message, context, error));
    }
  }
}

export const logger = new Logger();
