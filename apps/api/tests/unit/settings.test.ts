import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdtemp, rm, readFile, writeFile, chmod, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  SettingsStore,
  SettingsError,
  useSettings,
  settingNumber,
  inSettings,
  settingsRequest,
} from '../../src/settings/store.ts';
import { defaults, problems, DEFINITIONS } from '../../src/settings/schema.ts';
import { WindowLimiter } from '../../src/settings/rate.ts';
import { DailyBudget } from '../../src/guest/limits.ts';
import { MemoryCallControl } from '../../src/guest/control.ts';
import { MIX_RULES } from '@wanwu-v2/sound-rules/rules';
import { signed } from '../../src/settings/signature.ts';

test('configuration defaults are valid, unique and within the released protocol boundaries', () => {
  assert.deepEqual(problems(defaults({})), {});
  assert.equal(new Set(DEFINITIONS.map((d) => d.key)).size, DEFINITIONS.length);
  assert.ok(DEFINITIONS.length > 100);
  assert.ok(
    Object.keys(problems({ ...defaults({}), 'upload.maxBytes': 30 * 1024 ** 2 })).includes(
      'upload.maxBytes',
    ),
  );
  assert.ok(
    Object.keys(
      problems({
        ...defaults({}),
        'service.databaseUrl': 'postgresql://postgres:unrelated@old/old',
      }),
    ).includes('service.databaseUrl'),
  );
  assert.ok(
    Object.keys(problems({ ...defaults({}), 'service.proxyAddresses': '0.0.0.0/0' })).includes(
      'service.proxyAddresses',
    ),
  );
});

