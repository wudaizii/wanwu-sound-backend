import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { openDatabase } from '../../src/db/client.ts';
import { bootstrap } from '../../src/db/bootstrap.ts';
import { mediaBoss } from '../../src/jobs/mediaQueue.ts';
import { PgCallControl } from '../../src/guest/control.ts';
import { PgBackgroundJobs, AI_QUEUE } from '../../src/guest/pgJobs.ts';
import { runBackground } from '../../src/guest/background.ts';
import type { BackgroundTask } from '../../src/guest/background.ts';
import type { BackgroundResult } from '@wanwu-v2/contracts/background';
import { calmLullaby } from '../../../../packages/prompts/tests/fixtures/briefs.ts';
import { programPlan } from '@wanwu-v2/sound-rules/ai-compose';
import { analyseSamples } from '@wanwu-v2/sound-rules/analysis';
import { pcm16Wave } from '@wanwu-v2/audio-engine/pcm';
import { DEFAULT_COMPOSE_SETTINGS } from '@wanwu-v2/contracts/work';
import { workEtag } from '@wanwu-v2/contracts/cloud';
import { LocalObjectStore } from '../helpers/localStore.ts';
import { Sources } from '../../src/cloud/sources.ts';
import { Works } from '../../src/cloud/works.ts';
import { workFacts } from '../../src/cloud/workFacts.ts';
import { resourceUsage, PLAYBACK_RESERVATION } from '../../src/cloud/quotas.ts';
import { transaction } from '../../src/db/transaction.ts';
import { reconcileStorage } from '../../src/maintenance/storageReconcile.ts';
import { operationalHealth } from '../../src/maintenance/operationalHealth.ts';

