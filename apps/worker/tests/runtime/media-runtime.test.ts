import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stat } from 'node:fs/promises';
import { openDatabase } from '../../../api/src/db/client.ts';
import { bootstrap } from '../../../api/src/db/bootstrap.ts';
import { firstAdmin } from '../../../api/src/accounts.ts';
import { Passwords } from '../../../api/src/security.ts';
import { LocalObjectStore } from '../../../api/tests/helpers/localStore.ts';
import { mediaBoss, enqueueMedia } from '../../../api/src/jobs/mediaQueue.ts';
import { transaction } from '../../../api/src/db/transaction.ts';
import { Works } from '../../../api/src/cloud/works.ts';
import { workEtag } from '@wanwu-v2/contracts/cloud';
import { prototypeInput, syntheticWave } from '../../src/prototype-fixtures.ts';
import { startMediaWorker } from '../../src/jobs/mediaWorker.ts';
import { openRenderer } from '../../src/browser/runner.ts';
import { probeAudio } from '../../src/media/probe.ts';
import { assessMemory } from '../../src/resource-evidence.ts';
import { reconcileMedia } from '../../../api/src/jobs/reconcile.ts';
import { MIX_RULES } from '@wanwu-v2/sound-rules/rules';

test(
  'real pg-boss worker completes maximum 12-source / 24-placement / long-tail mix under the Linux budget',
  { timeout: 600_000 },
  async () => {
    assert.equal(process.platform, 'linux');
    assert.notEqual(process.getuid?.(), 0);
    const kernel = await readFile('/proc/self/status', 'utf8');
    assert.match(kernel, /NoNewPrivs:\s+1/);
    assert.match(kernel, /CapEff:\s+0+\n/);
    const limit = Number(await readFile('/sys/fs/cgroup/memory.max', 'utf8'));
    assert.equal(limit, 1024 ** 3);
    assert.equal((await readFile('/sys/fs/cgroup/cpu.max', 'utf8')).trim(), '50000 100000');
    assert.equal((await readFile('/sys/fs/cgroup/memory.swap.max', 'utf8')).trim(), '0');
    const owner = openDatabase(process.env.WANWU_TEST_OWNER_DATABASE_URL ?? '', 'owner'),
      database = openDatabase(process.env.WANWU_TEST_DATABASE_URL ?? ''),
      boss = mediaBoss(database.pool);
    const store = await LocalObjectStore.create('/fixtures'),
      directory = await mkdtemp('/fixtures/wanwu-runtime-');
    let worker: Awaited<ReturnType<typeof startMediaWorker>> | undefined;
    try {
      for (let i = 0; ; i++) {
        try {
          await owner.pool.query('SELECT 1');
          break;
        } catch {
          if (i >= 60) throw new Error('test-postgres-unavailable');
          await delay(500);
        }
      }
      await bootstrap(owner.pool, process.env.WANWU_TEST_APP_DB_PASSWORD ?? '');
      await boss.start();
      const passwords = new Passwords();
      await passwords.ready();
      const account = await firstAdmin(
        owner.db,
        passwords,
        'runtime_admin',
        'A disposable maximum worker proof password_123',
      );
      const actor = { id: account.id, authVersion: 1, role: account.role },
        context = { pool: database.pool, boss, store, origin: 'https://example.invalid' },
        tools = { ffmpeg: '/usr/bin/ffmpeg', ffprobe: '/usr/bin/ffprobe' };
      const { browser, identity } = await openRenderer();
      await browser.close();
      assert.equal(identity.linuxSandboxVerified, true);
      const input = prototypeInput('maximum');
      for (const [index, unit] of input.arrangement.units.entries()) {
        const bytes = syntheticWave(45, 220 + index * 37, 2),
          file = join(directory, `source-${index}.wav`),
          key = store.key('originals');
        await writeFile(file, bytes);
        await store.put(key, file, 'audio/wav');
        await rm(file);
        const checksum = createHash('sha256').update(bytes).digest('hex');
        const metadata = {
          id: unit.sourceId,
          kind: 'local-file',
          label: `测试${index + 1}`,
          durationMs: 45000,
          mimeType: 'audio/wav',
          provenance: {
            recordedBy: '测试',
            recordedOn: '2026-10-25',
            place: '本机',
            group: null,
            provenanceUrl: null,
          },
        };
        await transaction(database.pool, async (tx) => {
          await tx.query(
            "INSERT INTO sources(id,owner_id,metadata,checksum,bytes,status,original_key) VALUES($1,$2,$3,$4,$5,'queued',$6)",
            [unit.sourceId, account.id, JSON.stringify(metadata), checksum, bytes.length, key],
          );
          await tx.query(
            "INSERT INTO stored_objects(object_key,kind,source_id) VALUES($1,'original',$2)",
            [key, unit.sourceId],
          );
          await enqueueMedia(boss, tx, { kind: 'source', sourceId: unit.sourceId });
        });
      }
      const child = spawn(
        process.execPath,
        ['--expose-gc', fileURLToPath(new URL('./crash-child.ts', import.meta.url))],
        {
          stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
          env: {
            PATH: process.env.PATH,
            WANWU_TEST_DATABASE_URL: process.env.WANWU_TEST_DATABASE_URL,
            WANWU_TEST_OBJECT_DIRECTORY: store.testDirectory(),
            WANWU_TEST_SCRATCH_ROOT: directory,
          },
        },
      );
      child.stdout?.resume();
      child.stderr?.resume();
      let abandoned = '';
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('crash-child-did-not-claim')), 20_000);
          child.once('error', () => {
            clearTimeout(timer);
            reject(new Error('crash-child-unavailable'));
          });
          child.once('exit', () => {
            clearTimeout(timer);
            reject(new Error('crash-child-exited-before-claim'));
          });
          child.once('message', (message: { type: string; scratch?: string }) => {
            clearTimeout(timer);
            if (
              message.type !== 'claimed' ||
              !message.scratch?.startsWith(directory + '/wanwu-job-')
            )
              reject(new Error('invalid-crash-child-proof'));
            else {
              abandoned = message.scratch;
              resolve();
            }
          });
        });
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
          child.kill('SIGKILL');
          await exited;
        }
      }
      // Only this disposable queue clock is accelerated, so a real SIGKILL recovery need not wait four minutes.
      await database.pool.query(
        "UPDATE wanwu_jobs.job SET started_on=now()-interval '10 minutes' WHERE name='media' AND state='active'",
      );
      await boss.supervise();
      worker = await startMediaWorker(context, directory, tools);
      await assert.rejects(() => stat(abandoned));
      await assert.rejects(
        () => startMediaWorker(context, directory, tools),
        /one Wanwu media worker/,
      );
      const wait = async (action: () => Promise<boolean>, deadline: number) => {
        while (Date.now() < deadline) {
          if (await action()) return;
          await delay(1000);
        }
        throw new Error('maximum-worker-test-timeout');
      };
      await wait(async () => {
        const rows = (await database.pool.query('SELECT status,failure FROM sources')).rows;
        if (rows.some((row) => row.status === 'failed')) throw new Error('source-job-failed');
        return rows.length === 12 && rows.every((row) => row.status === 'ready');
      }, Date.now() + 240_000);
      const works = new Works(context),
        content = {
          id: input.arrangement.id,
          title: '最大编排测试',
          arrangement: input.arrangement,
          settings: input.settings,
        };
      const draft = await works.create(actor, content),
        saved = await works.save(actor, content.id, content, workEtag(draft.id, draft.revision)),
        started = Date.now();
      await wait(async () => {
        const row = (
          await database.pool.query('SELECT status,failure FROM render_artifacts WHERE id=$1', [
            saved.render.audioAssetId ??
              (
                await database.pool.query('SELECT id FROM render_artifacts WHERE work_id=$1', [
                  content.id,
                ])
              ).rows[0].id,
          ])
        ).rows[0];
        if (row?.status === 'failed') throw new Error(`render-job-failed:${row.failure}`);
        return row?.status === 'ready';
      }, Date.now() + 200_000);
      const elapsedMs = Date.now() - started;
      assert.ok(elapsedMs <= 180_000);
      const render = (
          await database.pool.query('SELECT * FROM render_artifacts WHERE work_id=$1', [content.id])
        ).rows[0],
        file = join(directory, 'verify.mp3');
      await store.download(render.object_key, file, 3 * 1024 * 1024);
      const probe = await probeAudio(file, tools.ffprobe);
      assert.equal(probe.codec, 'mp3');
      assert.equal(probe.sampleRate, 48000);
      const expectedSeconds = input.arrangement.spanSeconds + MIX_RULES.ending.overrunSeconds;
      assert.ok(
        expectedSeconds > input.arrangement.spanSeconds,
        'maximum fixture must exercise the released tail allowance',
      );
      assert.ok(
        probe.duration! >= expectedSeconds - 0.1 && probe.duration! < expectedSeconds + 0.1,
        `actual=${probe.duration}, released-tail=${expectedSeconds}`,
      );
      await database.pool.query("UPDATE render_artifacts SET status='processing' WHERE id=$1", [
        render.id,
      ]);
      await database.pool.query("UPDATE wanwu_jobs.job SET state='failed' WHERE id=$1", [
        render.job_id,
      ]);
      await reconcileMedia(database.pool);
      assert.equal(
        (await database.pool.query('SELECT failure FROM render_artifacts WHERE id=$1', [render.id]))
          .rows[0].failure,
        'worker-interrupted',
      );
      const counters = async (file: string) =>
        Object.fromEntries(
          (await readFile(`/sys/fs/cgroup/${file}`, 'utf8'))
            .trim()
            .split('\n')
            .map((line) => line.split(/\s+/))
            .map(([key, value]) => [key!, Number(value)]),
        );
      const memoryEvents = await counters('memory.events'),
        pidEvents = await counters('pids.events'),
        memoryPeak = Number(await readFile('/sys/fs/cgroup/memory.peak', 'utf8'));
      assert.equal(memoryEvents.oom, 0);
      assert.equal(memoryEvents.oom_kill, 0);
      assert.equal(pidEvents.max, 0);
      console.log(
        'WANWU_RUNTIME_PROOF ' +
          JSON.stringify({
            status: 'pass',
            cpu: 0.5,
            memoryLimit: limit,
            memoryPeak,
            memoryEvents,
            pidEvents,
            capacity: assessMemory(limit, memoryPeak, memoryEvents),
            elapsedMs,
            linuxSandboxVerified: identity.linuxSandboxVerified,
            browserVersion: identity.browserVersion,
            sourceCount: 12,
            placementCount: 24,
            encoded: probe,
            queue: 'real-pg-boss',
            sigkillRecovered: true,
            expiredQueueClockAccelerated: true,
            abandonedScratchRemoved: true,
            objectStore: 'local private fixture; not OSS acceptance',
          }),
      );
    } catch (error) {
      const renders = (await database.pool.query('SELECT status,failure FROM render_artifacts'))
        .rows;
      const jobs = (
        await database.pool.query(
          "SELECT state,retry_count,retry_limit FROM wanwu_jobs.job WHERE name='media' AND data->>'kind'='render'",
        )
      ).rows;
      console.log(
        'WANWU_RUNTIME_DIAGNOSTIC ' +
          JSON.stringify({
            renders,
            jobs,
            memoryPeak: Number(await readFile('/sys/fs/cgroup/memory.peak', 'utf8')),
            memoryEvents: await readFile('/sys/fs/cgroup/memory.events', 'utf8'),
          }),
      );
      throw error;
    } finally {
      await worker?.stop();
      await boss.stop();
      await store.close();
      await owner.close();
      await database.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
