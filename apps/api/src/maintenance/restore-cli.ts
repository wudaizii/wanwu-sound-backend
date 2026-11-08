import pg from 'pg';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { decryptBackup } from './backupCrypto.ts';
import { pgCommand } from './pgTools.ts';
import { OssStore, ossConfig } from '../storage/ossStore.ts';
import { verifyRestoredMedia } from './restoredMedia.ts';

// Operator-side only. Refuses production names and nonempty databases. Never drops/replaces a database.
let client: pg.Client | undefined, directory: string | undefined;
try {
  const url = process.env.WANWU_RESTORE_DATABASE_URL ?? '',
    target = new URL(url);
  if (
    !['postgres:', 'postgresql:'].includes(target.protocol) ||
    !/^\/wanwu_sound_restore_[a-f0-9]{8}$/.test(target.pathname) ||
    target.username !== 'wanwu_owner' ||
    !target.password
  )
    throw new Error('Only an isolated restore target is permitted');
  client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  const file = process.argv[2],
    keyPath = process.env.WANWU_BACKUP_PRIVATE_KEY_FILE;
  // A drill without file verification must not be reported as a complete restore.
  const store = new OssStore(ossConfig());
  if (!file || !keyPath?.startsWith('/'))
    throw new Error('encrypted-backup-and-offline-private-key-required');
  await client.connect();
  const tables = (
    await client.query(
      "SELECT count(*)::integer AS count FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')",
    )
  ).rows[0];
  if (tables.count !== 0) throw new Error('restore-target-must-be-empty');
  directory = await mkdtemp(join(tmpdir(), 'wanwu-restore-'));
  const plain = join(directory, 'database.dump');
  await decryptBackup(resolve(file), plain, await readFile(keyPath, 'utf8'));
  const restore = pgCommand(
    'pg_restore',
    url,
    ['--single-transaction', '--exit-on-error', '--no-owner', '--no-privileges'],
    true,
  );
  await Promise.all([pipeline(createReadStream(plain), restore.child.stdin), restore.done]);
  const evidence = (
    await client.query(
      'SELECT (SELECT count(*) FROM accounts)::integer AS accounts,(SELECT count(*) FROM works)::integer AS works,(SELECT count(*) FROM work_snapshots)::integer AS snapshots',
    )
  ).rows[0];
  const media = await verifyRestoredMedia(client, store);
  console.log(JSON.stringify({ kind: 'restore-drill', status: 'pass', ...evidence, ...media }));
} catch {
  console.error('Isolated restore failed; original database was not modified.');
  process.exitCode = 1;
} finally {
  if (directory) await rm(directory, { recursive: true, force: true });
  await client?.end();
}