test(
  'P1 durable AI, quotas, canonical facts and registry audit on isolated PostgreSQL',
  { timeout: 150_000 },
  async (t) => {
    const owner = openDatabase(process.env.WANWU_TEST_OWNER_DATABASE_URL ?? '', 'owner'),
      database = openDatabase(process.env.WANWU_TEST_DATABASE_URL ?? ''),
      directory = await mkdtemp(join(tmpdir(), 'wanwu-p1-')),
      objects = await LocalObjectStore.create();
    objects.setOrigin('https://127.0.0.1:1');
    const boss = mediaBoss(database.pool);
    let worker: PgBackgroundJobs | undefined;
    const provider = {
      baseUrl: 'https://example.invalid/v1',
      model: 'test-model',
      apiKey: 'synthetic-do-not-persist-key',
      builtIn: true,
    };
    const config = { language: provider, audio: null, music: null, dailyLimit: 100 };
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    let modelCalls = 0;
    const scenario = async (name: string, run: () => Promise<void>) => {
      let passed = false;
      await t.test(name, async () => {
        await run();
        passed = true;
      });
      if (!passed) throw new Error('P1 verification stopped after a failed scenario');
    };
    try {
      for (let i = 0; ; i++) {
        try {
          await owner.pool.query('SELECT 1');
          break;
        } catch {
          if (i === 60) throw new Error('test-postgres-unavailable');
          await delay(500);
        }
      }
      await bootstrap(owner.pool, process.env.WANWU_TEST_APP_DB_PASSWORD ?? '');
      await boss.start();
      await scenario(
        'daily budget is atomic across concurrent clients and new controller instances',
        async () => {
          const outcomes = await Promise.allSettled(
            Array.from({ length: 15 }, () =>
              new PgCallControl(database.pool, 5, 20).run(provider, async () => 1),
            ),
          );
          assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, 5);
          assert.equal(
            (await database.pool.query('SELECT calls FROM ai_daily_usage')).rows[0].calls,
            5,
          );
          await assert.rejects(new PgCallControl(database.pool, 5).run(provider, async () => 1));
          await new PgCallControl(database.pool, 5).run(
            { ...provider, builtIn: false },
            async () => 1,
          );
          assert.equal(
            (await database.pool.query('SELECT calls FROM ai_daily_usage')).rows[0].calls,
            5,
          );
        },
      );
      await scenario(
        'global leases cap simultaneous calls, expire after a dead client, and release on failure',
        async () => {
          const gate = new PgCallControl(database.pool, 100, 2),
            finishes: (() => void)[] = [];
          const held = () =>
            gate.run(
              { ...provider, builtIn: false },
              () => new Promise<void>((r) => finishes.push(r)),
            );
          const one = held(),
            two = held();
          for (let i = 0; finishes.length < 2; i++) {
            if (i > 100) throw new Error('lease-wait');
            await delay(10);
          }
          await assert.rejects(held());
          finishes.forEach((f) => f());
          await Promise.all([one, two]);
          await owner.pool.query(
            "INSERT INTO ai_call_leases VALUES($1,now()-interval '1 second')",
            [randomUUID()],
          );
          await assert.rejects(
            gate.run(provider, async () => {
              throw new Error('fake model failure');
            }),
          );
          assert.equal(
            (await database.pool.query('SELECT count(*)::int AS n FROM ai_call_leases')).rows[0].n,
            0,
          );
        },
      );
      const execute = (task: BackgroundTask) =>
        runBackground(
          task,
          async () => {
            modelCalls++;
            return {
              status: 200,
              json: {
                choices: [{ message: { content: JSON.stringify(programPlan(task.brief)) } }],
              },
            };
          },
          new PgCallControl(database.pool, 100),
        );
      const task: BackgroundTask = {
        owner: hash('session-a'),
        step: 'notes-ai',
        brief: calmLullaby,
        provider,
      };
      let queued = '';
      await scenario(
        'queued built-in task survives a new store, deduplicates, and completes outside the media queue',
        async () => {
          const before = new PgBackgroundJobs(database.pool, boss, config, execute);
          queued = (await before.start(async () => {
            throw new Error('must not use ephemeral callback');
          }, task))!;
          assert.equal(
            await before.start(async () => ({ status: 'unavailable', reason: 'failed' }), task),
            queued,
          );
          assert.deepEqual(await before.get(queued, task.owner), { status: 'pending' });
          assert.equal(await before.get(queued, hash('another-session')), null);
          // The replacement object reads only PostgreSQL; it has none of the first object's closures or keys.
          worker = new PgBackgroundJobs(database.pool, boss, config, execute);
          await worker.listen();
          let result;
          for (let i = 0; i < 100; i++) {
            result = await worker.get(queued, task.owner);
            if (result?.status !== 'pending') break;
            await delay(100);
          }
          assert.equal(result?.status, 'ready');
          assert.equal(modelCalls, 1);
          assert.equal(
            (
              await database.pool.query(
                "SELECT count(*)::int AS n FROM wanwu_jobs.job WHERE name='media'",
              )
            ).rows[0].n,
            0,
          );
          const retained = JSON.stringify(
            (await database.pool.query('SELECT * FROM ai_background_jobs')).rows,
          );
          assert.ok(!retained.includes(provider.apiKey));
          assert.equal(
            (
              await database.pool.query('SELECT brief FROM ai_background_jobs WHERE id=$1', [
                queued,
              ])
            ).rows[0].brief,
            null,
          );
        },
      );
      await scenario(
        'interrupted/late jobs do not replay a possibly billed model call; BYOK has no persisted input/key',
        async () => {
          let finish!: (r: BackgroundResult) => void;
          const byok = {
            ...task,
            brief: { ...calmLullaby, attempt: 1 },
            provider: { ...provider, builtIn: false },
          };
          const id = (await worker!.start(
            () => new Promise<BackgroundResult>((r) => (finish = r)),
            byok,
          ))!;
          for (let i = 0; !finish; i++) {
            if (i > 100) throw new Error('ephemeral-wait');
            await delay(10);
          }
          const row = (
            await database.pool.query('SELECT mode,brief FROM ai_background_jobs WHERE id=$1', [id])
          ).rows[0];
          assert.equal(row.mode, 'ephemeral');
          assert.equal(row.brief, null);
          await owner.pool.query(
            "UPDATE ai_background_jobs SET deadline=now()-interval '1 second' WHERE id=$1",
            [id],
          );
          assert.deepEqual(await worker!.get(id, task.owner), {
            status: 'unavailable',
            reason: 'failed',
          });
          finish({ status: 'unavailable', reason: 'not-open' });
          await delay(50);
          assert.deepEqual(await worker!.get(id, task.owner), {
            status: 'unavailable',
            reason: 'failed',
          });
          assert.equal(modelCalls, 1);
          const queueJSON = JSON.stringify(
            (await database.pool.query('SELECT data FROM wanwu_jobs.job WHERE name=$1', [AI_QUEUE]))
              .rows,
          );
          assert.ok(!queueJSON.includes(provider.apiKey));
          assert.ok(!queueJSON.includes('brief'));
        },
      );
      const actor = { id: randomUUID(), authVersion: 1, role: 'teacher' as const };
      await owner.pool.query(
        "INSERT INTO accounts(id,username,nickname,password_hash) VALUES($1,$2,'测试老师','non-login-test-placeholder')",
        [actor.id, `p1_${randomUUID().slice(0, 8)}`],
      );
      const context = {
          pool: database.pool,
          boss,
          store: objects,
          origin: 'https://wanwu.proterm.ink',
        },
        sources = new Sources(context);
      const source = (id: string) => ({
        id,
        kind: 'local-file',
        label: '合成音',
        durationMs: 300,
        mimeType: 'audio/wav',
        provenance: {
          recordedBy: '测试',
          recordedOn: '2026-11-08',
          place: '本机',
          group: null,
          provenanceUrl: null,
        },
      });
      await scenario(
        'concurrent upload intents cannot oversubscribe account reservations; retry remains idempotent',
        async () => {
          process.env.WANWU_ACCOUNT_STORAGE_BYTES = String(PLAYBACK_RESERVATION + 100);
          const ids = Array.from({ length: 3 }, () => `file:${randomUUID()}`);
          const requests = ids.map((id) => ({
            source: source(id),
            bytes: 100,
            checksum: 'a'.repeat(64),
          }));
          const outcomes = await Promise.allSettled(
            ids.map((id, i) => sources.intent(actor, id, requests[i])),
          );
          assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
          const kept = outcomes.findIndex((r) => r.status === 'fulfilled');
          await sources.intent(actor, ids[kept]!, requests[kept]);
          assert.equal(
            (await transaction(database.pool, (tx) => resourceUsage(tx, actor.id))).reservedBytes,
            PLAYBACK_RESERVATION + 100,
          );
          delete process.env.WANWU_ACCOUNT_STORAGE_BYTES;
        },
      );
      await scenario(
        'expired upload slots stop blocking new work, and renewal must recheck admission',
        async () => {
          const old = (
            await database.pool.query(
              'SELECT id,metadata,checksum,bytes FROM sources WHERE owner_id=$1',
              [actor.id],
            )
          ).rows[0];
          await owner.pool.query(
            "UPDATE uploads SET expires_at=now()-interval '1 second' WHERE source_id=$1",
            [old.id],
          );
          assert.equal(
            (await transaction(database.pool, (tx) => resourceUsage(tx, actor.id))).pendingSources,
            0,
          );
          process.env.WANWU_ACCOUNT_PENDING_SOURCES = '1';
          const id = `file:${randomUUID()}`;
          await sources.intent(actor, id, {
            source: source(id),
            bytes: 100,
            checksum: 'b'.repeat(64),
          });
          await assert.rejects(
            sources.intent(actor, old.id, {
              source: old.metadata,
              bytes: old.bytes,
              checksum: old.checksum,
            }),
            (error: unknown) => (error as { status: number }).status === 429,
          );
          delete process.env.WANWU_ACCOUNT_PENDING_SOURCES;
        },
      );
      const data = Float32Array.from({ length: 14400 }, (_, i) => 0.2 * Math.sin(i / 20)),
        wave = pcm16Wave([data], 48000),
        file = join(directory, 'generated.wav');
      await writeFile(file, wave);
      const checksum = createHash('sha256').update(wave).digest('hex');
      const sourceId = `file:${randomUUID()}`,
        original = objects.key('originals'),
        playback = objects.key('playback'),
        analysis = analyseSamples([data], 48000);
      await database.pool.query(
        `INSERT INTO sources(id,owner_id,metadata,checksum,bytes,status,original_key,playback_key,playback_checksum,analysis,duration_ms)
       VALUES($1,$2,$3,$4,$5,'ready',$6,$7,$4,$8,300)`,
        [
          sourceId,
          actor.id,
          JSON.stringify(source(sourceId)),
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
      ]) {
        await objects.put(key!, file, 'audio/wav');
        await database.pool.query(
          'INSERT INTO stored_objects(object_key,kind,source_id) VALUES($1,$2,$3)',
          [key, kind, sourceId],
        );
      }
      await scenario(
        'server facts use canonical source measurements and preserve child choices/timing',
        async () => {
          const id = `work:${randomUUID()}`,
            unitId = `unit:${randomUUID()}`;
          const work = await new Works(context)
            .create(actor, {
              id,
              title: '事实测试',
              settings: DEFAULT_COMPOSE_SETTINGS,
              arrangement: {
                version: 'arrangement-v1',
                id,
                rows: 3,
                spanSeconds: 30,
                mood: null,
                origin: 'child',
                updatedAt: new Date().toISOString(),
                units: [
                  {
                    version: 'sound-v1',
                    id: unitId,
                    sourceId,
                    name: '不应送模型',
                    maker: '不应送模型',
                    markerIndex: 0,
                    shape: { pitch: 'high' },
                    input: 'manual',
                    createdAt: new Date().toISOString(),
                    analysis: { ...analysis, loudnessDb: 99 },
                  },
                ],
                events: [
                  {
                    id: `event:${randomUUID()}`,
                    unitId,
                    at: 0.16,
                    row: 0,
                    clip: { startMs: 0, endMs: 200 },
                  },
                ],
              },
            })
            .catch((error) => {
              throw error;
            });
          const facts = workFacts(work);
          assert.equal(facts.events[0]!.chosen.pitch, 'high');
          assert.equal(facts.events[0]!.measured!.loudnessDb, analysis.loudnessDb);
          assert.equal(facts.events[0]!.start, 4.8);
          assert.equal(facts.seconds, 30);
          assert.ok(!JSON.stringify(facts).includes('不应送模型'));
        },
      );
      await scenario(
        'storage audit detects missing/corrupt/unavailable objects, never deletes or disables business data',
        async () => {
          const native = objects.head.bind(objects);
          objects.head = async (key) => {
            try {
              return await native(key);
            } catch (error) {
              if ((error as { code?: string }).code === 'ENOENT') throw { status: 404 };
              throw error;
            }
          };
          assert.equal((await reconcileStorage(database.pool, objects)).present, 2);
          await objects.remove(playback);
          assert.equal((await reconcileStorage(database.pool, objects)).missing, 1);
          await objects.put(playback, file, 'audio/wav');
          await objects.remove(original);
          const bad = join(directory, 'bad.wav');
          await writeFile(bad, 'bad');
          await objects.put(original, bad, 'audio/wav');
          assert.equal((await reconcileStorage(database.pool, objects)).invalid, 1);
          await objects.remove(original);
          await objects.put(original, file, 'audio/wav');
          const functioning = objects.head.bind(objects);
          objects.head = async () => {
            throw new Error('synthetic OSS outage');
          };
          assert.equal((await reconcileStorage(database.pool, objects)).unavailable, 2);
          assert.equal(
            (await database.pool.query('SELECT status FROM sources WHERE id=$1', [sourceId]))
              .rows[0].status,
            'ready',
          );
          objects.head = functioning;
          assert.equal((await reconcileStorage(database.pool, objects)).present, 2);
        },
      );
      await scenario(
        'private operations report catches stale maintenance, failed jobs and stale workers',
        async () => {
          const report = await operationalHealth(database.pool);
          assert.equal(report.status, 'attention');
          assert.ok(report.reasons.includes('media-worker-stale'));
          assert.ok(report.reasons.includes('backup-overdue-or-failed'));
          assert.ok(report.reasons.includes('ai-recent-failures'));
          await owner.pool.query("DELETE FROM ai_background_jobs WHERE result->>'reason'='failed'");
          await database.pool.query(
            "INSERT INTO runtime_status(component) VALUES('media-worker') ON CONFLICT(component) DO UPDATE SET seen_at=now()",
          );
          for (const kind of ['backup', 'garbage-collection'])
            await database.pool.query(
              "INSERT INTO maintenance_runs(id,kind,status,finished_at) VALUES($1,$2,'pass',now())",
              [randomUUID(), kind],
            );
          assert.equal((await operationalHealth(database.pool)).status, 'pass');
          const job = await boss.send(
            'media',
            { kind: 'source', sourceId: 'not-real' },
            { retryLimit: 0 },
          );
          await boss.fetch('media');
          await boss.fail('media', job!, {});
          assert.ok(
            (await operationalHealth(database.pool)).reasons.includes('media-recent-failures'),
          );
        },
      );
      await scenario(
        'new shared catalogue excerpts count against the admitting account, without making them private',
        async () => {
          const parent = `example:quota-${randomUUID()}`;
          await owner.pool.query(
            `INSERT INTO sources(id,catalogue,metadata,checksum,bytes,status,original_key,playback_key,analysis,duration_ms)
         VALUES($1,true,$2,$3,100,'ready',$4,$5,$6,300)`,
            [
              parent,
              JSON.stringify({ ...source(parent), kind: 'example' }),
              checksum,
              objects.key('originals'),
              objects.key('playback'),
              JSON.stringify(analysis),
            ],
          );
          const before = await transaction(database.pool, (tx) => resourceUsage(tx, actor.id));
          process.env.WANWU_ACCOUNT_PENDING_SOURCES = '2';
          const id = `${parent}#0-200`;
          await sources.intent(actor, id, {
            parentId: parent,
            selection: { startMs: 0, endMs: 200 },
          });
          const after = await transaction(database.pool, (tx) => resourceUsage(tx, actor.id));
          assert.equal(after.pendingSources, before.pendingSources + 1);
          assert.equal(after.reservedBytes, before.reservedBytes + PLAYBACK_RESERVATION);
          await sources.intent(actor, id, {
            parentId: parent,
            selection: { startMs: 0, endMs: 200 },
          });
          await assert.rejects(
            sources.intent(actor, `${parent}#100-300`, {
              parentId: parent,
              selection: { startMs: 100, endMs: 300 },
            }),
            (error: unknown) => (error as { status: number }).status === 429,
          );
          const row = (
            await database.pool.query(
              'SELECT catalogue,owner_id,requested_by FROM sources WHERE id=$1',
              [id],
            )
          ).rows[0];
          assert.equal(row.catalogue, true);
          assert.equal(row.owner_id, null);
          assert.equal(row.requested_by, actor.id);
          delete process.env.WANWU_ACCOUNT_PENDING_SOURCES;
        },
      );
      await scenario(
        'render admission caps pending tasks but unchanged saves remain idempotent',
        async () => {
          const works = new Works(context),
            id = (await database.pool.query('SELECT id FROM works WHERE owner_id=$1', [actor.id]))
              .rows[0].id;
          const current = await works.get(actor, id),
            input = {
              id,
              title: current.title,
              arrangement: current.arrangement,
              settings: current.settings,
            };
          process.env.WANWU_ACCOUNT_PENDING_RENDERS = '1';
          const first = await works.save(actor, id, input, workEtag(id, current.revision));
          const repeat = await works.save(actor, id, input, workEtag(id, first.work.revision));
          assert.equal(repeat.work.revision, first.work.revision);
          assert.equal(
            (await works.facts(actor, id, first.work.revision)).facts.revision,
            first.work.revision,
          );
          const storedRules = (
            await owner.pool.query(
              'SELECT rules FROM work_snapshots WHERE work_id=$1 AND revision=$2',
              [id, first.work.revision],
            )
          ).rows[0].rules;
          await owner.pool.query(
            "UPDATE work_snapshots SET rules=jsonb_set(rules,'{mix}','\"old-test-version\"') WHERE work_id=$1 AND revision=$2",
            [id, first.work.revision],
          );
          await assert.rejects(
            works.facts(actor, id, first.work.revision),
            (error: unknown) => (error as { status: number }).status === 409,
          );
          await owner.pool.query(
            'UPDATE work_snapshots SET rules=$3 WHERE work_id=$1 AND revision=$2',
            [id, first.work.revision, JSON.stringify(storedRules)],
          );
          await assert.rejects(
            works.save(
              actor,
              id,
              { ...input, title: '另一个版本' },
              workEtag(id, first.work.revision),
            ),
            (error: unknown) => (error as { status: number }).status === 429,
          );
          delete process.env.WANWU_ACCOUNT_PENDING_RENDERS;
        },
      );
      const read = async (name: string) =>
        (await readFile(`/sys/fs/cgroup/${name}`, 'utf8')).trim();
      const events = Object.fromEntries(
        (await read('memory.events')).split('\n').map((l) => {
          const [k, v] = l.split(' ');
          return [k, Number(v)];
        }),
      );
      assert.equal(events.oom_kill, 0);
      assert.equal(process.platform, 'linux');
      assert.notEqual(process.getuid?.(), 0);
      console.log(
        'WANWU_P1_PROOF ' +
          JSON.stringify({
            status: 'pass',
            postgresVersion: (await database.pool.query('SHOW server_version')).rows[0]
              .server_version,
            memoryPeak: Number(await read('memory.peak')),
            memoryEvents: events,
            noRealModelCalls: true,
            noRealOSS: true,
            productionAcceptance: false,
          }),
      );
    } finally {
      delete process.env.WANWU_ACCOUNT_STORAGE_BYTES;
      delete process.env.WANWU_ACCOUNT_PENDING_SOURCES;
      delete process.env.WANWU_ACCOUNT_PENDING_RENDERS;
      await worker?.close().catch(() => {});
      await boss.stop().catch(() => {});
      await database.close();
      await owner.close();
      await objects.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
