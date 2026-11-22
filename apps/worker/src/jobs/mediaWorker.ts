import { mkdtemp, rm, mkdir, readdir, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { JobWithMetadata } from 'pg-boss';
import type { CloudContext } from '../../../api/src/cloud/context.ts';
import type { MediaJob } from '../../../api/src/jobs/mediaQueue.ts';
import { MEDIA_QUEUE, mediaBoss } from '../../../api/src/jobs/mediaQueue.ts';
import { trustedCatalogue } from '../../../api/src/catalogue.ts';
import type { MediaTools } from '../media/tools.ts';
import { MediaError } from '../media/tools.ts';
import { browserBundle } from '../browser/runner.ts';
import { sourceJob } from './sourceJob.ts';
import { renderJob } from './renderJob.ts';
import { reconcileMedia } from '../../../api/src/jobs/reconcile.ts';
import { settingsStore, settingNumber, inSettings } from '../../../api/src/settings/store.ts';

const terminal = new Set([
  'invalid-media',
  'unsupported-media',
  'too-large',
  'too-long',
  'checksum-mismatch',
  'source-changed',
  'untrusted-example',
  'missing-original',
  'invalid-source-clip',
  'source-disabled',
  'account-disabled',
  'renderer-incompatible',
]);
export async function startMediaWorker(
  context: CloudContext,
  scratchRoot: string,
  baseTools: MediaTools,
) {
  await mkdir(scratchRoot, { recursive: true });
  const guard = await context.pool.connect();
  if (!(await guard.query('SELECT pg_try_advisory_lock(728091,3) AS acquired')).rows[0]?.acquired) {
    guard.release();
    throw new Error('Only one Wanwu media worker may run');
  }
  const boss = mediaBoss(context.pool, true);
  let active: AbortController | null = null,
    stopped = false,
    heartbeat: ReturnType<typeof setInterval> | undefined;
  guard.on('error', () => {
    active?.abort();
    void stop();
  });
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    clearInterval(heartbeat);
    active?.abort();
    await boss.stop({ graceful: true, timeout: 30_000 });
    try {
      await guard.query('SELECT pg_advisory_unlock(728091,3)');
    } finally {
      guard.release();
    }
  };
  try {
    // Only scratch directories made by this worker; the advisory lock excludes another live worker.
    for (const entry of await readdir(scratchRoot, { withFileTypes: true }))
      if (entry.isDirectory() && /^wanwu-job-[A-Za-z0-9_-]{6}$/.test(entry.name))
        await rm(join(scratchRoot, entry.name), { recursive: true, force: true });
    const catalogue = await trustedCatalogue(),
      bundle = await browserBundle();
    await boss.start();
    const beat = async () => {
      await context.pool.query(
        "INSERT INTO runtime_status(component) VALUES('media-worker') ON CONFLICT(component) DO UPDATE SET seen_at=now()",
      );
      await reconcileMedia(context.pool);
    };
    await beat();
    heartbeat = setInterval(() => {
      void beat().catch(() => {
        active?.abort();
        void stop();
      });
    }, 30_000);
    await boss.work<MediaJob>(
      MEDIA_QUEUE,
      { batchSize: 1, includeMetadata: true, pollingIntervalSeconds: 1 },
      async (jobs) => {
        await settingsStore()?.refresh();
        return inSettings(async () => {
          const job = jobs[0] as JobWithMetadata<MediaJob> | undefined;
          if (!job || stopped) return;
          const abort = new AbortController(),
            lease = randomUUID();
          active = abort;
          const started = Date.now();
          console.log(
            JSON.stringify({
              event: 'wanwu-media-start',
              kind: job.data.kind,
              attempt: job.retryCount + 1,
            }),
          );
          const timer = setTimeout(() => abort.abort(), settingNumber('media.timeoutMs')),
            directory = await mkdtemp(join(scratchRoot, 'wanwu-job-'));
          const tools = { ...baseTools, signal: abort.signal };
          try {
            const disk = await statfs(scratchRoot);
            if (disk.bavail * disk.bsize < settingNumber('media.diskReserveBytes'))
              throw new Error('wanwu-scratch-disk-reserve');
            if (job.data.kind === 'source')
              await sourceJob(context, job.data.sourceId, directory, tools, catalogue, lease);
            else if (job.data.kind === 'render')
              await renderJob(
                context,
                job.data.renderId,
                job.id,
                directory,
                tools,
                bundle,
                catalogue,
                lease,
              );
            else throw new MediaError('invalid-media');
          } catch (error) {
            const reason =
              error instanceof MediaError
                ? error.reason
                : abort.signal.aborted
                  ? 'media-timeout'
                  : 'temporarily-unavailable';
            const fatal = terminal.has(reason) || job.retryCount >= job.retryLimit;
            console.log(
              JSON.stringify({
                event: 'wanwu-media-failed',
                kind: job.data.kind,
                reason,
                terminal: fatal,
                elapsedMs: Date.now() - started,
              }),
            );
            if (job.data.kind === 'source')
              await context.pool.query(
                "UPDATE sources SET status=$2,failure=$3,lease_id=NULL,updated_at=now() WHERE id=$1 AND lease_id=$4 AND status='processing'",
                [job.data.sourceId, fatal ? 'failed' : 'queued', reason, lease],
              );
            else
              await context.pool.query(
                "UPDATE render_artifacts SET status=$2,failure=$3,lease_id=NULL,updated_at=now() WHERE id=$1 AND job_id=$4 AND lease_id=$5 AND status='processing'",
                [job.data.renderId, fatal ? 'failed' : 'queued', reason, job.id, lease],
              );
            if (!fatal) throw new Error('media-job-retry');
          } finally {
            clearTimeout(timer);
            active = null;
            await rm(directory, { recursive: true, force: true });
            global.gc?.();
          }
        });
      },
    );
    return { stop, boss };
  } catch (error) {
    await stop();
    throw error;
  }
}