test('real config file survives restart, protects secrets, detects conflicts and restores through a new revision', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wanwu-settings-'));
  await chmod(directory, 0o700);
  const key = randomBytes(32).toString('hex'),
    secret = 'synthetic-secret-never-rendered';
  try {
    const store = await new SettingsStore(directory, true, key, {}).load();
    const first = await store.update(
      0,
      {
        'ai.dailyLimit': 123,
        'model.language.baseUrl': 'https://example.invalid/v1',
        'model.language.model': 'test-model',
        'model.language.apiKey': secret,
        'service.origin': 'https://other.invalid',
        'deploy.api.cpu': 0.5,
      },
      'synthetic-admin',
    );
    assert.equal(first.revision, 1);
    assert.equal(store.value('ai.dailyLimit'), 123);
    assert.equal(store.value('service.origin'), 'https://wanwu.proterm.ink');
    assert.equal(first.items.find((i) => i.key === 'deploy.api.cpu')!.pending, true);
    assert.equal(first.items.find((i) => i.key === 'service.origin')!.pending, true);
    assert.equal(JSON.stringify(first).includes(secret), false);
    assert.equal((await readFile(store.file, 'utf8')).includes(secret), false);
    assert.equal((await stat(store.file)).mode & 0o777, 0o600);
    await assert.rejects(
      store.update(0, { 'ai.dailyLimit': 999 }, 'other'),
      (e: unknown) => e instanceof SettingsError && e.code === 'conflict',
    );
    const restarted = await new SettingsStore(directory, true, key, {}).load();
    assert.equal(restarted.value('ai.dailyLimit'), 123);
    assert.equal(restarted.value('model.language.apiKey'), secret);
    assert.equal(restarted.value('service.origin'), 'https://wanwu.proterm.ink');
    const controlledRestart = await new SettingsStore(directory, true, key, {
      WANWU_APP_ORIGIN: 'https://other.invalid',
    }).load();
    assert.equal(controlledRestart.value('service.origin'), 'https://other.invalid');
    assert.equal(
      restarted.value('deploy.api.cpu'),
      0.25,
      'a restart is not proof that deployment resources were applied',
    );
    const reader = await new SettingsStore(directory, false, undefined, {}).load();
    assert.equal(reader.value('ai.dailyLimit'), 123);
    assert.equal(
      reader.value('model.language.apiKey'),
      '',
      'media/ops get no model decryption key',
    );
    await assert.rejects(reader.update(1, { 'ai.dailyLimit': 1 }, 'other'));
    const restored = await restarted.restore(1, 0, 'synthetic-admin');
    assert.equal(restored.revision, 2);
    assert.equal(restarted.value('ai.dailyLimit'), 2000);
    assert.deepEqual(restored.audit.at(-1)?.restoredFrom, 0);
    await store.refresh();
    assert.equal(store.value('ai.dailyLimit'), 2000);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('invalid and malformed changes never replace a valid configuration; lost writers cannot overwrite another revision', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wanwu-settings-'));
  await chmod(directory, 0o700);
  try {
    const key = randomBytes(32).toString('hex');
    const one = await new SettingsStore(directory, true, key, {}).load();
    const two = await new SettingsStore(directory, true, key, {}).load();
    const winners = await Promise.allSettled([
      one.update(0, { 'ai.dailyLimit': 3 }, 'one'),
      two.update(0, { 'ai.dailyLimit': 4 }, 'two'),
    ]);
    assert.equal(winners.filter((r) => r.status === 'fulfilled').length, 1);
    await one.refresh();
    const previous = await readFile(one.file, 'utf8');
    for (const bad of [
      { 'ai.concurrency': 0 },
      { 'ai.dailyLimit': '2' },
      { 'auth.idleSeconds': 7 * 86400, 'auth.absoluteSeconds': 3600 },
      { 'unknown.secret': 'never reflected' },
    ]) {
      await assert.rejects(one.update(1, bad, 'one'), SettingsError);
      assert.equal(await readFile(one.file, 'utf8'), previous);
    }
    await writeFile(one.file, '{broken', { mode: 0o600 });
    await one.refresh();
    assert.ok(one.view().problem);
    assert.ok([3, 4].includes(Number(one.value('ai.dailyLimit'))));
    await assert.rejects(new SettingsStore(directory, true, key, {}).load());
    await rm(one.file);
    await symlink(join(directory, 'unrelated'), one.file);
    await assert.rejects(new SettingsStore(directory, true, key, {}).load());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('deployment effective values require an authentic receipt and a fresh controller; forged and stale files do not authorize application', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wanwu-controller-'));
  await chmod(directory, 0o700);
  const key = randomBytes(32);
  try {
    const store = await new SettingsStore(directory, true, key.toString('hex'), {}).load();
    await store.update(0, { 'deploy.api.cpu': 0.5 }, randomBytes(16).toString('hex'));
    await assert.rejects(store.requestApply(1, 'admin'), SettingsError);
    await writeFile(
      join(directory, 'applied.json'),
      JSON.stringify({
        payload: { format: 1, effective: { 'deploy.api.cpu': 2 } },
        mac: '0'.repeat(64),
      }),
      { mode: 0o600 },
    );
    await store.refresh();
    assert.equal(store.value('deploy.api.cpu'), 0.25);
    await writeFile(
      join(directory, 'applied.json'),
      JSON.stringify(signed({ format: 1, effective: { 'deploy.api.cpu': 0.5 } }, key)),
      { mode: 0o600 },
    );
    await store.refresh();
    assert.equal(store.value('deploy.api.cpu'), 0.5);
    assert.equal(store.view().items.find((i) => i.key === 'deploy.api.cpu')!.pending, false);
    await writeFile(
      join(directory, 'controller-status.json'),
      JSON.stringify(
        signed({ format: 1, at: new Date(Date.now() - 60000).toISOString(), phase: 'idle' }, key),
      ),
      { mode: 0o600 },
    );
    await assert.rejects(store.requestApply(1, 'admin'), SettingsError);
    await writeFile(
      join(directory, 'controller-status.json'),
      JSON.stringify(signed({ format: 1, at: new Date().toISOString(), phase: 'idle' }, key)),
      { mode: 0o600 },
    );
    const job = await store.requestApply(1, 'admin');
    assert.equal(job.status, 'queued');
    await assert.rejects(store.requestApply(1, 'admin'), SettingsError);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('saved daily budget, model concurrency and rate windows affect the next actual operation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wanwu-settings-'));
  await chmod(directory, 0o700);
  try {
    const store = await new SettingsStore(
      directory,
      true,
      randomBytes(32).toString('hex'),
      {},
    ).load();
    useSettings(store);
    await store.update(0, { 'ai.dailyLimit': 1, 'ai.concurrency': 1 }, 'one');
    const budget = new DailyBudget(() => settingNumber('ai.dailyLimit'));
    const guard = new MemoryCallControl(budget),
      provider = {
        builtIn: true,
        baseUrl: 'https://example.invalid',
        model: 'fake',
        apiKey: 'synthetic',
      };
    let finish: (() => void) | undefined;
    const pending = guard.run(
      provider,
      () =>
        new Promise<void>((r) => {
          finish = r;
        }),
    );
    await assert.rejects(guard.run(provider, async () => {}));
    finish!();
    await pending;
    await assert.rejects(guard.run(provider, async () => {}));
    await store.update(1, { 'ai.dailyLimit': 2 }, 'one');
    await guard.run(provider, async () => {});
    const limiter = new WindowLimiter();
    limiter.take('same', 1, 10, 1000);
    assert.throws(() => limiter.take('same', 1, 10, 1001));
    limiter.take('same', 1, 10, 11001);
  } finally {
    useSettings();
    await rm(directory, { recursive: true, force: true });
  }
});

test('music and protocol edits remain explicit release drafts and cannot silently change current rendering rules', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wanwu-release-draft-'));
  await chmod(directory, 0o700);
  try {
    const store = await new SettingsStore(
      directory,
      true,
      randomBytes(32).toString('hex'),
      {},
    ).load();
    const draft = { ...MIX_RULES, childGain: 0.75 };
    const view = await store.update(
      0,
      { 'release.music.mix': JSON.stringify(draft), 'release.protocol.maxUnits': 16 },
      'one',
    );
    assert.equal(view.items.find((i) => i.key === 'release.music.mix')?.pending, true);
    assert.equal(MIX_RULES.childGain, 0.8);
    assert.equal(JSON.parse(String(store.value('release.music.mix'))).childGain, 0.8);
    assert.equal(store.value('release.protocol.maxUnits'), 12);
    assert.equal(
      store.releasePlan().items.find((i) => i.key === 'release.music.mix')?.pending,
      true,
    );
    assert.equal(Object.hasOwn(store.hostConfiguration().values, 'release.music.mix'), false);
    await assert.rejects(
      store.update(1, { 'release.music.mix': '{"version":"test","childGain":999}' }, 'one'),
    );
    await assert.rejects(
      store.update(
        1,
        { 'deploy.api.memoryMiB': 512, 'auth.hashConcurrency': 4, 'auth.argonMemoryKiB': 65536 },
        'one',
      ),
      SettingsError,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('an in-flight operation keeps one coherent settings snapshot while the next operation sees the new revision', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wanwu-settings-scope-'));
  await chmod(directory, 0o700);
  try {
    const store = await new SettingsStore(
      directory,
      true,
      randomBytes(32).toString('hex'),
      {},
    ).load();
    useSettings(store);
    let finish: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const operation = inSettings(async () => {
      assert.equal(settingNumber('ai.dailyLimit'), 2000);
      await waiting;
      assert.equal(settingNumber('ai.dailyLimit'), 2000);
    });
    await store.update(0, { 'ai.dailyLimit': 42 }, 'one');
    assert.equal(
      inSettings(() => settingNumber('ai.dailyLimit')),
      42,
    );
    finish!();
    await operation;
    assert.equal(settingNumber('ai.dailyLimit'), 42);
  } finally {
    useSettings();
    await rm(directory, { recursive: true, force: true });
  }
});
test(
  'the real Fastify request hook isolates concurrent HTTP requests across a configuration save',
  { timeout: 10000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wanwu-settings-http-'));
    await chmod(directory, 0o700);
    const app = Fastify();
    let finish: (() => void) | undefined;
    let announce: (() => void) | undefined;
    const waiting = new Promise<void>((r) => {
      finish = r;
    });
    const entered = new Promise<void>((r) => {
      announce = r;
    });
    const timeout = setTimeout(() => finish?.(), 5000);
    timeout.unref();
    try {
      const store = await new SettingsStore(
        directory,
        true,
        randomBytes(32).toString('hex'),
        {},
      ).load();
      useSettings(store);
      app.addHook('onRequest', (_request, _reply, done) => settingsRequest(done));
      app.get('/held', async () => {
        const before = settingNumber('ai.dailyLimit');
        announce!();
        await waiting;
        return { before, after: settingNumber('ai.dailyLimit') };
      });
      app.get('/next', () => ({ value: settingNumber('ai.dailyLimit') }));
      const held = app.inject('/held').then((result) => result.json());
      await entered;
      await store.update(0, { 'ai.dailyLimit': 17 }, 'one');
      assert.equal((await app.inject('/next')).json().value, 17);
      finish!();
      assert.deepEqual(await held, { before: 2000, after: 2000 });
    } finally {
      finish?.();
      clearTimeout(timeout);
      await app.close();
      useSettings();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
