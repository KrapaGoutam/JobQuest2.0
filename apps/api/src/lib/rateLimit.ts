/**
 * Per-IP sliding-window limiter (Gate 03 tier 2).
 *
 * M1 LIMITATION (documented): this store is in-process memory. On Vercel each
 * function instance has its own memory, so per-IP limits are best-effort there.
 * Gate 03 specifies Upstash Redis for the distributed store; the interface below
 * is the seam for it. Per-ACCOUNT limits are durable (Postgres, user_accounts).
 */
export interface LimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  hit(key: string, now = Date.now()): LimitResult {
    const since = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      return { allowed: false, retryAfterSeconds: Math.ceil((list[0]! + this.windowMs - now) / 1000) };
    }
    list.push(now);
    this.hits.set(key, list);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  reset(): void {
    this.hits.clear();
  }
}
