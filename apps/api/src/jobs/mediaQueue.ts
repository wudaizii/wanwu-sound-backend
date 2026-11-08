import { PgBoss } from 'pg-boss';
import type { Pool, PoolClient } from 'pg';

export const MEDIA_QUEUE = 'media';
export type MediaJob = { kind: 'source'; sourceId: string } | { kind: 'render'; renderId: string };
export function sqlAdapter(connection: Pick<Pool, 'query'> | PoolClient) {
  return { executeSql: async (text: string, values?: unknown[]) => connection.query(text, values) };
}
export function mediaBoss(pool: Pool, worker = false) {
  const boss = new PgBoss({
    db: sqlAdapter(pool),
    schema: 'wanwu_jobs',
    migrate: false,
    supervise: worker,
    schedule: false,
    max: 2,
    application_name: worker ? 'wanwu-media' : 'wanwu-api-queue',
  });
  boss.on('error', () => {
    console.error('Wanwu queue operation failed; details suppressed.');
  });
  return boss;
}
export async function installMediaQueue(pool: Pool) {
  const boss = new PgBoss({
    db: sqlAdapter(pool),
    schema: 'wanwu_jobs',
    schedule: false,
    supervise: false,
  });
  boss.on('error', () => {});
  try {
    await boss.start();
    await boss.createQueue(MEDIA_QUEUE, {
      policy: 'singleton',
      retryLimit: 2,
      retryDelay: 5,
      expireInSeconds: 240,
      deleteAfterSeconds: 7 * 86400,
    });
    // AI is I/O-bound and must never occupy the singleton Chromium/FFmpeg media slot.
    await boss.createQueue('ai-background', {
      policy: 'standard',
      retryLimit: 0,
      expireInSeconds: 90,
      deleteAfterSeconds: 3600,
    });
  } finally {
    await boss.stop();
  }
  await pool.query('REVOKE ALL ON SCHEMA wanwu_jobs FROM PUBLIC');
  await pool.query('GRANT USAGE ON SCHEMA wanwu_jobs TO wanwu_app');
  await pool.query(
    'GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA wanwu_jobs TO wanwu_app',
  );
  await pool.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA wanwu_jobs TO wanwu_app');
}
export async function enqueueMedia(boss: PgBoss, tx: PoolClient, data: MediaJob) {
  const id = await boss.send(MEDIA_QUEUE, data, {
    priority: data.kind === 'source' ? 100 : 0,
    retryLimit: 2,
    retryDelay: 5,
    expireInSeconds: 240,
    db: sqlAdapter(tx),
  });
  if (!id) throw new Error('media-job-not-enqueued');
  return id;
}
