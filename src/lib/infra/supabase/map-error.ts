import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  InternalError,
  NotFoundError,
  ValidationError,
  isAppError,
} from "@/lib/domain/errors";

type PostgrestLike = {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

const RAW_DB =
  /PGRST|violates|SQLSTATE|permission denied|row-level|schema cache|duplicate key|foreign key|not-null|JWT expired|invalid JWT/i;

function looksLikeDatabaseDump(message: string): boolean {
  return RAW_DB.test(message);
}

/** Map infrastructure errors to AppError. Never throw raw PostgREST/SQL text to the UI. */
export function mapInfraError(error: unknown): never {
  if (isAppError(error)) throw error;
  const err = error as PostgrestLike;
  const code = err.code ?? "";
  const message = err.message ?? "";

  if (code === "23505") {
    if (/username/i.test(message) || /profiles_username/i.test(message)) {
      throw new ConflictError("Username is taken");
    }
    if (/friendships/i.test(message)) {
      throw new ConflictError("Request already exists");
    }
    throw new ConflictError("Already exists");
  }

  if (code === "PGRST116") {
    throw new NotFoundError();
  }

  if (/Not authenticated/i.test(message)) {
    throw new AuthenticationError("Not authenticated");
  }
  if (/Not friends/i.test(message)) {
    throw new AuthorizationError("Not friends");
  }
  if (/Cannot start a conversation with yourself/i.test(message)) {
    throw new ValidationError("Cannot start a conversation with yourself");
  }
  if (/Pin limit reached/i.test(message)) {
    throw new ConflictError("Pin limit reached (3 per conversation)");
  }

  if (!message || looksLikeDatabaseDump(message)) {
    throw new InternalError("Something went wrong");
  }

  throw new InternalError("Something went wrong");
}

export function asInfraError(error: unknown): PostgrestLike | null {
  if (!error || typeof error !== "object") return null;
  return error as PostgrestLike;
}

export function isUniqueViolation(error: unknown): boolean {
  return asInfraError(error)?.code === "23505";
}
