/** Placeholder for login/message/call abuse protection. Phase 1 is a no-op. */

export interface RateLimiter {
  hit(_bucket: string, _userId: string): Promise<void>;
}

export class NoopRateLimiter implements RateLimiter {
  async hit(_bucket: string, _userId: string): Promise<void> {
    /* Phase 1: no throttling. Wire a real limiter in a later phase. */
  }
}
