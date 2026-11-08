import type { Pool, PoolClient } from 'pg';

export const BACKUP_RETENTION_DAYS = 30;
export const MEDIA_RECOVERY_GRACE_DAYS = 7;

/** Serialize the entire dump/upload/pin operation with GC, never with ordinary editing. */
export async function withBackupLock<T>(pool: Pool, action: (lock: PoolClient) => Promise<T>) {
  const lock = await pool.connect();
  let acquired = false;
  try {
    acquired =
      (await lock.query('SELECT pg_try_advisory_lock(728091,4) AS acquired')).rows[0]?.acquired ===
      true;
    if (!acquired) throw new Error('backup-or-collection-already-running');
    return await action(lock);
  } finally {
    try {
      if (acquired) await lock.query('SELECT pg_advisory_unlock(728091,4)');
    } finally {
      lock.release();
    }
  }
}

/** Call after pg_dump and upload, while the GC lock is still held.
 * Pinning every still-live registry object is conservative: it also includes
 * objects created during pg_dump, so no export-snapshot/new-object race is possible.
 */
export async function pinBackupObjects(lock: PoolClient, backupId: string, uploadedAt: Date) {
  if (!Number.isFinite(uploadedAt.getTime())) throw new Error('invalid-backup-time');
  const until = new Date(
    uploadedAt.getTime() + (BACKUP_RETENTION_DAYS + MEDIA_RECOVERY_GRACE_DAYS) * 86400_000,
  );
  const result = await lock.query(
    `INSERT INTO backup_object_pins(backup_id,object_key,protected_until)
     SELECT $1,object_key,$2 FROM stored_objects WHERE deleted_at IS NULL
     ON CONFLICT(backup_id,object_key) DO UPDATE SET protected_until=GREATEST(backup_object_pins.protected_until,excluded.protected_until)`,
    [backupId, until],
  );
  return result.rowCount ?? 0;
}
