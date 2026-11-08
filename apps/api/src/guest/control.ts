import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { transaction } from '../db/transaction.ts';
import type { Provider } from './config.ts';
import { DailyBudget } from './limits.ts';
import { GuestFailure } from './net.ts';

export interface CallControl {
  run<T>(provider: Provider, call: () => Promise<T>): Promise<T>;
}

/** Only for isolated tests/dev. Production always uses the shared PostgreSQL guard. */
export class MemoryCallControl implements CallControl {
  private active = 0;
  readonly budget: DailyBudget;
  readonly concurrency: number;
  constructor(budget: DailyBudget, concurrency = 2) {
    this.budget = budget;
    this.concurrency = concurrency;
  }
  async run<T>(provider: Provider, call: () => Promise<T>) {
    if (this.active >= this.concurrency || (provider.builtIn && !this.budget.take()))
      throw new GuestFailure('quota');
    this.active++;
    try {
      return await call();
    } finally {
      this.active--;
    }
  }
}

/** Short transactions only; never hold a database connection across a model HTTP call. */
export class PgCallControl implements CallControl {
  readonly pool: Pool;
  readonly dailyLimit: number;
  readonly concurrency: number;
  constructor(pool: Pool, dailyLimit: number, concurrency = 2) {
    this.pool = pool;
    this.dailyLimit = dailyLimit;
    this.concurrency = concurrency;
  }
  async run<T>(provider: Provider, call: () => Promise<T>) {
    const lease = randomUUID();
    await transaction(this.pool, async (tx) => {
      // Serialize admission across API replicas, not the network operations themselves.
      await tx.query('SELECT pg_advisory_xact_lock(728091,7)');
      await tx.query('DELETE FROM ai_call_leases WHERE expires_at<=now()');
      const count = (await tx.query('SELECT count(*)::int AS n FROM ai_call_leases')).rows[0]!.n;
      if (count >= this.concurrency) throw new GuestFailure('quota');
      if (provider.builtIn) {
        if (this.dailyLimit < 1) throw new GuestFailure('quota');
        const usage = await tx.query(
          `INSERT INTO ai_daily_usage(day,calls) VALUES((now() AT TIME ZONE 'Asia/Shanghai')::date,1)
           ON CONFLICT(day) DO UPDATE SET calls=ai_daily_usage.calls+1,updated_at=now()
           WHERE ai_daily_usage.calls<$1 RETURNING calls`,
          [this.dailyLimit],
        );
        if (!usage.rowCount) throw new GuestFailure('quota');
      }
      // All adapters have hard total deadlines <=55s. A dead process releases its slot in <=90s.
      await tx.query(
        "INSERT INTO ai_call_leases(id,expires_at) VALUES($1,now()+interval '90 seconds')",
        [lease],
      );
    });
    try {
      return await call();
    } finally {
      await this.pool.query('DELETE FROM ai_call_leases WHERE id=$1', [lease]).catch(() => {});
    }
  }
}
