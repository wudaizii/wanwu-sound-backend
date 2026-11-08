import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { ObjectStore } from '../storage/objectStore.ts';

/** Registry-led, bounded HEAD audit. Never lists/deletes a bucket, rewrites a work, or disables a source on a timeout. */
export async function reconcileStorage(
  pool: Pool,
  store: ObjectStore,
  limit = 20,
  budgetMs = 45_000,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || budgetMs < 1 || budgetMs > 60_000)
    throw new Error('invalid-storage-audit-batch');
  const lock = await pool.connect(),
    id = randomUUID(),
    started = Date.now();
  const counts = {
    checked: 0,
    present: 0,
    missing: 0,
    invalid: 0,
    unavailable: 0,
    unregistered: 0,
  };
  let acquired = false;
  try {
    acquired =
      (await lock.query('SELECT pg_try_advisory_lock(728091,9) AS acquired')).rows[0]?.acquired ===
      true;
    if (!acquired) throw new Error('storage-audit-already-running');
    await lock.query(
      "INSERT INTO maintenance_runs(id,kind,status) VALUES($1,'storage-reconcile','running')",
      [id],
    );
    counts.unregistered = Number(
      (
        await lock.query(
          `SELECT (SELECT count(*) FROM sources s WHERE status='ready' AND
        (NOT EXISTS(SELECT 1 FROM stored_objects o WHERE o.object_key=s.original_key AND o.deleted_at IS NULL)
         OR NOT EXISTS(SELECT 1 FROM stored_objects o WHERE o.object_key=s.playback_key AND o.deleted_at IS NULL)))
        +(SELECT count(*) FROM render_artifacts r WHERE status='ready' AND NOT EXISTS
          (SELECT 1 FROM stored_objects o WHERE o.object_key=r.object_key AND o.deleted_at IS NULL)) AS n`,
        )
      ).rows[0]!.n,
    );
    const rows = (
      await lock.query(
        `SELECT o.object_key,o.kind,s.bytes AS source_bytes,r.bytes AS render_bytes FROM stored_objects o
       LEFT JOIN storage_checks c ON c.object_key=o.object_key LEFT JOIN sources s ON s.id=o.source_id
       LEFT JOIN render_artifacts r ON r.id=o.render_id
       WHERE o.deleted_at IS NULL AND
        (EXISTS(SELECT 1 FROM sources s2 WHERE s2.status='ready' AND (s2.original_key=o.object_key OR s2.playback_key=o.object_key))
         OR (r.status='ready' AND r.object_key=o.object_key))
       ORDER BY c.checked_at NULLS FIRST,o.created_at,o.object_key LIMIT $1`,
        [limit],
      )
    ).rows;
    for (const row of rows) {
      if (Date.now() - started >= budgetMs) break;
      let status: 'present' | 'missing' | 'invalid' | 'unavailable' = 'unavailable';
      try {
        const head = await store.head(row.object_key);
        const expected =
          row.kind === 'original'
            ? row.source_bytes
            : row.kind === 'render'
              ? row.render_bytes
              : null;
        status =
          head.bytes > 0 && (expected === null || head.bytes === expected) ? 'present' : 'invalid';
      } catch (error) {
        if ((error as { status?: number }).status === 404) status = 'missing';
      }
      await lock.query(
        `INSERT INTO storage_checks(object_key,status) SELECT object_key,$2 FROM stored_objects WHERE object_key=$1 AND deleted_at IS NULL
         ON CONFLICT(object_key) DO UPDATE SET status=$2,checked_at=now()`,
        [row.object_key, status],
      );
      counts.checked++;
      counts[status]++;
    }
    await lock.query(
      'UPDATE maintenance_runs SET status=$2,counts=$3,finished_at=now() WHERE id=$1',
      [
        id,
        counts.missing + counts.invalid + counts.unavailable + counts.unregistered
          ? 'failed'
          : 'pass',
        JSON.stringify(counts),
      ],
    );
    return counts;
  } catch (error) {
    if (acquired)
      await lock
        .query("UPDATE maintenance_runs SET status='failed',finished_at=now() WHERE id=$1", [id])
        .catch(() => {});
    throw error;
  } finally {
    try {
      if (acquired) await lock.query('SELECT pg_advisory_unlock(728091,9)');
    } finally {
      lock.release();
    }
  }
}
