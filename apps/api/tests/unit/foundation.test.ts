import test from 'node:test';
import assert from 'node:assert/strict';
import type { Pool, PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { writeFile, mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  withBackupLock,
  pinBackupObjects,
  BACKUP_RETENTION_DAYS,
  MEDIA_RECOVERY_GRACE_DAYS,
} from '../../src/maintenance/backupProtection.ts';
import { verifyRestoredMedia } from '../../src/maintenance/restoredMedia.ts';
import { auditFoundation } from '../../src/maintenance/foundationAudit.ts';
import { LocalObjectStore } from '../helpers/localStore.ts';
import { buildIdentity, verifyBuildSource } from '../../src/version.ts';

test('backup lock excludes GC throughout dump/upload/pinning and is released on success and failure', async () => {
  for (const fail of [false, true]) {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        return { rows: [{ acquired: true }] };
      },
      release: () => calls.push('release'),
    } as unknown as PoolClient;
    const pool = { connect: async () => client } as Pool;
    const operation = withBackupLock(pool, async () => {
      calls.push('dump-upload-pin');
      if (fail) throw Error('fixture');
      return 'done';
    });
    if (fail) await assert.rejects(operation, /fixture/);
    else assert.equal(await operation, 'done');
    assert.deepEqual(calls, [
      'SELECT pg_try_advisory_lock(728091,4) AS acquired',
      'dump-upload-pin',
      'SELECT pg_advisory_unlock(728091,4)',
      'release',
    ]);
  }
  let ran = false,
    released = false;
  const pool = {
    connect: async () => ({
      query: async () => ({ rows: [{ acquired: false }] }),
      release: () => {
        released = true;
      },
    }),
  } as unknown as Pool;
  await assert.rejects(
    withBackupLock(pool, async () => {
      ran = true;
    }),
    /already-running/,
  );
  assert.equal(ran, false);
  assert.equal(released, true);
});

test('media pins cover the entire backup window plus recovery grace, not just seven days', async () => {
  let parameters: unknown[] = [];
  const client = {
    query: async (_sql: string, values: unknown[]) => {
      parameters = values;
      return { rowCount: 2 };
    },
  } as unknown as PoolClient;
  const time = new Date('2026-11-08T00:00:00Z');
  assert.equal(await pinBackupObjects(client, 'test-id', time), 2);
  assert.equal(
    (parameters[1] as Date).getTime() - time.getTime(),
    (BACKUP_RETENTION_DAYS + MEDIA_RECOVERY_GRACE_DAYS) * 86400_000,
  );
});

test('restored media must exist and match the recorded bytes; temporary recordings are removed', async () => {
  const store = await LocalObjectStore.create(),
    directory = await mkdtemp(join(tmpdir(), 'wanwu-foundation-test-'));
  try {
    const file = join(directory, 'audio'),
      bytes = Buffer.from('synthetic fixture'),
      key = store.key('originals');
    await writeFile(file, bytes);
    await store.put(key, file, 'audio/wav');
    const row = {
      object_key: key,
      checksum: createHash('sha256').update(bytes).digest('hex'),
      version_id: null,
    };
    let dangling = false;
    const database = {
      query: async (sql: string) => ({ rows: sql.startsWith('SELECT\n') ? [{ dangling }] : [row] }),
    } as unknown as Pick<Pool, 'query'>;
    assert.deepEqual(await verifyRestoredMedia(database, store), { verifiedObjects: 1 });
    dangling = true;
    await assert.rejects(verifyRestoredMedia(database, store), /registry-inconsistent/);
    dangling = false;
    row.checksum = '0'.repeat(64);
    await assert.rejects(verifyRestoredMedia(database, store), /checksum-mismatch/);
    await store.remove(key);
    await assert.rejects(verifyRestoredMedia(database, store));
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('foundation audit checks exact migrations, administrators and privilege drift without exposing private data', async () => {
  const folder = new URL('../../migrations/', import.meta.url),
    applied: { name: string; sha256: string }[] = [];
  for (const name of (await readdir(folder)).filter((n) => n.endsWith('.sql')))
    applied.push({
      name,
      sha256: createHash('sha256')
        .update(await readFile(new URL(name, folder)))
        .digest('hex'),
    });
  for (const defect of ['none', 'no-admin', 'grant', 'migration', 'role']) {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes('current_database()'))
          return { rows: [{ name: 'wanwu_sound', role: 'wanwu_owner', version: 170006 }] };
        if (sql.includes('FROM pg_roles')) return { rows: [{ rolsuper: defect === 'role' }] };
        if (sql.includes('has_schema_privilege'))
          return { rows: [{ public_create: defect === 'grant' }] };
        if (sql.includes('FROM _wanwu_migrations'))
          return { rows: defect === 'migration' ? applied.slice(1) : applied };
        if (sql.includes('FROM accounts'))
          return { rows: [{ count: defect === 'no-admin' ? 0 : 1 }] };
        return { rows: [] };
      },
      release: () => {},
    };
    const result = await auditFoundation({ connect: async () => client } as unknown as Pool);
    assert.equal(result.status, defect === 'none' ? 'pass' : 'attention');
    assert.equal(statements[0], 'BEGIN READ ONLY');
    assert.equal(statements.at(-1), 'COMMIT');
    assert.doesNotMatch(JSON.stringify(result), /username|password|cookie|object_key/);
  }
});

test('version identity is image-built, sanitized, and refuses a mismatched release source', () => {
  const env = {
    WANWU_BUILD_COMMIT: 'b'.repeat(40),
    WANWU_BUILD_SOURCE_DIGEST: 'a'.repeat(64),
    WANWU_BUILD_DIRTY: 'false',
    WANWU_SOURCE_DIGEST: 'a'.repeat(64),
  };
  assert.equal(buildIdentity(env).commit, env.WANWU_BUILD_COMMIT);
  assert.equal(buildIdentity(env).dirty, false);
  verifyBuildSource(env);
  assert.throws(
    () => verifyBuildSource({ ...env, WANWU_SOURCE_DIGEST: 'c'.repeat(64) }),
    /does not match/,
  );
  assert.throws(() => verifyBuildSource({ WANWU_SOURCE_DIGEST: 'a'.repeat(64) }));
  assert.deepEqual(
    buildIdentity({ WANWU_BUILD_COMMIT: 'secret-invalid', WANWU_DATABASE_URL: 'do-not-return' }),
    { commit: null, sourceDigest: null, dirty: true, contractVersion: 'v0.6' },
  );
});
