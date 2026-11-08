// In-memory test/local-preview adapter only. Production uses PgBackgroundJobs; no fallback on database failure.
import { randomUUID } from 'node:crypto';
import type { BackgroundResult } from '@wanwu-v2/contracts/background';
import type { BackgroundTask } from './background.ts';

const TTL_MS = 10 * 60_000,
  MAX_JOBS = 2000;
export type JobState = { status: 'pending' } | BackgroundResult;
export interface JobStore {
  start(
    run: () => Promise<BackgroundResult>,
    task: BackgroundTask,
  ): string | null | Promise<string | null>;
  get(id: string, owner: string): JobState | null | Promise<JobState | null>;
}

export class BackgroundJobs {
  private readonly jobs = new Map<string, { state: JobState; expires: number; owner: string }>();
  private readonly clock: () => number;
  constructor(clock: () => number = Date.now) {
    this.clock = clock;
  }
  private prune() {
    const now = this.clock();
    for (const [id, job] of this.jobs) if (job.expires <= now) this.jobs.delete(id);
  }
  /** null when the process already holds too many jobs (the route answers busy). */
  start(run: () => Promise<BackgroundResult>, task?: BackgroundTask): string | null {
    this.prune();
    if (this.jobs.size >= MAX_JOBS) return null;
    const id = randomUUID(),
      expires = this.clock() + TTL_MS;
    const owner = task?.owner ?? 'local-preview';
    this.jobs.set(id, { state: { status: 'pending' }, expires, owner });
    void run()
      .catch((): BackgroundResult => ({ status: 'unavailable', reason: 'failed' }))
      .then((state) => {
        if (this.jobs.has(id)) this.jobs.set(id, { state, expires, owner });
      });
    return id;
  }
  get(id: string, owner = 'local-preview'): JobState | null {
    this.prune();
    const job = this.jobs.get(id);
    return job?.owner === owner ? job.state : null;
  }
}
