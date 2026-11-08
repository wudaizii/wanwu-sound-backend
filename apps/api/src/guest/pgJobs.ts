import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { PgBoss } from 'pg-boss';
import type { BackgroundResult } from '@wanwu-v2/contracts/background';
import { BACKGROUND_COMPOSE_PROMPT } from '@wanwu-v2/prompts/tasks';
import { transaction } from '../db/transaction.ts';
import { digest } from '../cloud/context.ts';
import { sqlAdapter } from '../jobs/mediaQueue.ts';
import type { BackgroundTask } from './background.ts';
import type { GuestConfig, Provider } from './config.ts';
import type { JobState, JobStore } from './jobs.ts';

export const AI_QUEUE = 'ai-background';
const failed: BackgroundResult = { status: 'unavailable', reason: 'failed' };
const providerDigest = (p: Provider | null) =>
  digest(
    p
      ? {
          baseUrl: p.baseUrl,
          model: p.model,
          builtIn: p.builtIn,
          prompt: BACKGROUND_COMPOSE_PROMPT.version,
        }
      : null,
  );

/** All persisted inputs are explicit contract fields; overrides/unknown properties cannot smuggle keys into JSON. */
function safeBrief(task: BackgroundTask) {
  return JSON.parse(
    JSON.stringify(task.brief, [
      'version',
      'workId',
      'identity',
      'seconds',
      'mood',
      'sounds',
      'n',
      'start',
      'end',
      'pitch',
      'length',
      'contour',
      'intensity',
      'pattern',
      'kind',
      'brightness',
      'attempt',
      'previous',
      'instruments',
      'rules',
      'analysis',
      'shaping',
      'background',
      'mix',
      'orchestration',
      'tempo',
      'metre',
      'mode',
      'tonicShift',
      'progressions',
      'bass',
      'drums',
      'motif',
      'degrees',
      'beats',
      'answer',
      'style',
      'sections',
      'density',
      'register',
      'dynamics',
    ]),
  );
}

/** Durable job records and a separate pg-boss queue; no model credentials ever enter either. */
export class PgBackgroundJobs implements JobStore {
  private timer?: ReturnType<typeof setInterval>;
  readonly pool: Pool;
  readonly boss: PgBoss;
  readonly config: GuestConfig;
  readonly execute: (task: BackgroundTask) => Promise<BackgroundResult>;
  constructor(
    pool: Pool,
    boss: PgBoss,
    config: GuestConfig,
    execute: (task: BackgroundTask) => Promise<BackgroundResult>,
  ) {
    this.pool = pool;
    this.boss = boss;
    this.config = config;
    this.execute = execute;
  }

