import OSS from 'ali-oss';
import { randomUUID } from 'node:crypto';
import { ossConfig } from '../storage/ossStore.ts';
import { BACKUP_RETENTION_DAYS } from './backupProtection.ts';

export class BackupStore {
  private readonly client: OSS;
  private readonly prefix: string;
  constructor(env: NodeJS.ProcessEnv = process.env) {
    const config = ossConfig(env);
    this.prefix = `${config.prefix}/backups`;
    this.client = new OSS({ ...config, secure: true, authorizationV4: true, timeout: 60_000 });
  }
  async upload(file: string, bytes: number, checksum: string) {
    const uploadedAt = new Date();
    const key = `${this.prefix}/${uploadedAt.getTime()}-${randomUUID()}.wwb`;
    await this.client.put(key, file, {
      mime: 'application/octet-stream',
      headers: {
        'x-oss-forbid-overwrite': 'true',
        'x-oss-meta-sha256': checksum,
        'Cache-Control': 'private, no-store',
      },
    });
    const head = await this.client.head(key),
      headers = head.res.headers as Record<string, string>;
    if (Number(headers['content-length']) !== bytes || headers['x-oss-meta-sha256'] !== checksum)
      throw new Error('backup-upload-check-failed');
    return { uploadedAt };
  }
  async prune() {
    type Version = { name: string; versionId: string };
    type Page = {
      objects?: Version[];
      deleteMarker?: Version[];
      isTruncated: boolean;
      nextKeyMarker?: string;
      nextVersionIdMarker?: string;
    };
    const versions = this.client as unknown as {
      getBucketVersions(query: Record<string, string | number>): Promise<Page>;
    };
    let keyMarker = '',
      versionIdMarker = '',
      deleted = 0;
    for (let page = 0; page < 10; page++) {
      const result = await versions.getBucketVersions({
        prefix: this.prefix + '/',
        maxKeys: 999,
        ...(keyMarker ? { keyMarker, versionIdMarker } : {}),
      });
      for (const item of [...(result.objects ?? []), ...(result.deleteMarker ?? [])]) {
        const name = item.name.slice(this.prefix.length + 1),
          match = /^(\d{13})-[a-f0-9-]{36}\.wwb$/.exec(name);
        if (
          item.name !== `${this.prefix}/${name}` ||
          !match ||
          Number(match[1]) >= Date.now() - BACKUP_RETENTION_DAYS * 86400_000
        )
          continue;
        const options = { versionId: item.versionId, timeout: 20_000 };
        await this.client.delete(item.name, options);
        deleted++;
      }
      if (!result.isTruncated) return deleted;
      if (!result.nextKeyMarker) throw new Error('incomplete-backup-prune');
      keyMarker = result.nextKeyMarker;
      versionIdMarker = result.nextVersionIdMarker ?? '';
    }
    throw new Error('incomplete-backup-prune');
  }
}
