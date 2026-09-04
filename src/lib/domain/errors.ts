/** Provider-independent application errors. UI should display `message` only. */

export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Unauthorized") {
    super("authentication", message, 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "Forbidden") {
    super("authorization", message, 403);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super("validation", message, 400);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super("not_found", message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Already exists") {
    super("conflict", message, 409);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests") {
    super("rate_limit", message, 429);
  }
}

export class InternalError extends AppError {
  constructor(message = "Something went wrong") {
    super("internal", message, 500);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
