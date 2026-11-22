import { randomUUID } from 'node:crypto';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { CloudContext } from '../../../api/src/cloud/context.ts';
import { transaction } from '../../../api/src/db/transaction.ts';
import { workRenderInput } from './renderInput.ts';
import type { TrustedSource } from '../../../api/src/catalogue.ts';
import type { RenderInput } from '@wanwu-v2/audio-engine/render';
import { RENDERER_VERSION, TIMBRE_VERSION } from '@wanwu-v2/audio-engine/version';
import { RULE_VERSIONS } from '@wanwu-v2/sound-rules/rules';
import { openRenderer, renderInBrowser } from '../browser/runner.ts';
import { sha256, fileChecksum, encodeMp3 } from '../media/normalize.ts';
import type { NormalizedSource } from '../media/normalize.ts';
import { MediaError } from '../media/tools.ts';
import type { MediaTools } from '../media/tools.ts';

type Ref = {
  id: string;
  checksum: string;
  playbackChecksum: string;
  key: string;
  durationMs: number;
  catalogue: boolean;
};
export async function renderJob(
  context: CloudContext,
  renderId: string,
  jobId: string,
  scratch: string,
  tools: MediaTools,
  bundle: string,
  catalogue: Map<string, TrustedSource>,
  lease = randomUUID(),
) {
  const started = Date.now(),
    phase = (name: string) =>
      console.log(
        JSON.stringify({
          event: 'wanwu-render-phase',
          phase: name,
          elapsedMs: Date.now() - started,
        }),
      );
  const snapshot = await transaction(context.pool, async (tx) => {
    const initial = (await tx.query('SELECT work_id FROM render_artifacts WHERE id=$1', [renderId]))
      .rows[0];
    if (!initial) return null;
    const work = (
      await tx.query('SELECT * FROM works WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [
        initial.work_id,
      ])
    ).rows[0];
    if (!work) {
      await tx.query(
        "UPDATE render_artifacts SET status='failed',failure='work-deleted',lease_id=NULL,updated_at=now() WHERE id=$1 AND job_id=$2 AND status IN ('queued','processing')",
        [renderId, jobId],
      );
      return null;
    }
    const row = (
      await tx.query(
        `SELECT r.*,s.content,s.source_refs,s.rules,s.renderer_version,s.timbre_version,s.encoding FROM render_artifacts r
   JOIN work_snapshots s ON s.work_id=r.work_id AND s.revision=r.revision WHERE r.id=$1`,
        [renderId],
      )
    ).rows[0];
    if (!row || row.status === 'ready' || row.job_id !== jobId) return null;
    const refs = row.source_refs as Ref[];
    const sources = await tx.query(
      'SELECT id,status FROM sources WHERE id=ANY($1::text[]) ORDER BY id FOR SHARE',
      [refs.map((ref) => ref.id)],
    );
    const blocked =
      sources.rows.length !== refs.length ||
      sources.rows.some((source) => source.status !== 'ready')
        ? 'source-disabled'
        : !(
              await tx.query("SELECT id FROM accounts WHERE id=$1 AND status='active'", [
                work.owner_id,
              ])
            ).rowCount
          ? 'account-disabled'
          : null;
    await tx.query(
      "UPDATE render_artifacts SET status='processing',lease_id=$2,failure=NULL,updated_at=now() WHERE id=$1",
      [renderId, lease],
    );
    return { ...row, blocked };
  });
  if (!snapshot) return;
  if (snapshot.blocked) throw new MediaError(snapshot.blocked);
  if (
    snapshot.renderer_version !== RENDERER_VERSION ||
    snapshot.timbre_version !== TIMBRE_VERSION ||
    Object.keys(RULE_VERSIONS).some(
      (key) => snapshot.rules[key] !== RULE_VERSIONS[key as keyof typeof RULE_VERSIONS],
    )
  )
    throw new MediaError('renderer-incompatible');
  const sources = new Map<string, NormalizedSource>(),
    sourceLimits: Record<string, number> = {},
    sourceFacts: NonNullable<RenderInput['sourceFacts']> = {};
  for (const ref of snapshot.source_refs as Ref[]) {
    const file = join(scratch, `${randomUUID()}.wav`);
    await context.store.download(ref.key, file, 12 * 1024 * 1024, undefined, tools.signal);
    const bytes = (await stat(file)).size;
    if ((await fileChecksum(file)) !== ref.playbackChecksum) throw new MediaError('source-changed');
    if (ref.durationMs > 45_500) {
      if (!ref.catalogue || catalogue.get(ref.id)?.checksum !== ref.checksum)
        throw new MediaError('untrusted-example');
      sourceLimits[ref.id] = 60;
    }
    sourceFacts[ref.id] = {
      checksum: ref.playbackChecksum,
      analysis: snapshot.content.arrangement.units.find(
        (unit: { sourceId: string }) => unit.sourceId === ref.id,
      ).analysis,
    };
    sources.set(ref.id, {
      path: file,
      sourceChecksum: ref.checksum,
      normalizedChecksum: ref.playbackChecksum,
      bytes,
      durationMs: ref.durationMs,
      channels: 2,
      dispose: async () => {},
    });
  }
  phase('derivatives-verified');
  const input = workRenderInput(snapshot.content, snapshot.rules, { sourceLimits, sourceFacts });
  global.gc?.(); // Download/hash buffers are no longer needed while Chromium owns the heavy audio work.
  const { browser, identity } = await openRenderer(),
    abort = () => void browser.close();
  tools.signal?.addEventListener('abort', abort, { once: true });
  let wave: Uint8Array;
  try {
    phase('browser-started');
    const output = await renderInBrowser(browser, bundle, input, sources, 180_000);
    wave = output.wav;
    phase('web-audio-complete');
  } finally {
    tools.signal?.removeEventListener('abort', abort);
    await browser.close();
  }
  tools.signal?.throwIfAborted();
  const wav = join(scratch, 'finished.wav'),
    mp3 = join(scratch, 'finished.mp3');
  await writeFile(wav, wave, { flag: 'wx', mode: 0o600 });
  const result = await encodeMp3(wav, mp3, tools, snapshot.encoding?.mp3Kbps ?? 128),
    key = context.store.key('renders');
  phase('encoded');
  await context.pool.query(
    "INSERT INTO stored_objects(object_key,kind,render_id) VALUES($1,'render',$2)",
    [key, renderId],
  );
  await context.store.put(key, mp3, 'audio/mpeg');
  const checksum = sha256(await readFile(mp3)),
    bytes = (await stat(mp3)).size;
  tools.signal?.throwIfAborted();
  await transaction(context.pool, async (tx) => {
    const work = await tx.query(
      'SELECT id FROM works WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',
      [snapshot.work_id],
    );
    if (!work.rowCount) {
      await tx.query(
        "UPDATE render_artifacts SET status='failed',failure='work-deleted',lease_id=NULL,updated_at=now() WHERE id=$1 AND lease_id=$2",
        [renderId, lease],
      );
      return;
    }
    const refs = snapshot.source_refs as Ref[],
      sources = await tx.query(
        'SELECT id,status FROM sources WHERE id=ANY($1::text[]) ORDER BY id FOR SHARE',
        [refs.map((ref) => ref.id)],
      );
    if (sources.rows.some((source) => source.status !== 'ready'))
      throw new MediaError('source-disabled');
    const updated = await tx.query(
      `UPDATE render_artifacts SET status='ready',object_key=$3,checksum=$4,bytes=$5,duration_ms=$6,lease_id=NULL,updated_at=now()
   ,renderer_runtime=$8 WHERE id=$1 AND lease_id=$2 AND job_id=$7 AND status='processing' RETURNING id`,
      [
        renderId,
        lease,
        key,
        checksum,
        bytes,
        (result.duration ?? 0) * 1000,
        jobId,
        JSON.stringify({
          browserVersion: identity.browserVersion,
          rendererVersion: RENDERER_VERSION,
          timbreVersion: TIMBRE_VERSION,
          imageDigest: process.env.WANWU_RENDERER_IMAGE ?? null,
          sourceDigest: process.env.WANWU_SOURCE_DIGEST ?? null,
        }),
      ],
    );
    if (!updated.rowCount) return;
    // A revoked or superseded request cannot be reactivated by this late job.
    await tx.query(
      `UPDATE publications SET status='published',published_at=now() WHERE work_id=$1 AND revision=$2 AND status='pending-render'`,
      [snapshot.work_id, snapshot.revision],
    );
  });
}
