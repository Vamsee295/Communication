/**
 * Safe authentication error mapping to prevent account/email enumeration.
 * Sensitive provider messages, database errors, and email existence confirmation
 * must NEVER be exposed in the client UI.
 */

export const GENERIC_SIGNUP_ERROR_TITLE = "Something went wrong";
export const GENERIC_SIGNUP_ERROR_MESSAGE =
  "We couldn't create your account. Please check your details and try again.";

export const DUPLICATE_SIGNUP_ERROR = {
  title: "Something went wrong",
  message: "Please verify your details and try again.",
};

export const NETWORK_SIGNUP_ERROR = {
  title: "Something went wrong",
  message: "Please check your connection and try again.",
};

export function getSignupErrorMessage(error: unknown): { title: string; message: string } {
  // Always log raw error for development debugging only
  console.error("[auth signup failure]", error);

  const rawMsg =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message)
        : "";

  const lower = rawMsg.toLowerCase();
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network error") ||
    lower.includes("timeout") ||
    lower.includes("aborterror") ||
    lower.includes("connection refused")
  ) {
    return NETWORK_SIGNUP_ERROR;
  }

  return {
    title: GENERIC_SIGNUP_ERROR_TITLE,
    message: GENERIC_SIGNUP_ERROR_MESSAGE,
  };
}

/**
 * Checks if Supabase returned an existing user account response under
 * "Prevent email enumeration" settings (which returns an obfuscated user with identities: []).
 */
export function isDuplicateUserSignup(
  data: { user?: { identities?: unknown[] } | null } | null | undefined,
): boolean {
  return Boolean(data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0);
}

/**
 * Maps sign-in errors to user-friendly messages without exposing provider or database internals.
 */
export function getSigninErrorMessage(error: unknown): string {
  console.error("[auth signin failure]", error);
  const msg = error instanceof Error ? error.message : "";
  if (
    msg.includes("Invalid login") ||
    msg.includes("invalid_grant") ||
    msg.includes("credentials") ||
    msg.includes("Invalid email or password")
  ) {
    return "Wrong email or password";
  }
  return "Sign in failed. Please check your credentials.";
}
