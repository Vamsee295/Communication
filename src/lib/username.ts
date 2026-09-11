/**
 * Centralized Username System for Ghostline
 *
 * Rules:
 * - 3–30 characters
 * - lowercase letters (a-z), digits (0-9), and underscores (_)
 * - cannot start with an underscore
 * - cannot end with an underscore
 * - no consecutive underscores (e.g. __)
 * - no @ symbol stored in database (stripped during normalization)
 * - case-insensitive globally unique
 * - centralized reserved usernames list
 */

export const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "support",
  "help",
  "security",
  "system",
  "official",
  "ghostline",
  "ghostlineapp",
  "moderator",
  "moderation",
  "staff",
  "root",
  "api",
  "null",
  "undefined",
  "ghost",
  "bot",
  "auth",
  "privacy",
  "terms",
  "login",
  "signup",
  "settings",
  "profile",
  "chats",
  "calls",
  "contacts",
  "devices",
]);

export interface UsernameValidationResult {
  valid: boolean;
  normalized: string;
  reason?: "too_short" | "too_long" | "invalid_format" | "reserved";
  error?: string;
}

/**
 * Normalizes a user-entered username:
 * - Strips leading '@' characters
 * - Trims leading and trailing whitespace
 * - Converts to canonical lowercase
 */
export function normalizeUsername(raw: string): string {
  if (!raw) return "";
  return raw.replace(/^@+/, "").trim().toLowerCase();
}

/**
 * Validates a normalized username according to Ghostline product rules.
 */
export function validateUsername(input: string): UsernameValidationResult {
  const normalized = normalizeUsername(input);

  if (normalized.length === 0) {
    return {
      valid: false,
      normalized,
      reason: "too_short",
      error: "Username cannot be empty",
    };
  }

  if (normalized.length < 3) {
    return {
      valid: false,
      normalized,
      reason: "too_short",
      error: "Username must be at least 3 characters",
    };
  }

  if (normalized.length > 30) {
    return {
      valid: false,
      normalized,
      reason: "too_long",
      error: "Username cannot exceed 30 characters",
    };
  }

  // Must only contain a-z, 0-9, and _
  if (!/^[a-z0-9_]+$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      reason: "invalid_format",
      error: "Username can only contain letters, numbers, and underscores",
    };
  }

  // Cannot start with an underscore
  if (normalized.startsWith("_")) {
    return {
      valid: false,
      normalized,
      reason: "invalid_format",
      error: "Username cannot start with an underscore",
    };
  }

  // Cannot end with an underscore
  if (normalized.endsWith("_")) {
    return {
      valid: false,
      normalized,
      reason: "invalid_format",
      error: "Username cannot end with an underscore",
    };
  }

  // No consecutive underscores
  if (normalized.includes("__")) {
    return {
      valid: false,
      normalized,
      reason: "invalid_format",
      error: "Username cannot contain consecutive underscores",
    };
  }

  // Reserved names check
  if (RESERVED_USERNAMES.has(normalized)) {
    return {
      valid: false,
      normalized,
      reason: "reserved",
      error: "This username is reserved and cannot be claimed",
    };
  }

  return {
    valid: true,
    normalized,
  };
}

/**
 * Generates smart alternative candidate usernames when a requested username is taken.
 * All candidates are pre-validated to ensure format and length validity.
 */
export function generateCandidateSuggestions(baseUsername: string): string[] {
  const normalized = normalizeUsername(baseUsername);
  if (!normalized) return [];

  // Strip trailing numbers from base if needed, or use base directly
  const cleanBase = normalized.slice(0, 20); // ensure room for suffix
  const currentYear = new Date().getFullYear();

  const patterns = [
    `${cleanBase}05`,
    `${cleanBase}_05`,
    `${cleanBase}${currentYear}`,
    `${cleanBase}_${currentYear}`,
    `${cleanBase}01`,
    `${cleanBase}_01`,
    `${cleanBase}123`,
    `${cleanBase}_cse`,
    `${cleanBase}_app`,
    `${cleanBase}_chat`,
    `${cleanBase}99`,
  ];

  const uniqueCandidates = new Set<string>();

  for (const pattern of patterns) {
    const check = validateUsername(pattern);
    if (check.valid && check.normalized !== normalized) {
      uniqueCandidates.add(check.normalized);
    }
  }

  return Array.from(uniqueCandidates).slice(0, 8);
}
