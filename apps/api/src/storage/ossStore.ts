import OSS from 'ali-oss';
import { settingsEnvironment, settingNumber } from '../settings/store.ts';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ObjectStore, ObjectHead } from './objectStore.ts';

export type OssConfig = {
  bucket: string;
  region: string;
  prefix: string;
  accessKeyId: string;
  accessKeySecret: string;
};
export function ossConfig(env: NodeJS.ProcessEnv = process.env): OssConfig {
  env = settingsEnvironment(env);
  const bucket = env.WANWU_OSS_BUCKET ?? '',
    region = env.WANWU_OSS_REGION ?? '',
    prefix = env.WANWU_OSS_PREFIX ?? '';
  const accessKeyId = env.WANWU_OSS_ACCESS_KEY_ID ?? '',
    accessKeySecret = env.WANWU_OSS_ACCESS_KEY_SECRET ?? '';
  if (
    !/^[a-z0-9][a-z0-9-]{2,62}$/.test(bucket) ||
    !/^oss-[a-z0-9-]+$/.test(region) ||
    !/^wanwu\/(dev|prod)$/.test(prefix) ||
    accessKeyId.length < 16 ||
    accessKeySecret.length < 24
  )
    throw new Error('Dedicated Wanwu OSS configuration is required');
  return { bucket, region, prefix, accessKeyId, accessKeySecret };
}
/** Only server-created names under the new prefix; never any old application's object or arbitrary URL. */
export class OssStore implements ObjectStore {
  private readonly client: OSS;
  private readonly config: OssConfig;
  constructor(config: OssConfig) {
    this.config = config;
    this.client = new OSS({ ...config, secure: true, authorizationV4: true, timeout: 20_000 });
  }
  key(kind: 'tmp' | 'originals' | 'playback' | 'renders') {
    return `${this.config.prefix}/${kind}/${randomUUID()}`;
  }
  private check(key: string) {
    if (
      !key.startsWith(this.config.prefix + '/') ||
      !/^wanwu\/(dev|prod)\/(tmp|originals|playback|renders)\/[a-f0-9-]{36}$/.test(key)
    )
      throw new Error('invalid-object-key');
    return key;
  }
  async upload(key: string, mimeType: string, checksum: string, bytes: number) {
    this.check(key);
    if (!key.includes('/tmp/')) throw new Error('client-write-forbidden');
    const requiredHeaders = {
      'Content-Type': mimeType,
      'x-oss-meta-sha256': checksum,
      'x-oss-forbid-overwrite': 'true',
    };
    // The browser supplies Content-Length from the Blob itself, not setRequestHeader.
    const uploadUrl = await this.client.signatureUrlV4(
      'PUT',
      settingNumber('upload.urlSeconds'),
      { headers: { ...requiredHeaders, 'Content-Length': String(bytes) } },
      key,
      ['content-length'],
    );
    return {
      method: 'PUT' as const,
      uploadUrl,
      requiredHeaders,
      expiresAt: new Date(Date.now() + settingNumber('upload.urlSeconds') * 1000).toISOString(),
    };
  }
  async head(key: string): Promise<ObjectHead> {
    const result = await this.client.head(this.check(key)),
      headers = result.res.headers as Record<string, string | undefined>;
    const bytes = Number(headers['content-length']),
      etag = String(headers.etag ?? '');
    if (!Number.isSafeInteger(bytes) || bytes < 0 || !etag) throw new Error('invalid-object-head');
    return {
      bytes,
      etag,
      ...(headers['x-oss-version-id'] ? { versionId: String(headers['x-oss-version-id']) } : {}),
    };
  }
  async freeze(temporary: string, final: string, head: ObjectHead) {
    this.check(temporary);
    this.check(final);
    if (!temporary.includes('/tmp/') || !final.includes('/originals/'))
      throw new Error('invalid-freeze');
    try {
      const existing = await this.head(final);
      if (existing.bytes !== head.bytes || existing.etag !== head.etag)
        throw new Error('frozen-object-conflict');
      return { versionId: existing.versionId };
    } catch (error) {
      if ((error as { status?: number }).status !== 404) throw error;
    }
    const options = {
      versionId: head.versionId,
      headers: { 'x-oss-copy-source-if-match': head.etag, 'x-oss-forbid-overwrite': 'true' },
    };
    const result = await this.client.copy(final, temporary, options);
    return {
      versionId: (result.res.headers as Record<string, string | undefined>)['x-oss-version-id'],
    };
  }
  async download(
    key: string,
    file: string,
    maxBytes: number,
    versionId?: string,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    const result = await this.client.getStream(this.check(key), {
      ...(versionId ? { versionId } : {}),
      timeout: 30_000,
    });
    let size = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        size += chunk.length;
        done(size > maxBytes ? new Error('object-too-large') : null, chunk);
      },
    });
    await pipeline(result.stream, limit, createWriteStream(file, { flags: 'wx', mode: 0o600 }), {
      signal,
    });
  }
  async put(key: string, file: string, mimeType: string) {
    this.check(key);
    if (key.includes('/tmp/')) throw new Error('invalid-server-write');
    await this.client.put(key, file, {
      mime: mimeType,
      headers: { 'x-oss-forbid-overwrite': 'true', 'Cache-Control': 'private, no-store' },
    });
  }
  async playback(key: string, seconds: number) {
    this.check(key);
    if (key.includes('/tmp/') || key.includes('/originals/'))
      throw new Error('original-playback-forbidden');
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 300)
      throw new Error('invalid-playback-lifetime');
    const url = await this.client.signatureUrlV4('GET', seconds, undefined, key);
    return { url, expiresAt: new Date(Date.now() + seconds * 1000).toISOString() };
  }
  async remove(key: string) {
    this.check(key);
    type Version = { name: string; versionId: string };
    type Page = {
      objects?: Version[];
      deleteMarker?: Version[];
      isTruncated: boolean;
      nextKeyMarker?: string;
      nextVersionIdMarker?: string;
    };
    const versioned = this.client as unknown as {
      getBucketVersions(query: Record<string, string | number>): Promise<Page>;
    };
    const versions: Version[] = [];
    let keyMarker = '',
      versionIdMarker = '';
    for (let page = 0; page < 10; page++) {
      const result = await versioned.getBucketVersions({
        prefix: key,
        maxKeys: 999,
        ...(keyMarker ? { keyMarker, versionIdMarker } : {}),
      });
      versions.push(
        ...[...(result.objects ?? []), ...(result.deleteMarker ?? [])].filter(
          (item) => item.name === key,
        ),
      );
      if (!result.isTruncated) break;
      if (!result.nextKeyMarker || page === 9) throw new Error('object-version-cleanup-incomplete');
      keyMarker = result.nextKeyMarker;
      versionIdMarker = result.nextVersionIdMarker ?? '';
    }
    // Never use a bucket-wide delete or touch a similarly prefixed object's versions.
    for (const item of versions) {
      const options = { versionId: item.versionId, timeout: 20_000 };
      await this.client.delete(key, options);
    }
    if (!versions.length) await this.client.delete(key);
  }
}
