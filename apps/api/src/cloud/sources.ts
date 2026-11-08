import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { uploadRequest, MAX_UPLOAD_BYTES, sourceSelection } from '@wanwu-v2/contracts/cloud';
import { exactObject } from '@wanwu-v2/contracts/account';
import type { SourceView } from '@wanwu-v2/contracts/cloud';
import type { Arrangement } from '@wanwu-v2/contracts/arrangement';
import type { Actor, CloudContext, SourceRow } from './context.ts';
import { lockActor, digest } from './context.ts';
import { transaction } from '../db/transaction.ts';
import { ApiError } from '../errors.ts';
import { quotaLock, admit, PLAYBACK_RESERVATION } from './quotas.ts';
import { enqueueMedia } from '../jobs/mediaQueue.ts';

/** New grants need an active entry; an older work can retain only its own existing grant. */
export async function authorizedSource(
  tx: PoolClient,
  actor: Actor,
  id: string,
  workId: string | null = null,
  readRetained = false,
): Promise<SourceRow> {
  const result = await tx.query<SourceRow>(
    `SELECT s.* FROM sources s WHERE s.id=$1 AND s.status<>'disabled' AND
  (s.catalogue OR s.owner_id=$2 OR EXISTS(SELECT 1 FROM library_entries l JOIN accounts a ON a.id=l.owner_id
   WHERE l.source_id=s.id AND (l.scope='teachers' OR l.owner_id=$2) AND l.removed_at IS NULL AND l.disabled_at IS NULL AND a.status='active')
   OR EXISTS(SELECT 1 FROM work_source_refs r JOIN works w ON w.id=r.work_id WHERE r.source_id=s.id AND w.owner_id=$2
    AND w.deleted_at IS NULL AND ($4::boolean OR w.id=$3))) FOR UPDATE OF s`,
    [id, actor.id, workId, readRetained],
  );
  if (!result.rows[0]) throw new ApiError(404, 'not-found');
  return result.rows[0];
}
export async function canonicalSources(tx: PoolClient, actor: Actor, arrangement: Arrangement) {
  const rows = new Map<string, SourceRow>();
  for (const id of [...new Set(arrangement.units.map((unit) => unit.sourceId))].sort()) {
    const source = await authorizedSource(tx, actor, id, arrangement.id);
    if (source.status !== 'ready') throw new ApiError(409, 'source-not-ready');
    rows.set(id, source);
  }
  const canonical = {
    ...arrangement,
    units: arrangement.units.map((unit) => ({
      ...unit,
      analysis: rows.get(unit.sourceId)!.analysis!,
    })),
  };
  for (const event of canonical.events) {
    const unit = canonical.units.find((item) => item.id === event.unitId)!;
    if (event.clip.endMs > rows.get(unit.sourceId)!.duration_ms! + 0.5)
      throw new ApiError(400, 'invalid-request');
  }
  for (const id of rows.keys())
    await tx.query(
      'INSERT INTO work_source_refs(work_id,source_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [arrangement.id, id],
    );
  return {
    arrangement: canonical,
    refs: [...rows.values()].map((row) => ({
      id: row.id,
      checksum: row.checksum,
      playbackChecksum: row.playback_checksum!,
      key: row.playback_key!,
      durationMs: row.duration_ms!,
      catalogue: row.catalogue,
    })),
  };
}
export class Sources {
  readonly context: CloudContext;
  constructor(context: CloudContext) {
    this.context = context;
  }
  async view(row: SourceRow): Promise<SourceView> {
    return {
      source: {
        ...row.metadata,
        kind: row.catalogue ? 'example' : 'uploaded',
        durationMs: row.duration_ms ?? row.metadata.durationMs,
      },
      status: row.status,
      checksum: row.checksum,
      analysis: row.analysis,
      failure: row.failure,
      playback:
        row.status === 'ready' && row.playback_key
          ? await this.context.store.playback(row.playback_key, 300)
          : null,
    };
  }
  async get(actor: Actor, id: string) {
    return transaction(this.context.pool, async (tx) => {
      await lockActor(tx, actor);
      return this.view(await authorizedSource(tx, actor, id, null, true));
    });
  }
  async intent(actor: Actor, id: string, body: unknown) {
    if (exactObject(body, ['parentId', 'selection']))
      return this.catalogueExcerpt(actor, id, body.parentId, body.selection);
    const input = uploadRequest(body);
    if (!input || input.source.id !== id) throw new ApiError(400, 'invalid-request');
    const { pool, store } = this.context;
    const result = await transaction(pool, async (tx) => {
      await lockActor(tx, actor);
      await quotaLock(tx, actor.id);
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [id]);
      const found = await tx.query<SourceRow>('SELECT * FROM sources WHERE id=$1 FOR UPDATE', [id]);
      let row = found.rows[0];
      if (row) {
        if (row.owner_id !== actor.id) throw new ApiError(409, 'id-conflict');
        if (
          row.checksum !== input.checksum ||
          row.bytes !== input.bytes ||
          digest(row.metadata) !== digest(input.source) ||
          digest(row.selection) !== digest(input.selection ?? null)
        )
          throw new ApiError(409, 'source-mismatch');
        if (row.status === 'disabled') throw new ApiError(403, 'forbidden');
        if (row.status !== 'uploading') return { row };
        const live = (
          await tx.query('SELECT 1 FROM uploads WHERE source_id=$1 AND expires_at>now()', [id])
        ).rowCount;
        if (!live) await admit(tx, actor.id, 'source', 0); // Reactivation is a new pending slot, not new storage.
      } else {
        await admit(tx, actor.id, 'source', input.bytes + PLAYBACK_RESERVATION);
        row = (
          await tx.query<SourceRow>(
            'INSERT INTO sources(id,owner_id,metadata,checksum,bytes,selection) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
            [
              id,
              actor.id,
              JSON.stringify(input.source),
              input.checksum,
              input.bytes,
              input.selection ? JSON.stringify(input.selection) : null,
            ],
          )
        ).rows[0]!;
        const final = store.key('originals');
        await tx.query(
          "INSERT INTO uploads(id,source_id,temporary_key,final_key,expires_at) VALUES($1,$2,$3,$4,now()+interval '5 minutes')",
          [randomUUID(), id, store.key('tmp'), final],
        );
        await tx.query(
          "INSERT INTO stored_objects(object_key,kind,source_id) VALUES($1,'original',$2)",
          [final, id],
        );
      }
      const upload = (
        await tx.query<{ id: string; temporary_key: string }>(
          "UPDATE uploads SET expires_at=now()+interval '5 minutes' WHERE source_id=$1 RETURNING id,temporary_key",
          [id],
        )
      ).rows[0]!;
      return { row, upload };
    });
    if (!result.upload) return { status: result.row.status, source: await this.view(result.row) };
    return {
      status: 'uploading',
      intent: {
        uploadId: result.upload.id,
        ...(await store.upload(
          result.upload.temporary_key,
          input.source.mimeType,
          input.checksum,
          input.bytes,
        )),
      },
    };
  }
  private async catalogueExcerpt(actor: Actor, id: string, parentId: unknown, selection: unknown) {
    if (
      typeof parentId !== 'string' ||
      !sourceSelection(selection) ||
      id !== `${parentId}#${selection.startMs}-${selection.endMs}`
    )
      throw new ApiError(400, 'invalid-request');
    return transaction(this.context.pool, async (tx) => {
      await lockActor(tx, actor);
      await quotaLock(tx, actor.id);
      const parent = await authorizedSource(tx, actor, parentId);
      if (
        !parent.catalogue ||
        parent.parent_id ||
        parent.status !== 'ready' ||
        selection.endMs > parent.duration_ms! + 0.5
      )
        throw new ApiError(400, 'invalid-request');
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [id]);
      let row = (await tx.query<SourceRow>('SELECT * FROM sources WHERE id=$1 FOR UPDATE', [id]))
        .rows[0];
      if (!row) {
        await admit(tx, actor.id, 'source', PLAYBACK_RESERVATION);
        const metadata = {
          ...parent.metadata,
          id,
          durationMs: selection.endMs - selection.startMs,
        };
        row = (
          await tx.query<SourceRow>(
            `INSERT INTO sources(id,catalogue,metadata,checksum,bytes,status,original_key,original_version,parent_id,selection,requested_by)
     VALUES($1,true,$2,$3,$4,'queued',$5,$6,$7,$8,$9) RETURNING *`,
            [
              id,
              JSON.stringify(metadata),
              parent.checksum,
              parent.bytes,
              parent.original_key,
              parent.original_version,
              parentId,
              JSON.stringify(selection),
              actor.id,
            ],
          )
        ).rows[0]!;
        await enqueueMedia(this.context.boss, tx, { kind: 'source', sourceId: id });
      }
      if (row.status === 'disabled') throw new ApiError(403, 'forbidden');
      return { status: row.status, source: await this.view(row) };
    });
  }
  async complete(actor: Actor, id: string, uploadId: string) {
    const { pool, store, boss } = this.context;
    return transaction(pool, async (tx) => {
      await lockActor(tx, actor);
      const source = (
        await tx.query<SourceRow>('SELECT * FROM sources WHERE id=$1 AND owner_id=$2 FOR UPDATE', [
          id,
          actor.id,
        ])
      ).rows[0];
      if (!source) throw new ApiError(404, 'not-found');
      if (source.status === 'disabled') throw new ApiError(403, 'forbidden');
      const upload = (
        await tx.query<{ id: string; temporary_key: string; final_key: string; expires_at: Date }>(
          'SELECT * FROM uploads WHERE source_id=$1 AND id=$2 FOR UPDATE',
          [id, uploadId],
        )
      ).rows[0];
      if (!upload) throw new ApiError(400, 'invalid-request');
      if (source.status !== 'uploading') return { status: source.status };
      if (upload.expires_at.getTime() < Date.now()) throw new ApiError(400, 'invalid-request');
      const head = await store.head(upload.temporary_key);
      if (head.bytes !== source.bytes || head.bytes > MAX_UPLOAD_BYTES)
        throw new ApiError(400, 'source-mismatch');
      const frozen = await store.freeze(upload.temporary_key, upload.final_key, head);
      await tx.query(
        "UPDATE sources SET original_key=$2,original_version=$3,status='queued',updated_at=now() WHERE id=$1",
        [id, upload.final_key, frozen.versionId ?? null],
      );
      await tx.query('UPDATE uploads SET completed_at=now() WHERE id=$1', [uploadId]);
      await enqueueMedia(boss, tx, { kind: 'source', sourceId: id });
      return { status: 'queued' };
    });
  }
}
