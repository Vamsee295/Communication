import { AppError } from "@/lib/domain/errors";

export class MaintenanceWriteFreezeError extends AppError {
  constructor(
    message = "System is undergoing scheduled maintenance. Writes are temporarily paused.",
  ) {
    super("maintenance_write_freeze", message, 503);
  }
}

/**
 * Checks if the application is currently in write-freeze mode.
 * Controlled via environment variable `GHOSTLINE_WRITE_FREEZE=true`.
 */
export function isWriteFreezeActive(): boolean {
  if (typeof process === "undefined" || !process.env) return false;
  const val = (process.env.GHOSTLINE_WRITE_FREEZE ?? "").toLowerCase();
  return val === "true" || val === "1" || val === "active";
}

/**
 * Asserts that write operations are permitted. Throws 503 MaintenanceWriteFreezeError if frozen.
 */
export function assertWritesAllowed(): void {
  if (isWriteFreezeActive()) {
    throw new MaintenanceWriteFreezeError();
  }
}

import { createMiddleware } from "@tanstack/react-start";

/**
 * Server function middleware to block mutation requests during maintenance write freeze.
 */
export const requireNotFrozen = createMiddleware({ type: "function" }).server(async ({ next }) => {
  assertWritesAllowed();
  return next();
});
