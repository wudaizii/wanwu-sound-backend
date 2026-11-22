import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readPcm16Wave, RENDER_SAMPLE_RATE } from '@wanwu-v2/audio-engine/pcm';
import {
  INPUT_FLAGS,
  MAX_SOURCE_BYTES,
  MAX_SOURCE_SECONDS,
  MediaError,
  runMediaTool,
} from './tools.ts';
import type { MediaTools } from './tools.ts';
import { probeAudio } from './probe.ts';

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export async function fileChecksum(file: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file, { highWaterMark: 64 * 1024 }))
    hash.update(chunk as Buffer);
  return hash.digest('hex');
}
export type NormalizedSource = {
  path: string;
  sourceChecksum: string;
  normalizedChecksum: string;
  bytes: number;
  durationMs: number;
  channels: number;
  dispose: () => Promise<void>;
};

/** Works on already-downloaded local bytes. No URL input, in-place edits, content moderation or library admission. */
export async function normalizeSource(
  input: string,
  scratch: string,
  tools: MediaTools,
  expectedChecksum?: string,
  trustedLimit = MAX_SOURCE_SECONDS,
): Promise<NormalizedSource> {
  if (!Number.isFinite(trustedLimit) || trustedLimit < 1 || trustedLimit > 60)
    throw new MediaError('invalid-source-limit');
  const original = resolve(input),
    info = await stat(original);
  if (!info.isFile() || info.size <= 0) throw new MediaError('invalid-media');
  if (info.size > MAX_SOURCE_BYTES) throw new MediaError('too-large');
  const bytes = await readFile(original);
  if (bytes.length > MAX_SOURCE_BYTES) throw new MediaError('too-large');
  const checksum = sha256(bytes);
  if (
    expectedChecksum !== undefined &&
    (!/^[a-f0-9]{64}$/.test(expectedChecksum) || expectedChecksum !== checksum)
  )
    throw new MediaError('checksum-mismatch');
  const probe = await probeAudio(original, tools.ffprobe, tools.signal);
  await mkdir(scratch, { recursive: true });
  const temporary = await mkdtemp(join(resolve(scratch), 'wanwu-media-'));
  const output = join(temporary, `${randomUUID()}.wav`),
    dispose = () => rm(temporary, { recursive: true, force: true });
  try {
    // Decode a small amount beyond the limit to detect excessive real length, never silently trim an accepted source.
    await runMediaTool(
      tools.ffmpeg,
      [
        '-nostdin',
        '-v',
        'error',
        '-n',
        ...INPUT_FLAGS,
        '-threads',
        '1',
        '-i',
        original,
        '-map',
        '0:a:0',
        '-vn',
        '-sn',
        '-dn',
        '-map_metadata',
        '-1',
        '-threads',
        '1',
        '-ar',
        String(RENDER_SAMPLE_RATE),
        '-ac',
        String(probe.channels),
        '-c:a',
        'pcm_s16le',
        '-t',
        String(trustedLimit + 0.01),
        '-f',
        'wav',
        output,
      ],
      60_000,
      tools.signal,
    );
    const canonical = await readFile(output),
      pcm = readPcm16Wave(canonical);
    const durationMs = (pcm.channels[0]!.length / pcm.sampleRate) * 1000;
    if (durationMs > trustedLimit * 1000) throw new MediaError('too-long');
    if (pcm.sampleRate !== RENDER_SAMPLE_RATE || durationMs <= 0)
      throw new MediaError('invalid-media');
    if (sha256(await readFile(original)) !== checksum) throw new MediaError('source-changed');
    return {
      path: output,
      sourceChecksum: checksum,
      normalizedChecksum: sha256(canonical),
      bytes: canonical.length,
      durationMs,
      channels: pcm.channels.length,
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}

/** Caller supplies a new destination; -n prevents replacing an existing result or any original. */
export async function encodeMp3(wave: string, destination: string, tools: MediaTools, kbps = 128) {
  if (!Number.isInteger(kbps) || kbps < 64 || kbps > 320) throw new MediaError('invalid-media');
  if (resolve(wave) === resolve(destination)) throw new MediaError('output-conflict');
  try {
    await stat(destination);
    throw new MediaError('output-exists');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await runMediaTool(
    tools.ffmpeg,
    [
      '-nostdin',
      '-v',
      'error',
      '-n',
      ...INPUT_FLAGS,
      '-threads',
      '1',
      '-i',
      resolve(wave),
      '-map',
      '0:a:0',
      '-vn',
      '-sn',
      '-dn',
      '-map_metadata',
      '-1',
      '-threads',
      '1',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-c:a',
      'libmp3lame',
      '-b:a',
      `${kbps}k`,
      resolve(destination),
    ],
    60_000,
    tools.signal,
  );
  return probeAudio(resolve(destination), tools.ffprobe, tools.signal);
}
