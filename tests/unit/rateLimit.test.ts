import { describe, expect, it } from 'vitest';
import { SlidingWindowLimiter } from '../../apps/api/src/lib/rateLimit';

describe('sliding window limiter', () => {
  it('allows N hits per window, blocks the N+1th, and recovers after the window', () => {
    const l = new SlidingWindowLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) expect(l.hit('ip', 1_000 + i).allowed).toBe(true);
    const blocked = l.hit('ip', 1_010);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(l.hit('other-ip', 1_010).allowed).toBe(true); // per-key isolation
    expect(l.hit('ip', 62_000).allowed).toBe(true);
  });
});
