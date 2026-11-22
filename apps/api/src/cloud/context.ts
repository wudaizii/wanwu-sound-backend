import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { PgBoss } from 'pg-boss';
import type { ObjectStore } from '../storage/objectStore.ts';
import { ApiError } from '../errors.ts';
import type { SoundAnalysis, SoundSource } from '@wanwu-v2/contracts/sound';
import type { Arrangement } from '@wanwu-v2/contracts/arrangement';
import type { ComposeSettings } from '@wanwu-v2/contracts/work';

export type Actor = { id: string; authVersion: number; role: 'admin' | 'teacher' };
export type CloudContext = { pool: Pool; boss: PgBoss; store: ObjectStore; origin: string };
export type SourceRow = {
  id: string;
  owner_id: string | null;
  catalogue: boolean;
  metadata: SoundSource;
  checksum: string;
  bytes: number;
  status: 'uploading' | 'queued' | 'processing' | 'ready' | 'failed' | 'disabled';
  original_key: string | null;
  original_version: string | null;
  playback_key: string | null;
  playback_checksum: string | null;
  analysis: SoundAnalysis | null;
  duration_ms: number | null;
  failure: string | null;
  parent_id: string | null;
  selection: { startMs: number; endMs: number } | null;
  upload_policy?: { maxBytes: number; maxSeconds: number };
};
export type WorkRow = {
  id: string;
  owner_id: string;
  title: string;
  revision: number;
  state: 'draft' | 'saved';
  arrangement: Arrangement;
  settings: ComposeSettings;
  saved_revision: number | null;
  updated_at: Date;
  deleted_at: Date | null;
};
export const digest = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stable(item)]),
    );
  return value;
}
export async function lockActor(tx: PoolClient, actor: Actor, admin = false) {
  const result = await tx.query(
    "SELECT id FROM accounts WHERE id=$1 AND auth_version=$2 AND status='active' AND ($3::boolean=false OR role='admin') FOR SHARE",
    [actor.id, actor.authVersion, admin],
  );
  if (!result.rowCount)
    throw new ApiError(admin ? 403 : 401, admin ? 'forbidden' : 'needs-account');
}
export async function audit(tx: PoolClient, actorId: string, action: string, targetId: string) {
  await tx.query('INSERT INTO content_audit(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)', [
    randomUUID(),
    actorId,
    action,
    targetId,
  ]);
}
export async function ownedWork(tx: PoolClient, actor: Actor, id: string) {
  const result = await tx.query<WorkRow>(
    'SELECT * FROM works WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL FOR UPDATE',
    [id, actor.id],
  );
  if (!result.rows[0]) throw new ApiError(404, 'not-found');
  return result.rows[0];
}