  async start(run: () => Promise<BackgroundResult>, task: BackgroundTask) {
    const builtin = !task.provider || task.provider.builtIn;
    const brief = safeBrief(task),
      fingerprint = providerDigest(task.provider);
    const input = digest({ step: task.step, brief, provider: fingerprint });
    const result = await transaction(this.pool, async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(728091,8)');
      const kept = (
        await tx.query(
          `SELECT id FROM ai_background_jobs WHERE owner_hash=$1 AND input_digest=$2 AND expires_at>now()
         ORDER BY created_at DESC LIMIT 1`,
          [task.owner, input],
        )
      ).rows[0];
      if (kept) return { id: kept.id as string, fresh: false };
      const pending = (
        await tx.query(
          "SELECT count(*)::int AS n FROM ai_background_jobs WHERE status<>'done' AND expires_at>now()",
        )
      ).rows[0]!.n;
      if (pending >= 100) return null;
      const id = randomUUID();
      await tx.query(
        `INSERT INTO ai_background_jobs(id,owner_hash,input_digest,step,mode,brief,provider_digest)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          id,
          task.owner,
          input,
          task.step,
          builtin ? 'builtin' : 'ephemeral',
          builtin ? JSON.stringify(brief) : null,
          fingerprint,
        ],
      );
      if (builtin) {
        const job = await this.boss.send(
          AI_QUEUE,
          { id },
          { db: sqlAdapter(tx), retryLimit: 0, expireInSeconds: 90, deleteAfterSeconds: 3600 },
        );
        if (!job) throw new Error('ai-job-not-enqueued');
        await tx.query('UPDATE ai_background_jobs SET job_id=$2 WHERE id=$1', [id, job]);
      }
      return { id, fresh: true };
    });
    if (result?.fresh && !builtin) {
      // BYOK: durable status, ephemeral execution. A restart never replays a possibly billed request.
      void this.run(result.id, run).catch(() => {});
    }
    return result?.id ?? null;
  }
  private async run(id: string, operation?: () => Promise<BackgroundResult>) {
    const lease = randomUUID();
    const row = (
      await this.pool.query(
        `UPDATE ai_background_jobs SET status='running',lease_id=$2,deadline=now()+interval '75 seconds'
       WHERE id=$1 AND status='queued' AND expires_at>now() RETURNING *`,
        [id, lease],
      )
    ).rows[0];
    if (!row) return;
    let result: BackgroundResult = failed;
    if (operation) result = await operation().catch(() => failed);
    else if (row.mode === 'builtin') {
      const provider =
        row.step === 'audio-ai'
          ? this.config.music
          : row.step === 'voice-ai'
            ? this.config.audio
            : this.config.language;
      if (providerDigest(provider) === row.provider_digest)
        result = await this.execute({
          owner: row.owner_hash,
          step: row.step,
          brief: row.brief,
          provider,
        }).catch(() => failed);
    }
    await this.pool.query(
      `UPDATE ai_background_jobs SET status='done',result=$3,brief=NULL,lease_id=NULL
       WHERE id=$1 AND lease_id=$2 AND status='running' AND deadline>now() AND expires_at>now()`,
      [id, lease, JSON.stringify(result)],
    );
  }
  async get(id: string, owner: string): Promise<JobState | null> {
    await this.reconcile();
    const row = (
      await this.pool.query(
        'SELECT status,result FROM ai_background_jobs WHERE id=$1 AND owner_hash=$2 AND expires_at>now()',
        [id, owner],
      )
    ).rows[0];
    return !row ? null : row.status === 'done' ? row.result : { status: 'pending' };
  }
  async reconcile() {
    await this.pool.query(
      `UPDATE ai_background_jobs j SET status='done',result=$1,brief=NULL,lease_id=NULL
       WHERE status<>'done' AND (expires_at<=now() OR (status='running' AND deadline<=now())
         OR (mode='ephemeral' AND status='queued' AND created_at<now()-interval '90 seconds')
         OR (mode='builtin' AND EXISTS(SELECT 1 FROM wanwu_jobs.job q
           WHERE q.id=j.job_id AND q.name=$2 AND q.state IN ('failed','cancelled'))))`,
      [JSON.stringify(failed), AI_QUEUE],
    );
    // Keep only short-lived job results; aggregate daily usage has a separate 60-day retention.
    await this.pool.query('DELETE FROM ai_background_jobs WHERE expires_at<now()');
    await this.pool.query(
      "DELETE FROM ai_daily_usage WHERE day<(now() AT TIME ZONE 'Asia/Shanghai')::date-60",
    );
  }
  async listen() {
    await this.reconcile();
    // A queued BYOK job lost its in-memory key. Do not mark other replicas' running calls as failed.
    await this.pool.query(
      `UPDATE ai_background_jobs SET status='done',result=$1 WHERE mode='ephemeral' AND status='queued'
       AND created_at<now()-interval '90 seconds'`,
      [JSON.stringify(failed)],
    );
    await this.boss.work<{ id: string }>(
      AI_QUEUE,
      { batchSize: 1, pollingIntervalSeconds: 1 },
      async (jobs) => {
        for (const job of jobs) await this.run(job.data.id);
      },
    );
    const heartbeat = async () => {
      await this.reconcile();
      await this.pool.query(
        "INSERT INTO runtime_status(component) VALUES('ai-worker') ON CONFLICT(component) DO UPDATE SET seen_at=now()",
      );
    };
    await heartbeat();
    this.timer = setInterval(() => void heartbeat().catch(() => {}), 15_000);
    this.timer.unref();
  }
  async close() {
    if (this.timer) clearInterval(this.timer);
    await this.boss.offWork(AI_QUEUE);
  }
}
