import type { DbClient } from "@/lib/infra/postgres/client";
import { AuthorizationError, ValidationError } from "@/lib/domain/errors";

export type PushSubscriptionInput = { endpoint: string; p256dh: string; auth: string; user_agent?: string };
const key = /^[A-Za-z0-9_-]+$/;

export class PushSubscriptionService {
  constructor(private readonly db: DbClient, private readonly userId: string) {}
  async upsert(input: PushSubscriptionInput) {
    let endpoint: URL;
    try { endpoint = new URL(input.endpoint); } catch { throw new ValidationError("Invalid push endpoint"); }
    if (endpoint.protocol !== "https:" || !key.test(input.p256dh) || !key.test(input.auth) || input.p256dh.length < 40 || input.auth.length < 16) throw new ValidationError("Invalid push subscription");
    await this.db`
      INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
      VALUES (${this.userId}, ${endpoint.toString()}, ${input.p256dh}, ${input.auth}, ${input.user_agent?.slice(0, 512) ?? null})
      ON CONFLICT (endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth,
        user_agent=EXCLUDED.user_agent, updated_at=now()
      WHERE public.push_subscriptions.user_id=${this.userId};
    `;
  }
  async remove(endpoint: string) {
    const rows = await this.db<{ user_id: string }[]>`SELECT user_id FROM public.push_subscriptions WHERE endpoint=${endpoint}`;
    if (rows[0] && rows[0].user_id !== this.userId) throw new AuthorizationError("You cannot remove another user's subscription");
    await this.db`DELETE FROM public.push_subscriptions WHERE endpoint=${endpoint} AND user_id=${this.userId}`;
  }
}
