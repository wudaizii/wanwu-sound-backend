import type { Pool, PoolClient } from 'pg';
type Queryable = Pick<Pool | PoolClient, 'query'>;

/** Private aggregate only. Public liveness never exposes operational/account data. */
export async function operationalHealth(db: Queryable) {
  const queues = (
    await db.query(
      `SELECT name,state,count(*)::int AS count,
     COALESCE(max(extract(epoch FROM now()-created_on)) FILTER(WHERE state IN ('created','retry')),0)::int AS oldest
     FROM wanwu_jobs.job WHERE name IN ('media','ai-background') AND
      (state IN ('created','retry','active') OR completed_on>now()-interval '1 hour') GROUP BY name,state`,
    )
  ).rows;
  const heartbeats = (
    await db.query(
      'SELECT component,extract(epoch FROM now()-seen_at)::int AS age FROM runtime_status',
    )
  ).rows;
  const maintenance = (
    await db.query(
      `SELECT DISTINCT ON(kind) kind,status,extract(epoch FROM now()-COALESCE(finished_at,started_at))::int AS age
     FROM maintenance_runs ORDER BY kind,started_at DESC`,
    )
  ).rows;
  const storage = (
    await db.query(
      `SELECT count(*) FILTER(WHERE c.status IN ('missing','invalid'))::int AS broken,
      count(*) FILTER(WHERE c.status='unavailable')::int AS unavailable,
      count(*) FILTER(WHERE c.checked_at IS NULL OR c.checked_at<now()-interval '24 hours')::int AS stale
     FROM stored_objects o LEFT JOIN storage_checks c USING(object_key) WHERE o.deleted_at IS NULL
      AND (EXISTS(SELECT 1 FROM sources s WHERE s.status='ready' AND (s.original_key=o.object_key OR s.playback_key=o.object_key))
       OR EXISTS(SELECT 1 FROM render_artifacts r WHERE r.status='ready' AND r.object_key=o.object_key))`,
    )
  ).rows[0]!;
  const ai = (
    await db.query(
      `SELECT COALESCE((SELECT calls FROM ai_daily_usage WHERE day=(now() AT TIME ZONE 'Asia/Shanghai')::date),0) AS calls_today,
      (SELECT count(*)::int FROM ai_call_leases WHERE expires_at>now()) AS calls_active,
      (SELECT count(*)::int FROM ai_background_jobs WHERE status='running' AND deadline<=now()) AS stalled,
      (SELECT count(*)::int FROM ai_background_jobs WHERE status='done' AND result->>'reason' IN ('failed','timeout')
        AND created_at>now()-interval '10 minutes') AS failures_recent`,
    )
  ).rows[0]!;
  const reasons: string[] = [];
  for (const component of ['media-worker', 'ai-worker'])
    if (!heartbeats.some((h) => h.component === component && h.age < 90))
      reasons.push(`${component}-stale`);
  for (const [kind, max] of [
    ['backup', 26 * 3600],
    ['garbage-collection', 2 * 3600],
    ['storage-reconcile', 3600],
  ] as const)
    if (!maintenance.some((m) => m.kind === kind && m.status === 'pass' && m.age < max))
      reasons.push(`${kind}-overdue-or-failed`);
  for (const name of ['media', 'ai-background']) {
    const rows = queues.filter((q) => q.name === name);
    if (
      rows.filter((q) => ['created', 'retry'].includes(q.state)).reduce((n, q) => n + q.count, 0) >=
        50 ||
      rows.some((q) => q.oldest > 600)
    )
      reasons.push(`${name}-backlog`);
    if (rows.some((q) => q.state === 'failed' && q.count > 0))
      reasons.push(`${name}-recent-failures`);
  }
  if (storage.broken || storage.unavailable || storage.stale) reasons.push('storage-attention');
  if (ai.stalled) reasons.push('ai-stalled');
  if (ai.failures_recent) reasons.push('ai-recent-failures');
  return {
    status: reasons.length ? ('attention' as const) : ('pass' as const),
    reasons,
    queues,
    heartbeats,
    maintenance,
    storage,
    ai,
  };
}
