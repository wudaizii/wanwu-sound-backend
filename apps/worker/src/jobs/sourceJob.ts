import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { analyseSamples } from '@wanwu-v2/sound-rules/analysis';
import { readPcm16Wave, pcm16Wave } from '@wanwu-v2/audio-engine/pcm';
import type { CloudContext, SourceRow } from '../../../api/src/cloud/context.ts';
import { transaction } from '../../../api/src/db/transaction.ts';
import type { TrustedSource } from '../../../api/src/catalogue.ts';
import type { MediaTools } from '../media/tools.ts';
import { MediaError } from '../media/tools.ts';
import { normalizeSource, sha256 } from '../media/normalize.ts';

export async function sourceJob(
  context: CloudContext,
  id: string,
  scratch: string,
  tools: MediaTools,
  catalogue: Map<string, TrustedSource>,
  lease = randomUUID(),
) {
  const source = await transaction(context.pool, async (tx) => {
    const row = (await tx.query<SourceRow>('SELECT * FROM sources WHERE id=$1 FOR UPDATE', [id]))
      .rows[0];
    if (!row || row.status === 'ready' || row.status === 'disabled') return null;
    await tx.query(
      "UPDATE sources SET status='processing',lease_id=$2,failure=NULL,updated_at=now() WHERE id=$1",
      [id, lease],
    );
    return row;
  });
  if (!source) return;
  if (!source.original_key) throw new MediaError('missing-original');
  if (
    source.owner_id &&
    !(
      await context.pool.query("SELECT id FROM accounts WHERE id=$1 AND status='active'", [
        source.owner_id,
      ])
    ).rowCount
  )
    throw new MediaError('account-disabled');
  const trusted = catalogue.get(source.parent_id ?? source.id);
  if (source.catalogue && (!trusted || source.checksum !== trusted.checksum))
    throw new MediaError('untrusted-example');
  const original = join(scratch, 'original');
  await context.store.download(
    source.original_key!,
    original,
    20 * 1024 * 1024,
    source.original_version ?? undefined,
    tools.signal,
  );
  const canonical = await normalizeSource(
    original,
    scratch,
    tools,
    source.checksum,
    source.catalogue ? 60 : (source.upload_policy?.maxSeconds ?? 45.5),
  );
  try {
    let bytes = await readFile(canonical.path),
      pcm = readPcm16Wave(bytes),
      path = canonical.path;
    if (source.selection) {
      const from = Math.round((source.selection.startMs / 1000) * pcm.sampleRate),
        to = Math.round((source.selection.endMs / 1000) * pcm.sampleRate);
      if (from < 0 || to > pcm.channels[0]!.length || to - from < 0.2 * pcm.sampleRate)
        throw new MediaError('invalid-source-clip');
      bytes = Buffer.from(
        pcm16Wave(
          pcm.channels.map((channel) => channel.subarray(from, to)),
          pcm.sampleRate,
        ),
      );
      path = join(scratch, 'excerpt.wav');
      await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
      pcm = readPcm16Wave(bytes);
    }
    const analysis = analyseSamples(pcm.channels, pcm.sampleRate),
      key = context.store.key('playback');
    await context.pool.query(
      "INSERT INTO stored_objects(object_key,kind,source_id) VALUES($1,'playback',$2)",
      [key, id],
    );
    await context.store.put(key, path, 'audio/wav');
    tools.signal?.throwIfAborted();
    await transaction(context.pool, async (tx) => {
      await tx.query(
        `UPDATE sources SET status='ready',playback_key=$3,playback_checksum=$4,analysis=$5,duration_ms=$6,lease_id=NULL,updated_at=now()
    WHERE id=$1 AND lease_id=$2 AND status='processing'`,
        [id, lease, key, sha256(bytes), JSON.stringify(analysis), analysis.durationMs],
      );
    });
  } finally {
    await canonical.dispose();
  }
}
