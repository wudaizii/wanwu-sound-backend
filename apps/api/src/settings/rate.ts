import { ApiError } from '../errors.ts';
/** Bounded in-process address/credential throttling; global AI admission stays in PostgreSQL. */
export class WindowLimiter {
  private entries = new Map<string, { count: number; until: number }>();
  take(key: string, maximum: number, seconds: number, now = Date.now()) {
    for (const [id, entry] of this.entries) if (entry.until <= now) this.entries.delete(id);
    const id = `${maximum}:${seconds}:${key}`;
    const entry = this.entries.get(id) ?? { count: 0, until: now + seconds * 1000 };
    if (entry.count >= maximum || (!this.entries.has(id) && this.entries.size >= 10000))
      throw new ApiError(429, 'rate-limited', Math.max(1, Math.ceil((entry.until - now) / 1000)));
    entry.count++;
    this.entries.set(id, entry);
  }
}
