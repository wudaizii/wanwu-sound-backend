// Spending guard for the built-in model settings: one total per day (Asia/Shanghai). Per-address limits are the
// existing @fastify/rate-limit route option (GUEST_RATE_LIMIT). A visitor's own settings do not use this budget.
export const GUEST_RATE_LIMIT = {};

const day = (now: Date) => new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

export class DailyBudget {
  private date = '';
  private used = 0;
  private readonly limit: number | (() => number);
  private readonly clock: () => Date;
  constructor(limit: number | (() => number), clock: () => Date = () => new Date()) {
    this.limit = limit;
    this.clock = clock;
  }
  take() {
    const today = day(this.clock());
    if (today !== this.date) {
      this.date = today;
      this.used = 0;
    }
    if (this.used >= (typeof this.limit === 'function' ? this.limit() : this.limit)) return false;
    this.used++;
    return true;
  }
  /** Seconds until the budget opens again (next midnight in Asia/Shanghai). */
  retryAfter() {
    const now = this.clock().getTime() + 8 * 3600_000;
    return Math.max(1, Math.ceil((86_400_000 - (now % 86_400_000)) / 1000));
  }
}
