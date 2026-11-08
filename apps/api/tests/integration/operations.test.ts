import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, generateKeyPairSync, createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { openDatabase } from '../../src/db/client.ts';
import { bootstrap } from '../../src/db/bootstrap.ts';
import { firstAdmin } from '../../src/accounts.ts';
import { Passwords } from '../../src/security.ts';
import { mediaBoss } from '../../src/jobs/mediaQueue.ts';
import { collectGarbage } from '../../src/maintenance/garbageCollection.ts';
import { encryptBackup, decryptBackup } from '../../src/maintenance/backupCrypto.ts';
import { pgCommand } from '../../src/maintenance/pgTools.ts';
import { LocalObjectStore } from '../helpers/localStore.ts';
import { Sources } from '../../src/cloud/sources.ts';
import { Library } from '../../src/cloud/library.ts';
import { Works } from '../../src/cloud/works.ts';
import { CONFIRMATION_VERSION } from '@wanwu-v2/contracts/cloud';
import { DEFAULT_COMPOSE_SETTINGS } from '@wanwu-v2/contracts/work';
import { analyseSamples } from '@wanwu-v2/sound-rules/analysis';
import { pcm16Wave } from '@wanwu-v2/audio-engine/pcm';
import { pinBackupObjects, withBackupLock } from '../../src/maintenance/backupProtection.ts';
import { verifyRestoredMedia } from '../../src/maintenance/restoredMedia.ts';

