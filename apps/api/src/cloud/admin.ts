import { randomUUID } from 'node:crypto';
import type { Actor, CloudContext } from './context.ts';
import { lockActor, audit } from './context.ts';
import { transaction } from '../db/transaction.ts';
import { ApiError } from '../errors.ts';
import { operationalHealth } from '../maintenance/operationalHealth.ts';

export class ContentAdmin {
  readonly context: CloudContext;
  constructor(context: CloudContext) {
    this.context = context;
  }
  async accounts(actor: Actor, cursor: string | null) {
    const offset = cursor === null ? 0 : /^\d+$/.test(cursor) ? Number(cursor) : NaN;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000)
      throw new ApiError(400, 'invalid-request');
    return transaction(this.context.pool, async (tx) => {
      await lockActor(tx, actor, true);
      const rows = (
        await tx.query(
          'SELECT id,username,nickname,role,status FROM accounts ORDER BY created_at,id LIMIT 51 OFFSET $1',
          [offset],
        )
      ).rows;
      return {
        items: rows.slice(0, 50),
        nextCursor: rows.length > 50 ? String(offset + 50) : null,
      };
    });
  }
  async disableSource(actor: Actor, id: string) {
    return transaction(this.context.pool, async (tx) => {
      await lockActor(tx, actor, true);
      const affected = (
        await tx.query(
          'SELECT id FROM sources WHERE id=$1 OR parent_id=$1 ORDER BY id FOR UPDATE',
          [id],
        )
      ).rows.map((row) => row.id as string);
      if (!affected.length) throw new ApiError(404, 'not-found');
      await tx.query(
        "UPDATE sources SET status='disabled',updated_at=now(),lease_id=NULL WHERE id=ANY($1::text[])",
        [affected],
      );
      await tx.query(
        'UPDATE library_entries SET disabled_at=now(),updated_at=now() WHERE source_id=ANY($1::text[]) AND disabled_at IS NULL',
        [affected],
      );
      await tx.query(
        `UPDATE publications p SET status='revoked',revoked_at=now(),generation=$2 FROM work_snapshots s
   WHERE p.work_id=s.work_id AND p.revision=s.revision AND EXISTS(SELECT 1 FROM jsonb_array_elements(s.source_refs) ref WHERE ref->>'id'=ANY($1::text[])) AND p.status<>'revoked'`,
        [affected, randomUUID()],
      );
      await audit(tx, actor.id, 'source.disabled', id);
    });
  }
  async disableEntry(actor: Actor, id: string) {
    return transaction(this.context.pool, async (tx) => {
      await lockActor(tx, actor, true);
      const entry = (await tx.query('SELECT source_id FROM library_entries WHERE id=$1', [id]))
        .rows[0];
      if (!entry) throw new ApiError(404, 'not-found');
      await tx.query('SELECT id FROM sources WHERE id=$1 FOR UPDATE', [entry.source_id]);
      await tx.query('UPDATE library_entries SET disabled_at=now(),updated_at=now() WHERE id=$1', [
        id,
      ]);
      await audit(tx, actor.id, 'library.disabled', id);
    });
  }
  async status(actor: Actor) {
    return transaction(this.context.pool, async (tx) => {
      await lockActor(tx, actor, true);
      const pending = await tx.query(
        'SELECT status,count(*)::integer AS count FROM render_artifacts GROUP BY status',
      );
      const sources = await tx.query(
        'SELECT status,count(*)::integer AS count FROM sources GROUP BY status',
      );
      const queue = (
        await tx.query(
          "SELECT state,count(*)::integer AS count FROM wanwu_jobs.job WHERE name='media' GROUP BY state",
        )
      ).rows;
      const maintenance = (
        await tx.query(
          'SELECT DISTINCT ON(kind) kind,status,counts,started_at,finished_at FROM maintenance_runs ORDER BY kind,started_at DESC',
        )
      ).rows;
      const worker = (
        await tx.query("SELECT seen_at FROM runtime_status WHERE component='media-worker'")
      ).rows[0];
      return {
        operations: await operationalHealth(tx),
        renders: pending.rows,
        sources: sources.rows,
        queue,
        maintenance,
        worker: {
          seenAt: worker?.seen_at?.toISOString() ?? null,
          healthy: !!worker && Date.now() - worker.seen_at.getTime() < 90_000,
        },
      };
    });
  }
}
