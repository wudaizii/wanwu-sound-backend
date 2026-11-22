import { randomUUID } from 'node:crypto';
import { exactObject } from '@wanwu-v2/contracts/account';
import { confirmed, CONFIRMATION_VERSION } from '@wanwu-v2/contracts/cloud';
import type { ShareView, PublishedWorkView } from '@wanwu-v2/contracts/cloud';
import type { Actor, CloudContext } from './context.ts';
import { lockActor, ownedWork, audit } from './context.ts';
import { transaction } from '../db/transaction.ts';
import { randomToken } from '../security.ts';
import { ApiError } from '../errors.ts';
import { settingNumber } from '../settings/store.ts';

export class Shares {
  readonly context: CloudContext;
  constructor(context: CloudContext) {
    this.context = context;
  }
  private view(row: Record<string, any> | undefined): ShareView {
    return row
      ? {
          status: row.status,
          workRevision: row.revision,
          url: row.status === 'revoked' ? null : `${this.context.origin}/share/${row.token}`,
          publishedAt: row.published_at?.toISOString() ?? null,
        }
      : { status: 'none', workRevision: null, url: null, publishedAt: null };
  }
  async get(actor: Actor, id: string) {
    return transaction(this.context.pool, async (tx) => {
      await lockActor(tx, actor);
      await ownedWork(tx, actor, id);
      return this.view(
        (await tx.query('SELECT * FROM publications WHERE work_id=$1', [id])).rows[0],
      );
    });
  }
  async publish(actor: Actor, id: string, body: unknown) {
    if (
      !exactObject(body, ['workRevision', 'confirmation']) ||
      !Number.isSafeInteger(body.workRevision) ||
      (body.workRevision as number) < 1
    )
      throw new ApiError(400, 'invalid-request');
    if (!confirmed(body.confirmation)) throw new ApiError(400, 'confirmation-required');
    return transaction(this.context.pool, async (tx) => {
      await lockActor(tx, actor);
      await ownedWork(tx, actor, id);
      const snapshot = (
        await tx.query('SELECT * FROM work_snapshots WHERE work_id=$1 AND revision=$2', [
          id,
          body.workRevision,
        ])
      ).rows[0];
      if (!snapshot) throw new ApiError(404, 'not-found');
      const sources = await tx.query(
        `SELECT s.id,s.status FROM sources s WHERE s.id IN(SELECT ref->>'id' FROM jsonb_array_elements($1::jsonb) ref) ORDER BY s.id FOR SHARE`,
        [JSON.stringify(snapshot.source_refs)],
      );
      if (
        sources.rows.length !== snapshot.source_refs.length ||
        sources.rows.some((row) => row.status !== 'ready')
      )
        throw new ApiError(409, 'source-not-ready');
      const render = (
        await tx.query('SELECT status FROM render_artifacts WHERE work_id=$1 AND revision=$2', [
          id,
          body.workRevision,
        ])
      ).rows[0];
      if (!render || render.status === 'failed') throw new ApiError(409, 'source-not-ready');
      const old = (await tx.query('SELECT * FROM publications WHERE work_id=$1 FOR UPDATE', [id]))
        .rows[0];
      const confirmation = randomUUID(),
        token = old && old.status !== 'revoked' ? old.token : randomToken();
      await tx.query(
        "INSERT INTO confirmations(id,actor_id,kind,target_id,fingerprint,parameters,statement_version) VALUES($1,$2,'publication',$3,$4,$5,$6)",
        [
          confirmation,
          actor.id,
          id,
          snapshot.input_digest,
          JSON.stringify({ workRevision: body.workRevision }),
          CONFIRMATION_VERSION,
        ],
      );
      const state = render.status === 'ready' ? 'published' : 'pending-render';
      const row = (
        await tx.query(
          `INSERT INTO publications(work_id,revision,token,status,generation,confirmation_id,published_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $4='published' THEN now() ELSE NULL END)
    ON CONFLICT(work_id) DO UPDATE SET revision=excluded.revision,token=excluded.token,status=excluded.status,generation=excluded.generation,
     confirmation_id=excluded.confirmation_id,published_at=excluded.published_at,revoked_at=NULL RETURNING *`,
          [id, body.workRevision, token, state, randomUUID(), confirmation],
        )
      ).rows[0];
      await audit(tx, actor.id, 'publication.confirmed', id);
      return this.view(row);
    });
  }
  async revoke(actor: Actor, id: string, administrator = false) {
    return transaction(this.context.pool, async (tx) => {
      await lockActor(tx, actor, administrator);
      if (!administrator) await ownedWork(tx, actor, id);
      await tx.query(
        "UPDATE publications SET status='revoked',revoked_at=now(),generation=$2 WHERE work_id=$1",
        [id, randomUUID()],
      );
      await audit(
        tx,
        actor.id,
        administrator ? 'publication.admin-revoked' : 'publication.revoked',
        id,
      );
    });
  }
  async publicView(token: string): Promise<PublishedWorkView> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiError(404, 'not-found');
    return transaction(this.context.pool, async (tx) => {
      const initial = (
        await tx.query(
          `SELECT p.work_id,w.owner_id FROM publications p JOIN works w ON w.id=p.work_id WHERE p.token=$1`,
          [token],
        )
      ).rows[0];
      if (!initial) throw new ApiError(404, 'not-found');
      const owner = await tx.query(
        "SELECT id FROM accounts WHERE id=$1 AND status='active' FOR SHARE",
        [initial.owner_id],
      );
      const work = await tx.query(
        'SELECT id FROM works WHERE id=$1 AND deleted_at IS NULL FOR SHARE',
        [initial.work_id],
      );
      if (!owner.rowCount || !work.rowCount) throw new ApiError(404, 'not-found');
      const row = (
        await tx.query(
          `SELECT p.*,s.content,s.source_refs,r.status AS render_status,r.object_key,r.duration_ms FROM publications p
    JOIN works w ON w.id=p.work_id JOIN accounts a ON a.id=w.owner_id
    JOIN work_snapshots s ON s.work_id=p.work_id AND s.revision=p.revision JOIN render_artifacts r ON r.work_id=p.work_id AND r.revision=p.revision
    WHERE p.token=$1 AND p.status='published' AND w.deleted_at IS NULL AND a.status='active' AND r.status='ready'`,
          [token],
        )
      ).rows[0];
      if (!row) throw new ApiError(404, 'not-found');
      const sources = await tx.query(
        `SELECT id,status FROM sources WHERE id IN(SELECT ref->>'id' FROM jsonb_array_elements($1::jsonb) ref) ORDER BY id FOR SHARE`,
        [JSON.stringify(row.source_refs)],
      );
      if (
        sources.rows.length !== row.source_refs.length ||
        sources.rows.some((source) => source.status !== 'ready')
      )
        throw new ApiError(404, 'not-found');
      const current = await tx.query(
        "SELECT work_id FROM publications WHERE token=$1 AND status='published' AND revision=$2 FOR SHARE",
        [token, row.revision],
      );
      if (!current.rowCount) throw new ApiError(404, 'not-found');
      return {
        title: row.content.title,
        publishedAt: row.published_at.toISOString(),
        audio: {
          durationMs: row.duration_ms,
          playback: await this.context.store.playback(
            row.object_key,
            settingNumber('playback.publicSeconds'),
          ),
        },
      };
    });
  }
}
