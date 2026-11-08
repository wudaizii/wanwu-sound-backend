import type { PoolClient } from 'pg';
import { ApiError } from '../errors.ts';

// Conservative admission reservations, not a claim about OSS billing or tested capacity.
export const PLAYBACK_RESERVATION = 12 * 1024 ** 2;
export const RENDER_RESERVATION = 2 * 1024 ** 2;
export function resourceLimits(env: NodeJS.ProcessEnv = process.env) {
  const read = (name: string, fallback: number, max: number) => {
    const value = Number(env[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1 || value > max)
      throw new Error('Invalid Wanwu resource limits');
    return value;
  };
  return {
    storageBytes: read('WANWU_ACCOUNT_STORAGE_BYTES', 1024 ** 3, 100 * 1024 ** 3),
    pendingSources: read('WANWU_ACCOUNT_PENDING_SOURCES', 5, 100),
    pendingRenders: read('WANWU_ACCOUNT_PENDING_RENDERS', 3, 20),
    globalPending: read('WANWU_MEDIA_MAX_PENDING', 50, 1000),
  };
}
export async function quotaLock(tx: PoolClient, owner: string) {
  // All admissions share a global lock before account/work/source locks; concurrent users cannot oversubscribe the queue.
  await tx.query('SELECT pg_advisory_xact_lock(728091,10)');
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`wanwu-quota:${owner}`]);
}
export async function resourceUsage(tx: PoolClient, owner: string) {
  const row = (
    await tx.query(
      `SELECT
      (SELECT COALESCE(sum(CASE o.kind WHEN 'original' THEN s.bytes+
          CASE WHEN EXISTS(SELECT 1 FROM stored_objects p WHERE p.source_id=s.id AND p.kind='playback' AND p.deleted_at IS NULL) THEN 0 ELSE $2 END
        WHEN 'playback' THEN $2 ELSE COALESCE(r.bytes,$3) END),0)
       FROM stored_objects o LEFT JOIN sources s ON s.id=o.source_id
       LEFT JOIN render_artifacts r ON r.id=o.render_id LEFT JOIN works w ON w.id=r.work_id
       WHERE o.deleted_at IS NULL AND (COALESCE(s.owner_id,s.requested_by)=$1 OR w.owner_id=$1))
       + (SELECT count(*)*$2 FROM sources s WHERE s.requested_by=$1 AND s.catalogue AND s.status IN ('queued','processing')
          AND NOT EXISTS(SELECT 1 FROM stored_objects o WHERE o.source_id=s.id AND o.kind='playback' AND o.deleted_at IS NULL))
       + (SELECT count(*)*$3 FROM render_artifacts r JOIN works w ON w.id=r.work_id
          WHERE w.owner_id=$1 AND r.status IN ('queued','processing') AND NOT EXISTS
          (SELECT 1 FROM stored_objects o WHERE o.render_id=r.id AND o.deleted_at IS NULL)) AS bytes,
      (SELECT count(*)::int FROM sources s WHERE COALESCE(owner_id,requested_by)=$1 AND
       (status IN ('queued','processing') OR (status='uploading' AND EXISTS(SELECT 1 FROM uploads u WHERE u.source_id=s.id AND u.expires_at>now())))) AS sources,
      (SELECT count(*)::int FROM render_artifacts r JOIN works w ON w.id=r.work_id WHERE w.owner_id=$1 AND r.status IN ('queued','processing')) AS renders,
      (SELECT count(*) FROM sources s WHERE status IN ('queued','processing') OR
       (status='uploading' AND EXISTS(SELECT 1 FROM uploads u WHERE u.source_id=s.id AND u.expires_at>now())))+
      (SELECT count(*) FROM render_artifacts WHERE status IN ('queued','processing')) AS global_pending`,
      [owner, PLAYBACK_RESERVATION, RENDER_RESERVATION],
    )
  ).rows[0]!;
  return {
    reservedBytes: Number(row.bytes),
    pendingSources: row.sources as number,
    pendingRenders: row.renders as number,
    globalPending: Number(row.global_pending),
  };
}
export async function admit(
  tx: PoolClient,
  owner: string,
  kind: 'source' | 'render',
  bytes: number,
) {
  const usage = await resourceUsage(tx, owner),
    limits = resourceLimits();
  if (usage.reservedBytes + bytes > limits.storageBytes) throw new ApiError(413, 'too-large');
  if (
    usage.globalPending >= limits.globalPending ||
    (kind === 'source'
      ? usage.pendingSources >= limits.pendingSources
      : usage.pendingRenders >= limits.pendingRenders)
  )
    throw new ApiError(429, 'rate-limited', 60);
}
