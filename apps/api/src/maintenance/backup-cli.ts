import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../db/client.ts';
import { encryptBackup } from './backupCrypto.ts';
import { BackupStore } from './backupStore.ts';
import { pgCommand } from './pgTools.ts';
import { pinBackupObjects, withBackupLock } from './backupProtection.ts';

const database = openDatabase(process.env.WANWU_MIGRATION_DATABASE_URL ?? '', 'owner'),
  runId = randomUUID();
let directory: string | undefined;
try {
  const keyPath = process.env.WANWU_BACKUP_PUBLIC_KEY_FILE;
  if (!keyPath?.startsWith('/')) throw new Error('new-backup-public-key-required');
  const publicPem = await readFile(keyPath, 'utf8');
  const scratch = await mkdtemp(join(tmpdir(), 'wanwu-encrypted-backup-'));
  directory = scratch;
  await withBackupLock(database.pool, async (lock) => {
    await database.pool.query(
      "INSERT INTO maintenance_runs(id,kind,status) VALUES($1,'backup','running')",
      [runId],
    );
    const dump = pgCommand('pg_dump', process.env.WANWU_MIGRATION_DATABASE_URL!, [
      '--format=custom',
      '--compress=3',
      '--no-owner',
      '--no-privileges',
    ]);
    dump.child.stdin.end();
    const file = join(scratch, 'database.wwb');
    let result;
    try {
      [result] = await Promise.all([encryptBackup(dump.child.stdout, file, publicPem), dump.done]);
    } catch (error) {
      dump.child.kill('SIGTERM');
      throw error;
    }
    const store = new BackupStore();
    const { uploadedAt } = await store.upload(file, result.bytes, result.checksum);
    const protectedObjects = await pinBackupObjects(lock, runId, uploadedAt);
    await lock.query('DELETE FROM backup_object_pins WHERE protected_until<now()');
    const removed = await store.prune();
    const counts = {
      encryptedBytes: result.bytes,
      expiredBackupVersions: removed,
      protectedObjects,
    };
    await database.pool.query(
      "UPDATE maintenance_runs SET status='pass',counts=$2,finished_at=now() WHERE id=$1",
      [runId, JSON.stringify(counts)],
    );
    console.log(JSON.stringify({ kind: 'backup', status: 'pass', ...counts }));
  });
} catch {
  await database.pool
    .query("UPDATE maintenance_runs SET status='failed',finished_at=now() WHERE id=$1", [runId])
    .catch(() => {});
  console.error('Wanwu encrypted backup failed; details suppressed.');
  process.exitCode = 1;
} finally {
  if (directory) await rm(directory, { recursive: true, force: true });
  await database.close();
}
