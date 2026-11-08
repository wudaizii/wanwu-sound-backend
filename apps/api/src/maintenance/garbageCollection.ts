import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { CloudContext } from '../cloud/context.ts';
import { transaction } from '../db/transaction.ts';

type ObjectRow = {
  object_key: string;
  source_id: string | null;
  render_id: string | null;
  collect_after: Date | null;
};
/** Every new reference obtains this same source lock. Recheck under it before deleting exact registered keys. */
async function needed(tx: PoolClient, object: ObjectRow) {
  if (
    (
      await tx.query(
        'SELECT 1 FROM backup_object_pins WHERE object_key=$1 AND protected_until>now() LIMIT 1',
        [object.object_key],
      )
    ).rowCount
  )
    return true;
  const sources = (
    await tx.query(
      `SELECT id,catalogue,status FROM sources WHERE original_key=$1 OR playback_key=$1 OR id=$2 ORDER BY id FOR UPDATE`,
      [object.object_key, object.source_id],
    )
  ).rows;
  if (sources.some((source) => ['uploading', 'queued', 'processing'].includes(source.status)))
    return true;
  const attached = sources.filter((source) => source.id !== object.source_id || source.catalogue);
  if (attached.some((source) => source.catalogue)) return true;
  const referenced = (
    await tx.query(
      `SELECT 1 FROM sources s WHERE (s.original_key=$1 OR s.playback_key=$1) AND
  (s.catalogue OR EXISTS(SELECT 1 FROM library_entries l WHERE l.source_id=s.id AND l.removed_at IS NULL AND l.disabled_at IS NULL)
   OR EXISTS(SELECT 1 FROM work_source_refs r JOIN works w ON w.id=r.work_id WHERE r.source_id=s.id AND w.deleted_at IS NULL)) LIMIT 1`,
      [object.object_key],
    )
  ).rowCount;
  if (referenced) return true;
  if (object.render_id) {
    const render = (
      await tx.query(
        `SELECT r.status,r.object_key,w.deleted_at FROM render_artifacts r JOIN works w ON w.id=r.work_id WHERE r.id=$1 FOR UPDATE OF w,r`,
        [object.render_id],
      )
    ).rows[0];
    if (
      render &&
      render.deleted_at === null &&
      (['queued', 'processing'].includes(render.status) || render.object_key === object.object_key)
    )
      return true;
  }
  return false;
}

export async function collectGarbage(context: CloudContext, limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('invalid-gc-batch');
  const lock = await context.pool.connect(),
    counts = { temporary: 0, marked: 0, recovered: 0, deleted: 0, failures: 0 };
  const runId = randomUUID();
  try {
    if (!(await lock.query('SELECT pg_try_advisory_lock(728091,4) AS acquired')).rows[0]?.acquired)
      throw new Error('collection-already-running');
    await context.pool.query(
      "INSERT INTO maintenance_runs(id,kind,status) VALUES($1,'garbage-collection','running')",
      [runId],
    );
    const uploads = (
      await context.pool.query(
        `SELECT id,source_id FROM uploads WHERE temporary_deleted_at IS NULL AND expires_at<now()-interval '24 hours' ORDER BY created_at LIMIT $1`,
        [limit],
      )
    ).rows;
    for (const upload of uploads) {
      try {
        await transaction(context.pool, async (tx) => {
          await tx.query('SELECT id FROM sources WHERE id=$1 FOR UPDATE', [upload.source_id]);
          const current = (
            await tx.query(
              `SELECT * FROM uploads WHERE id=$1 AND temporary_deleted_at IS NULL AND expires_at<now()-interval '24 hours' FOR UPDATE`,
              [upload.id],
            )
          ).rows[0];
          if (!current) return;
          await context.store.remove(current.temporary_key);
          await tx.query('UPDATE uploads SET temporary_deleted_at=now() WHERE id=$1', [upload.id]);
          await tx.query(
            "UPDATE sources SET status='failed',failure='upload-expired',updated_at=now() WHERE id=$1 AND status='uploading'",
            [upload.source_id],
          );
          counts.temporary++;
        });
      } catch {
        counts.failures++;
      }
    }
    const objects = (
      await context.pool.query(
        `SELECT object_key FROM stored_objects WHERE deleted_at IS NULL ORDER BY gc_checked_at NULLS FIRST,created_at LIMIT $1`,
        [limit],
      )
    ).rows;
    for (const candidate of objects) {
      try {
        await transaction(context.pool, async (tx) => {
          // Lock business rows before registry rows, matching source/render completion order.
          const initial = (
            await tx.query<ObjectRow>(
              'SELECT * FROM stored_objects WHERE object_key=$1 AND deleted_at IS NULL',
              [candidate.object_key],
            )
          ).rows[0];
          if (!initial) return;
          const retain = await needed(tx, initial);
          const object = (
            await tx.query<ObjectRow>(
              'SELECT * FROM stored_objects WHERE object_key=$1 AND deleted_at IS NULL FOR UPDATE',
              [candidate.object_key],
            )
          ).rows[0];
          if (!object) return;
          await tx.query('UPDATE stored_objects SET gc_checked_at=now() WHERE object_key=$1', [
            object.object_key,
          ]);
          if (retain) {
            if (object.collect_after) {
              await tx.query('UPDATE stored_objects SET collect_after=NULL WHERE object_key=$1', [
                object.object_key,
              ]);
              counts.recovered++;
            }
            return;
          }
          if (!object.collect_after) {
            await tx.query(
              "UPDATE stored_objects SET collect_after=now()+interval '7 days' WHERE object_key=$1",
              [object.object_key],
            );
            counts.marked++;
            return;
          }
          if (object.collect_after.getTime() > Date.now()) return;
          await context.store.remove(object.object_key);
          await tx.query('UPDATE stored_objects SET deleted_at=now() WHERE object_key=$1', [
            object.object_key,
          ]);
          await tx.query(
            "UPDATE sources SET status='disabled',failure='media-collected',updated_at=now() WHERE (original_key=$1 OR playback_key=$1) AND NOT catalogue",
            [object.object_key],
          );
          counts.deleted++;
        });
      } catch {
        counts.failures++;
      }
    }
    await context.pool.query(
      'DELETE FROM sessions WHERE expires_at<now(); DELETE FROM revoked_sessions WHERE expires_at<now()',
    );
    await context.pool.query(
      'UPDATE maintenance_runs SET status=$2,counts=$3,finished_at=now() WHERE id=$1',
      [runId, counts.failures ? 'failed' : 'pass', JSON.stringify(counts)],
    );
    return counts;
  } catch (error) {
    await context.pool
      .query("UPDATE maintenance_runs SET status='failed',finished_at=now() WHERE id=$1", [runId])
      .catch(() => {});
    throw error;
  } finally {
    try {
      await lock.query('SELECT pg_advisory_unlock(728091,4)');
    } finally {
      lock.release();
    }
  }
}
