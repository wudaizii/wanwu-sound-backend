import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Pool, Client } from 'pg';
import type { ObjectStore } from '../storage/objectStore.ts';

/** Operator-side drill: verify the actual bytes, not just a surviving database row or OSS HEAD.
 * Never returns object names, signatures or recordings. Downloads are sequential and removed immediately.
 */
export async function verifyRestoredMedia(
  database: Pick<Pool | Client, 'query'>,
  store: ObjectStore,
) {
  const integrity = (
    await database.query<{ dangling: boolean }>(`SELECT
    EXISTS(SELECT 1 FROM sources s WHERE s.status='ready' AND
      (NOT EXISTS(SELECT 1 FROM stored_objects o WHERE o.object_key=s.original_key AND o.deleted_at IS NULL) OR
       NOT EXISTS(SELECT 1 FROM stored_objects o WHERE o.object_key=s.playback_key AND o.deleted_at IS NULL))) OR
    EXISTS(SELECT 1 FROM render_artifacts r JOIN works w ON w.id=r.work_id
      WHERE r.status='ready' AND w.deleted_at IS NULL AND NOT EXISTS(
        SELECT 1 FROM stored_objects o WHERE o.object_key=r.object_key AND o.deleted_at IS NULL)) AS dangling`)
  ).rows[0];
  if (integrity?.dangling !== false) throw new Error('restore-media-registry-inconsistent');
  const rows = (
    await database.query<{
      object_key: string;
      checksum: string;
      version_id: string | null;
    }>(`SELECT DISTINCT o.object_key,
      CASE o.kind WHEN 'original' THEN s.checksum WHEN 'playback' THEN s.playback_checksum ELSE r.checksum END AS checksum,
      CASE WHEN o.kind='original' THEN s.original_version ELSE NULL END AS version_id
    FROM stored_objects o
    LEFT JOIN sources s ON s.id=o.source_id
    LEFT JOIN render_artifacts r ON r.id=o.render_id
    WHERE o.deleted_at IS NULL AND
      ((o.kind='original' AND s.original_key=o.object_key) OR
       (o.kind='playback' AND s.playback_key=o.object_key) OR
       (o.kind='render' AND r.object_key=o.object_key))`)
  ).rows;
  const directory = await mkdtemp(join(tmpdir(), 'wanwu-restore-media-'));
  let verified = 0;
  try {
    for (const row of rows) {
      if (!/^[a-f0-9]{64}$/.test(row.checksum ?? '')) throw new Error('restore-media-unverifiable');
      const file = join(directory, 'object');
      try {
        await store.download(row.object_key, file, 96 * 1024 * 1024, row.version_id ?? undefined);
        const hash = createHash('sha256');
        for await (const chunk of createReadStream(file)) hash.update(chunk);
        if (hash.digest('hex') !== row.checksum) throw new Error('restore-media-checksum-mismatch');
        verified++;
      } finally {
        await rm(file, { force: true });
      }
    }
    return { verifiedObjects: verified };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
