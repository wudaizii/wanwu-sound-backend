import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { cloudArrangement, cloudSettings, workContent, workEtag } from '@wanwu-v2/contracts/cloud';
import type { WorkContent, WorkRecord, WorkSummary, RenderView } from '@wanwu-v2/contracts/cloud';
import { RULE_VERSIONS } from '@wanwu-v2/sound-rules/rules';
import { RENDERER_VERSION, TIMBRE_VERSION } from '@wanwu-v2/audio-engine/version';
import { LOCAL_INSTRUMENTS } from '@wanwu-v2/audio-engine/instruments';
import { cleanWorkTitle } from '@wanwu-v2/contracts/work';
import { textbookTrack } from '../catalogue.ts';
import { transaction } from '../db/transaction.ts';
import { ApiError } from '../errors.ts';
import { enqueueMedia } from '../jobs/mediaQueue.ts';
import type { Actor, CloudContext, WorkRow } from './context.ts';
import { digest, lockActor, ownedWork } from './context.ts';
import { canonicalSources } from './sources.ts';
import { quotaLock, admit, RENDER_RESERVATION } from './quotas.ts';
import { workFacts } from './workFacts.ts';

const record = (row: WorkRow): WorkRecord => ({
  id: row.id,
  title: row.title,
  arrangement: row.arrangement,
  settings: row.settings,
  revision: row.revision,
  state: row.state,
  savedRevision: row.saved_revision,
  updatedAt: row.updated_at.toISOString(),
});
function matched(row: WorkRow, etag: unknown) {
  if (typeof etag !== 'string') throw new ApiError(428, 'precondition-required');
  if (etag !== workEtag(row.id, row.revision)) throw new ApiError(412, 'version-conflict');
}
function settingsAllowed(settings: WorkContent['settings']) {
  if (
    settings.background.instruments.some(
      (id) => !LOCAL_INSTRUMENTS.some((instrument) => instrument.id === id),
    )
  )
    throw new ApiError(400, 'invalid-request');
  if (settings.inspiration.kind === 'textbook' && !textbookTrack(settings.inspiration.entryId))
    throw new ApiError(400, 'invalid-request');
}
export class Works {
  readonly context: CloudContext;
  constructor(context: CloudContext) {
    this.context = context;
  }
  async create(actor: Actor, body: unknown) {
    const input = workContent(body);
    if (!input) throw new ApiError(400, 'invalid-request');
    settingsAllowed(input.settings);
    return transaction(this.context.pool, async (tx) => {
      await lockActor(tx, actor);
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [input.id]);
      const existing = (
        await tx.query<WorkRow>('SELECT * FROM works WHERE id=$1 FOR UPDATE', [input.id])
      ).rows[0];
      if (existing) {
        if (existing.owner_id !== actor.id || existing.deleted_at)
          throw new ApiError(409, 'id-conflict');
        if (existing.revision !== 1) throw new ApiError(412, 'version-conflict');
        const checked = await canonicalSources(tx, actor, input.arrangement);
        if (
          digest({ ...input, arrangement: checked.arrangement }) !==
          digest({
            id: existing.id,
            title: existing.title,
            arrangement: existing.arrangement,
            settings: existing.settings,
          })
        )
          throw new ApiError(412, 'version-conflict');
        return record(existing);
      }
      await tx.query(
        'INSERT INTO works(id,owner_id,title,arrangement,settings) VALUES($1,$2,$3,$4,$5)',
        [
          input.id,
          actor.id,
          input.title,
          JSON.stringify(input.arrangement),
          JSON.stringify(input.settings),
        ],
      );
      const checked = await canonicalSources(tx, actor, input.arrangement);
      const row = (
        await tx.query<WorkRow>('UPDATE works SET arrangement=$2 WHERE id=$1 RETURNING *', [
          input.id,
          JSON.stringify(checked.arrangement),
        ])
      ).rows[0]!;
      return record(row);
    });
  }
  async get(actor: Actor, id: string, revision: number | null = null) {
    return transaction(this.context.pool, async (tx) => {
      await lockActor(tx, actor);
      const work = await ownedWork(tx, actor, id);
      if (revision === null) {
        if (work.state === 'saved' && work.saved_revision === work.revision) {
          const kept = (
            await tx.query('SELECT content FROM work_snapshots WHERE work_id=$1 AND revision=$2', [
              id,
              work.revision,
            ])
          ).rows[0];
          return {
            ...record(work),
            ...(kept?.content.rendering ? { rendering: kept.content.rendering } : {}),
          };
        }
        return record(work);
      }
      const snapshot = (
        await tx.query(
          'SELECT content,created_at FROM work_snapshots WHERE work_id=$1 AND revision=$2',
          [id, revision],
        )
      ).rows[0];
      if (!snapshot) throw new ApiError(404, 'not-found');
      return {
        ...snapshot.content,
        revision,
        state: 'saved' as const,
        savedRevision: revision,
        updatedAt: snapshot.created_at.toISOString(),
      } as WorkRecord;
    });
  }
  async facts(actor: Actor, id: string, revision: number | null = null) {
    const work = await this.get(actor, id, revision);
    const frozen =
      revision ??
      (work.state === 'saved' && work.savedRevision === work.revision ? work.revision : null);
    if (frozen !== null) {
      const snapshot = (
        await this.context.pool.query(
          'SELECT rules,renderer_version FROM work_snapshots WHERE work_id=$1 AND revision=$2',
          [id, frozen],
        )
      ).rows[0];
      if (
        !snapshot ||
        digest(snapshot.rules) !== digest(RULE_VERSIONS) ||
        snapshot.renderer_version !== RENDERER_VERSION
      )
        throw new ApiError(409, 'version-conflict'); // Never silently describe old rendered music using new timing rules.
    }
    return { work, facts: workFacts(work) };
  }
  async list(actor: Actor, state: 'draft' | 'saved', cursor: string | null) {
    if (cursor !== null && !/^\d+$/.test(cursor)) throw new ApiError(400, 'invalid-request');
    const offset = Number(cursor ?? 0);
    if (!Number.isSafeInteger(offset) || offset > 100_000)
      throw new ApiError(400, 'invalid-request');
    return transaction(this.context.pool, async (tx) => {
      await lockActor(tx, actor);
      const rows = (
        await tx.query<WorkRow>(
          `SELECT * FROM works WHERE owner_id=$1 AND deleted_at IS NULL AND
    (($2='draft' AND state='draft') OR ($2='saved' AND saved_revision IS NOT NULL)) ORDER BY updated_at DESC,id DESC LIMIT 51 OFFSET $3`,
          [actor.id, state, offset],
        )
      ).rows;
      const items: WorkSummary[] = rows.slice(0, 50).map((row) => ({
        id: row.id,
        title: row.title,
        revision: row.revision,
        state: row.state,
        savedRevision: row.saved_revision,
        updatedAt: row.updated_at.toISOString(),
      }));
      return { items, nextCursor: rows.length > 50 ? String(offset + 50) : null };
    });
  }
  async edit(
    actor: Actor,
    id: string,
    kind: 'arrangement' | 'compose-settings' | 'title',
    body: unknown,
    etag: unknown,
  ) {
    const arrangement = kind === 'arrangement' ? cloudArrangement(body) : null,
      settings = kind === 'compose-settings' ? cloudSettings(body) : null;
    const title =
      kind === 'title' &&
      body &&
      typeof body === 'object' &&
      Object.keys(body).length === 1 &&
      'title' in body
        ? body.title
        : null;
    if (
      (kind === 'arrangement' && (!arrangement || arrangement.id !== id)) ||
      (kind === 'compose-settings' && !settings) ||
      (kind === 'title' && (typeof title !== 'string' || cleanWorkTitle(title) !== title))
    )
      throw new ApiError(400, 'invalid-request');
    if (settings) settingsAllowed(settings);
    return transaction(this.context.pool, async (tx) => {
      await lockActor(tx, actor);
      const row = await ownedWork(tx, actor, id);
      matched(row, etag);
      const checked = arrangement ? await canonicalSources(tx, actor, arrangement) : null;
      const updated = (
        await tx.query<WorkRow>(
          `UPDATE works SET arrangement=$2,settings=$3,title=$4,revision=revision+1,state='draft',updated_at=now()
    WHERE id=$1 RETURNING *`,
          [
            id,
            JSON.stringify(checked?.arrangement ?? row.arrangement),
            JSON.stringify(settings ?? row.settings),
            title ?? row.title,
          ],
        )
      ).rows[0]!;
      return record(updated);
    });
  }
  async save(actor: Actor, id: string, body: unknown, etag: unknown) {
    const input = workContent(body);
    if (!input || input.id !== id || !input.arrangement.events.length)
      throw new ApiError(400, 'invalid-request');
    if (input.settings.inspiration.kind === 'teaching-music' && !input.rendering?.textbook)
      throw new ApiError(400, 'invalid-request');
    settingsAllowed(input.settings);
    return transaction(this.context.pool, async (tx) => {
      await lockActor(tx, actor);
      await quotaLock(tx, actor.id);
      const row = await ownedWork(tx, actor, id);
      matched(row, etag);
      const checked = await canonicalSources(tx, actor, input.arrangement);
      const content: WorkContent = { ...input, arrangement: checked.arrangement };
      const same =
        digest({
          id: content.id,
          title: content.title,
          arrangement: content.arrangement,
          settings: content.settings,
        }) ===
        digest({
          id: row.id,
          title: row.title,
          arrangement: row.arrangement,
          settings: row.settings,
        });
      const inputDigest = digest({
        content,
        refs: checked.refs,
        rules: RULE_VERSIONS,
        renderer: RENDERER_VERSION,
        timbre: TIMBRE_VERSION,
      });
      // An unchanged piece keeps its render only while the rules and renderer that made it are still current.
      const current =
        same &&
        (
          await tx.query(
            'SELECT 1 FROM work_snapshots WHERE work_id=$1 AND revision=$2 AND input_digest=$3',
            [id, row.revision, inputDigest],
          )
        ).rowCount === 1;
      if (row.state === 'saved' && row.saved_revision === row.revision && current)
        return {
          work: { ...record(row), ...(content.rendering ? { rendering: content.rendering } : {}) },
          render: await this.renderRow(tx, id, row.revision),
        };
      await admit(tx, actor.id, 'render', RENDER_RESERVATION);
      const revision = row.revision + 1;
      const updated = (
        await tx.query<WorkRow>(
          `UPDATE works SET title=$2,arrangement=$3,settings=$4,revision=$5,state='saved',saved_revision=$5,updated_at=now() WHERE id=$1 RETURNING *`,
          [
            id,
            content.title,
            JSON.stringify(content.arrangement),
            JSON.stringify(content.settings),
            revision,
          ],
        )
      ).rows[0]!;
      await tx.query(
        'INSERT INTO work_snapshots(work_id,revision,content,source_refs,rules,renderer_version,timbre_version,input_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          id,
          revision,
          JSON.stringify(content),
          JSON.stringify(checked.refs),
          JSON.stringify(RULE_VERSIONS),
          RENDERER_VERSION,
          TIMBRE_VERSION,
          inputDigest,
        ],
      );
      const renderId = randomUUID();
      await tx.query(
        "INSERT INTO render_artifacts(id,work_id,revision,input_digest,status) VALUES($1,$2,$3,$4,'queued')",
        [renderId, id, revision, inputDigest],
      );
      const jobId = await enqueueMedia(this.context.boss, tx, { kind: 'render', renderId });
      await tx.query('UPDATE render_artifacts SET job_id=$2 WHERE id=$1', [renderId, jobId]);
      return {
        work: {
          ...record(updated),
          ...(content.rendering ? { rendering: content.rendering } : {}),
        },
        render: await this.renderRow(tx, id, revision),
      };
    });
  }
  private async renderRow(tx: PoolClient, id: string, revision: number): Promise<RenderView> {
    const row = (
      await tx.query('SELECT * FROM render_artifacts WHERE work_id=$1 AND revision=$2', [
        id,
        revision,
      ])
    ).rows[0];
    if (!row) throw new ApiError(404, 'not-found');
    const blocked = await tx.query(
      `SELECT s.id FROM sources s JOIN work_source_refs ref ON ref.source_id=s.id
   WHERE ref.work_id=$1 AND s.status='disabled' AND EXISTS(SELECT 1 FROM work_snapshots snap WHERE snap.work_id=$1 AND snap.revision=$2
    AND snap.source_refs @> jsonb_build_array(jsonb_build_object('id',s.id)))`,
      [id, revision],
    );
    if (blocked.rowCount)
      return {
        workId: id,
        workRevision: revision,
        status: 'failed',
        audioAssetId: null,
        playback: null,
        durationMs: null,
        failure: 'source-disabled',
        retryAfterSeconds: 3,
      };
    return {
      workId: id,
      workRevision: revision,
      status: row.status,
      audioAssetId: row.status === 'ready' ? row.id : null,
      playback:
        row.status === 'ready' ? await this.context.store.playback(row.object_key, 300) : null,
      durationMs: row.duration_ms,
      failure: row.failure,
      retryAfterSeconds: 3,
    };
  }
  async render(actor: Actor, id: string, revision: number | null, retry = false) {
    return transaction(this.context.pool, async (tx) => {
      await lockActor(tx, actor);
      if (retry) await quotaLock(tx, actor.id);
      const work = await ownedWork(tx, actor, id),
        wanted = revision ?? work.saved_revision;
      if (!wanted || wanted > work.revision) throw new ApiError(404, 'not-found');
      const row = await this.renderRow(tx, id, wanted);
      if (retry && row.status === 'failed' && row.failure !== 'source-disabled') {
        await admit(tx, actor.id, 'render', RENDER_RESERVATION);
        const result = (
          await tx.query(
            "UPDATE render_artifacts SET status='queued',failure=NULL,updated_at=now() WHERE work_id=$1 AND revision=$2 RETURNING id",
            [id, wanted],
          )
        ).rows[0]!;
        const job = await enqueueMedia(this.context.boss, tx, {
          kind: 'render',
          renderId: result.id,
        });
        await tx.query('UPDATE render_artifacts SET job_id=$2 WHERE id=$1', [result.id, job]);
        return this.renderRow(tx, id, wanted);
      }
      return row;
    });
  }
  async remove(actor: Actor, id: string, etag: unknown) {
    return transaction(this.context.pool, async (tx) => {
      await lockActor(tx, actor);
      const work = await ownedWork(tx, actor, id);
      matched(work, etag);
      await tx.query(
        'UPDATE works SET deleted_at=now(),updated_at=now(),revision=revision+1 WHERE id=$1',
        [id],
      );
      await tx.query(
        "UPDATE publications SET status='revoked',revoked_at=now(),generation=$2 WHERE work_id=$1",
        [id, randomUUID()],
      );
    });
  }
}
