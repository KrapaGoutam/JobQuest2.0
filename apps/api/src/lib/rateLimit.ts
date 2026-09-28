import { sha256Hex } from './tokens';
import { admin } from './db';
import { env } from '../env';

/**
 * Per-IP / per-key limiter (Gate 03 tier 2).
 *
 * M1 used only an in-process store, which is best-effort on serverless because
 * every function instance has its own memory. M1B adds a shared store:
 *  - DbRateLimiter: fixed-window counters in Postgres (public.auth_rate_limits,
 *    via rpc_rate_limit_hit). This is atomic across instances, so it is
 *    distributed-correct.
 *  - SlidingWindowLimiter: the in-memory store, kept for unit tests and local
 *    fallback (RATE_LIMIT_STORE=memory). NOT production-grade.
 * Durable per-ACCOUNT lockouts are separate (user_accounts counters).
 * Keys are hashed before storage, so no raw IP addresses reach the database.
 */
export interface LimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  hit(key: string): Promise<LimitResult>;
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

export class DbRateLimiter implements RateLimiter {
  constructor(
    private readonly name: string,
    private readonly max: () => number,
    private readonly windowSeconds: number,
  ) {}

  async hit(key: string): Promise<LimitResult> {
    const { data, error } = await admin().rpc('rpc_rate_limit_hit', {
      p_bucket: `${this.name}:${sha256Hex(key)}`,
      p_max: this.max(),
      p_window_seconds: this.windowSeconds,
    });
    if (error) throw new Error('rate limiter unavailable'); // fail closed; the route answers 500
    const wait = Number(data ?? 0);
    return { allowed: wait === 0, retryAfterSeconds: wait };
  }
}

class MemoryRateLimiter implements RateLimiter {
  private inner?: SlidingWindowLimiter;
  constructor(
    private readonly max: () => number,
    private readonly windowSeconds: number,
  ) {}
  async hit(key: string): Promise<LimitResult> {
    this.inner ??= new SlidingWindowLimiter(this.max(), this.windowSeconds * 1000);
    return this.inner.hit(key);
  }
  reset(): void {
    this.inner = undefined;
  }
}

export function limiter(name: string, max: () => number, windowSeconds: number): RateLimiter {
  const db = new DbRateLimiter(name, max, windowSeconds);
  const mem = new MemoryRateLimiter(max, windowSeconds);
  return { hit: (key) => (env().RATE_LIMIT_STORE === 'memory' ? mem.hit(key) : db.hit(key)) };
}