test(
  'garbage collection and real encrypted PostgreSQL restore are isolated and reference-safe',
  { timeout: 180_000 },
  async (t) => {
    const owner = openDatabase(process.env.WANWU_TEST_OWNER_DATABASE_URL ?? '', 'owner'),
      database = openDatabase(process.env.WANWU_TEST_DATABASE_URL ?? ''),
      directory = await mkdtemp(join(tmpdir(), 'wanwu-ops-test-'));
    const store = await LocalObjectStore.create(),
      boss = mediaBoss(database.pool);
    store.setOrigin('https://127.0.0.1:1');
    let restoreClient: pg.Client | undefined;
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          await owner.pool.query('SELECT 1');
          break;
        } catch {
          if (attempt === 60) throw new Error('test-postgres-unavailable');
          await delay(500);
        }
      }
      await bootstrap(owner.pool, process.env.WANWU_TEST_APP_DB_PASSWORD ?? '');
      const passwords = new Passwords();
      await passwords.ready();
      const account = await firstAdmin(
        owner.db,
        passwords,
        'operations_admin',
        'a disposable operations proof password',
      );
      const actor = {
        id: account.id,
        authVersion: (
          await database.pool.query('SELECT auth_version FROM accounts WHERE id=$1', [account.id])
        ).rows[0].auth_version as number,
        role: account.role,
      };
      const scenario = async (name: string, action: () => Promise<void>) => {
        let completed = false;
        await t.test(name, async () => {
          await action();
          completed = true;
        });
        if (!completed) throw new Error('Dependent operations stopped after a failed check');
      };
      const context = { pool: database.pool, boss, store, origin: 'https://example.invalid' },
        sources = new Sources(context),
        library = new Library(context, sources),
        works = new Works(context);
      const wave = pcm16Wave([
          Float32Array.from({ length: 4800 }, (_, i) => 0.2 * Math.sin(i / 20)),
        ]),
        file = join(directory, 'source.wav');
      await writeFile(file, wave);
      const checksum = createHash('sha256').update(wave).digest('hex'),
        analysis = analyseSamples(
          [Float32Array.from({ length: 4800 }, (_, i) => 0.2 * Math.sin(i / 20))],
          48000,
        );
      const sourceId = `file:${randomUUID()}`,
        original = store.key('originals'),
        playback = store.key('playback');
      const source = {
        id: sourceId,
        kind: 'local-file',
        label: '清理测试',
        durationMs: 100,
        mimeType: 'audio/wav',
        provenance: {
          recordedBy: '测试',
          recordedOn: '2026-10-25',
          place: '本机',
          group: null,
          provenanceUrl: null,
        },
      };
      await database.pool.query(
        `INSERT INTO sources(id,owner_id,metadata,checksum,bytes,status,original_key,playback_key,playback_checksum,analysis,duration_ms)
   VALUES($1,$2,$3,$4,$5,'ready',$6,$7,$4,$8,100)`,
        [
          sourceId,
          account.id,
          JSON.stringify(source),
          checksum,
          wave.length,
          original,
          playback,
          JSON.stringify(analysis),
        ],
      );
      for (const [key, kind] of [
        [original, 'original'],
        [playback, 'playback'],
      ] as const) {
        await store.put(key, file, 'audio/wav');
        await database.pool.query(
          'INSERT INTO stored_objects(object_key,kind,source_id) VALUES($1,$2,$3)',
          [key, kind, sourceId],
        );
      }
      const proof = {
        listened: true,
        suitableForChildren: true,
        statementVersion: CONFIRMATION_VERSION,
      };
      await scenario(
        'a live confirmation cancels collection grace and a work keeps its legal reference after library removal',
        async () => {
          const marked = await collectGarbage(context);
          assert.equal(marked.marked, 2);
          assert.equal(marked.deleted, 0);
          const { entryId } = await library.create(actor, {
            sourceId,
            scope: 'private',
            kind: 'source',
            confirmation: proof,
          });
          assert.equal((await collectGarbage(context)).recovered, 2);
          const id = `work:${randomUUID()}`;
          await works.create(actor, {
            id,
            title: '保留引用',
            arrangement: {
              version: 'arrangement-v1',
              id,
              units: [
                {
                  version: 'sound-v1',
                  id: `unit:${randomUUID()}`,
                  sourceId,
                  name: '声音',
                  maker: null,
                  markerIndex: 0,
                  shape: {},
                  input: 'manual',
                  createdAt: new Date().toISOString(),
                },
              ],
              events: [],
              rows: 3,
              spanSeconds: 30,
              mood: null,
              origin: 'child',
              updatedAt: new Date().toISOString(),
            },
            settings: DEFAULT_COMPOSE_SETTINGS,
          });
          await library.remove(actor, entryId);
          assert.equal((await collectGarbage(context)).marked, 0);
          await works.remove(actor, id, `"${id}:r1"`);
          assert.equal((await collectGarbage(context)).marked, 2);
          await database.pool.query(
            "UPDATE stored_objects SET collect_after=now()-interval '1 second'",
          );
          const backupId = randomUUID();
          await owner.pool.query(
            "INSERT INTO maintenance_runs(id,kind,status) VALUES($1,'backup','running')",
            [backupId],
          );
          await withBackupLock(owner.pool, async (lock) => {
            await assert.rejects(collectGarbage(context), /collection-already-running/);
            assert.equal(await pinBackupObjects(lock, backupId, new Date()), 2);
          });
          assert.equal(
            (await collectGarbage(context)).deleted,
            0,
            'retained backups protect unreferenced media',
          );
          await store.head(original);
          await assert.rejects(
            database.pool.query('DELETE FROM backup_object_pins'),
            (error: unknown) => (error as { code: string }).code === '42501',
          );
          await owner.pool.query(
            "UPDATE backup_object_pins SET protected_until=now()-interval '1 second'",
          );
          assert.equal(
            (await collectGarbage(context)).marked,
            2,
            'a fresh grace period starts after the last backup pin expires',
          );
          await database.pool.query(
            "UPDATE stored_objects SET collect_after=now()-interval '1 second'",
          );
          const removed = await collectGarbage(context);
          assert.equal(removed.deleted, 2);
          assert.equal(removed.failures, 0);
          await assert.rejects(() => store.head(original));
          await assert.rejects(() => store.head(playback));
          assert.equal(
            (await database.pool.query('SELECT status FROM sources WHERE id=$1', [sourceId]))
              .rows[0].status,
            'disabled',
          );
        },
      );
      await scenario(
        'unfinished upload is retained before 24 hours and only its exact expired temporary key is removed',
        async () => {
          const id = `file:${randomUUID()}`;
          await sources.intent(actor, id, {
            source: { ...source, id },
            bytes: wave.length,
            checksum,
          });
          const upload = (
            await database.pool.query('SELECT * FROM uploads WHERE source_id=$1', [id])
          ).rows[0];
          await store.put(upload.temporary_key, file, 'audio/wav');
          assert.equal((await collectGarbage(context)).temporary, 0);
          await store.head(upload.temporary_key);
          await database.pool.query(
            "UPDATE uploads SET expires_at=now()-interval '25 hours' WHERE id=$1",
            [upload.id],
          );
          assert.equal((await collectGarbage(context)).temporary, 1);
          await assert.rejects(() => store.head(upload.temporary_key));
          assert.equal(
            (await database.pool.query('SELECT status FROM sources WHERE id=$1', [id])).rows[0]
              .status,
            'failed',
          );
        },
      );
      await scenario(
        'pg_dump → authenticated encryption → pg_restore into a fresh independent database retains data and audit records',
        async () => {
          // Keep real synthetic audio in the dump so a database-only restore cannot falsely pass.
          const restoredSource = `file:${randomUUID()}`,
            restoredOriginal = store.key('originals'),
            restoredPlayback = store.key('playback');
          await database.pool.query(
            `INSERT INTO sources(id,owner_id,metadata,checksum,bytes,status,original_key,playback_key,playback_checksum,analysis,duration_ms)
            VALUES($1,$2,$3,$4,$5,'ready',$6,$7,$4,$8,100)`,
            [
              restoredSource,
              account.id,
              JSON.stringify({ ...source, id: restoredSource }),
              checksum,
              wave.length,
              restoredOriginal,
              restoredPlayback,
              JSON.stringify(analysis),
            ],
          );
          for (const [key, kind] of [
            [restoredOriginal, 'original'],
            [restoredPlayback, 'playback'],
          ]) {
            await store.put(key!, file, 'audio/wav');
            await database.pool.query(
              'INSERT INTO stored_objects(object_key,kind,source_id) VALUES($1,$2,$3)',
              [key, kind, restoredSource],
            );
          }
          const key = generateKeyPairSync('rsa', {
            modulusLength: 3072,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
          });
          const dump = pgCommand('pg_dump', process.env.WANWU_TEST_OWNER_DATABASE_URL!, [
            '--format=custom',
            '--no-owner',
            '--no-privileges',
          ]);
          dump.child.stdin.end();
          const encrypted = join(directory, 'backup.wwb'),
            plain = join(directory, 'restore.dump');
          await Promise.all([
            encryptBackup(dump.child.stdout, encrypted, key.publicKey),
            dump.done,
          ]);
          await decryptBackup(encrypted, plain, key.privateKey);
          const name = `wanwu_sound_restore_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
          await owner.pool.query(`CREATE DATABASE "${name}" OWNER wanwu_owner`);
          const target = new URL(process.env.WANWU_TEST_OWNER_DATABASE_URL!);
          target.pathname = `/${name}`;
          const restore = pgCommand(
            'pg_restore',
            target.toString(),
            ['--single-transaction', '--exit-on-error', '--no-owner', '--no-privileges'],
            true,
          );
          await Promise.all([pipeline(createReadStream(plain), restore.child.stdin), restore.done]);
          restoreClient = new pg.Client({ connectionString: target.toString() });
          await restoreClient.connect();
          for (const table of [
            'accounts',
            'sources',
            'works',
            'work_source_refs',
            'confirmations',
            'content_audit',
            'maintenance_runs',
          ]) {
            const before = (
              await owner.pool.query(`SELECT count(*)::integer AS count FROM ${table}`)
            ).rows[0].count;
            const after: number = (
              await restoreClient.query(`SELECT count(*)::integer AS count FROM ${table}`)
            ).rows[0].count;
            assert.equal(after, before, table);
          }
          assert.equal(
            (await restoreClient.query('SELECT checksum FROM sources WHERE id=$1', [sourceId]))
              .rows[0].checksum,
            checksum,
          );
          assert.deepEqual(await verifyRestoredMedia(restoreClient, store), { verifiedObjects: 2 });
          await store.remove(restoredPlayback);
          await assert.rejects(
            verifyRestoredMedia(restoreClient, store),
            'a missing audio file must fail the drill',
          );
          const wrong = join(directory, 'wrong.wav');
          await writeFile(wrong, Buffer.from('not the backed-up audio'));
          await store.put(restoredPlayback, wrong, 'audio/wav');
          await assert.rejects(verifyRestoredMedia(restoreClient, store), /checksum-mismatch/);
          await store.remove(restoredPlayback);
          await store.put(restoredPlayback, file, 'audio/wav');
          assert.deepEqual(await verifyRestoredMedia(restoreClient, store), { verifiedObjects: 2 });
          assert.deepEqual(
            await readFile(plain).then((bytes) => bytes.subarray(0, 5)),
            Buffer.from('PGDMP'),
          );
        },
      );
      const memoryEvents = Object.fromEntries(
        (await readFile('/sys/fs/cgroup/memory.events', 'utf8'))
          .trim()
          .split('\n')
          .map((line) => line.split(/\s+/))
          .map(([key, value]) => [key, Number(value)]),
      );
      assert.equal(memoryEvents.oom_kill, 0);
      console.log(
        'WANWU_OPERATIONS_PROOF ' +
          JSON.stringify({
            status: 'pass',
            realPostgresTools: true,
            originalDatabaseUntouchedByRestore: true,
            graceDays: 7,
            temporaryHours: 24,
            backupEncryption: 'AES-256-GCM / RSA-OAEP-SHA256',
            testKeyEphemeral: true,
            memoryPeak: Number(await readFile('/sys/fs/cgroup/memory.peak', 'utf8')),
            memoryEvents,
          }),
      );
    } finally {
      await restoreClient?.end();
      await store.close();
      await owner.close();
      await database.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
