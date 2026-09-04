import type { AuthUser } from "@/lib/domain/types";

/** Server-side current user. Identity always comes from the verified session, never the client body. */
export class AuthService {
  constructor(private readonly userId: string, private readonly email: string | null = null) {}

  getCurrentUser(): AuthUser {
    return { id: this.userId, email: this.email };
  }
}
