import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, chmod, readFile, rm, writeFile } from 'node:fs/promises';
import { signed, verified } from '../../src/settings/signature.ts';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { openDatabase } from '../../src/db/client.ts';
import { bootstrap } from '../../src/db/bootstrap.ts';
import { Accounts, firstAdmin } from '../../src/accounts.ts';
import { Passwords, randomToken } from '../../src/security.ts';
import { buildApp } from '../../src/app.ts';
import { SettingsStore, useSettings, settingNumber } from '../../src/settings/store.ts';
import { PgCallControl } from '../../src/guest/control.ts';
import { resourceLimits } from '../../src/cloud/quotas.ts';

test(
  'admin configuration uses real sessions, role checks, CSRF, atomic persistent files and live PG admission',
  { timeout: 120000 },
  async () => {
    const owner = openDatabase(process.env.WANWU_TEST_OWNER_DATABASE_URL ?? '', 'owner');
    const database = openDatabase(process.env.WANWU_TEST_DATABASE_URL ?? '');
    const directory = await mkdtemp(join(tmpdir(), 'wanwu-settings-api-'));
    await chmod(directory, 0o700);
    const origin = 'https://settings.example.invalid',
      key = randomBytes(32).toString('hex');
    const password = 'a disposable settings administrator passphrase';
    let app: Awaited<ReturnType<typeof buildApp>> | undefined;
    const proof: string[] = [];
    try {
      for (let i = 0; ; i++) {
        try {
          await owner.pool.query('SELECT 1');
          break;
        } catch {
          if (i >= 60) throw new Error('test-db-unavailable');
          await delay(500);
        }
      }
      await bootstrap(owner.pool, process.env.WANWU_TEST_APP_DB_PASSWORD ?? '');
      const passwords = new Passwords();
      await passwords.ready();
      await firstAdmin(owner.db, passwords, 'settings_admin', password);
      const accounts = new Accounts(database.db, passwords);
      const actor = await accounts.login('settings_admin', password);
      const invitation = await accounts.createInvitation(actor.id);
      await accounts.register({
        username: 'settings_teacher',
        password,
        invitationCode: invitation.code,
      });
      let store = await new SettingsStore(directory, true, key, {
        WANWU_APP_ORIGIN: origin,
        WANWU_CLOUD_AUTH_MODE: 'session',
      }).load();
      useSettings(store);
      const config = {
        origin,
        sessionSecret: randomToken(),
        cloudAuthMode: 'session' as const,
        trustedProxyAddresses: ['127.0.0.1'],
      };
      app = await buildApp(config, database);
      class Client {
        cookie = '';
        csrf = '';
        async send(
          method: 'GET' | 'POST' | 'PATCH',
          url: string,
          payload?: Record<string, unknown>,
          extra: Record<string, string> = {},
        ) {
          const response = await app!.inject({
            method,
            url,
            payload,
            remoteAddress: '127.0.0.1',
            headers: {
              origin,
              'x-forwarded-proto': 'https',
              cookie: this.cookie,
              'x-csrf-token': this.csrf,
              ...extra,
            },
          });
          const cookies = response.headers['set-cookie'];
          const list = Array.isArray(cookies) ? cookies : cookies ? [cookies] : [];
          const changed = list.filter((v) => v.startsWith('__Host-wanwu=')).at(-1);
          if (changed) this.cookie = changed.split(';')[0]!;
          let body: Record<string, any> = {};
          try {
            body = response.json();
          } catch {}
          if (body.csrfToken) this.csrf = body.csrfToken;
          return { response, body };
        }
        async login(username: string) {
          await this.send('GET', '/api/v1/admin/settings/csrf');
          return this.send('POST', '/api/v1/admin/settings/login', { username, password });
        }
      }
      const anonymous = new Client();
      assert.equal(
        (await anonymous.send('GET', '/api/v1/admin/settings')).response.statusCode,
        401,
      );
      proof.push('anonymous-denied');
      const teacher = new Client();
      assert.equal((await teacher.login('settings_teacher')).response.statusCode, 403);
      proof.push('teacher-cannot-use-admin-login');
      await teacher.send('POST', '/api/v1/auth/login', { username: 'settings_teacher', password });
      assert.equal((await teacher.send('GET', '/api/v1/admin/settings')).response.statusCode, 403);
      assert.equal(
        (
          await teacher.send(
            'PATCH',
            '/api/v1/admin/settings',
            { changes: { 'ai.dailyLimit': 9 } },
            { 'if-match': '"settings:0"' },
          )
        ).response.statusCode,
        403,
      );
      proof.push('teacher-session-cannot-read-or-write');
      const admin = new Client();
      assert.equal((await admin.login('settings_admin')).response.statusCode, 200);
      const initial = await admin.send('GET', '/api/v1/admin/settings');
      assert.equal(initial.response.statusCode, 200);
      assert.equal(initial.body.revision, 0);
      const tag = String(initial.response.headers.etag);
      const badCsrf = await admin.send(
        'PATCH',
        '/api/v1/admin/settings',
        { changes: { 'ai.dailyLimit': 1 } },
        { 'if-match': tag, 'x-csrf-token': 'wrong' },
      );
      assert.equal(badCsrf.response.statusCode, 403);
      proof.push('csrf-enforced');
      assert.equal(
        (await teacher.send('POST', '/api/v1/admin/settings/apply', {}, { 'if-match': tag }))
          .response.statusCode,
        403,
      );
      assert.equal(
        (
          await admin.send(
            'POST',
            '/api/v1/admin/settings/apply',
            {},
            { 'if-match': tag, 'x-csrf-token': 'wrong' },
          )
        ).response.statusCode,
        403,
      );
      proof.push('apply-requires-admin-and-csrf');
      const badOrigin = await admin.send(
        'PATCH',
        '/api/v1/admin/settings',
        { changes: { 'ai.dailyLimit': 1 } },
        { 'if-match': tag, origin: 'https://wrong.invalid' },
      );
      assert.equal(badOrigin.response.statusCode, 403);
      proof.push('origin-enforced');
      assert.equal(
        (
          await admin.send(
            'PATCH',
            '/api/v1/admin/settings',
            { changes: { 'ai.concurrency': 0 } },
            { 'if-match': tag },
          )
        ).response.statusCode,
        400,
      );
      assert.equal(
        (await admin.send('PATCH', '/api/v1/admin/settings', { changes: { 'ai.dailyLimit': 1 } }))
          .response.statusCode,
        428,
      );
      proof.push('validation-and-preconditions');
      const saved = await admin.send(
        'PATCH',
        '/api/v1/admin/settings',
        {
          changes: {
            'ai.dailyLimit': 1,
            'quota.pendingSources': 2,
            'service.origin': 'https://next.invalid',
            'deploy.api.cpu': 0.5,
          },
        },
        { 'if-match': tag },
      );
      assert.equal(saved.response.statusCode, 200);
      assert.equal(saved.body.revision, 1);
      assert.equal(resourceLimits().pendingSources, 2);
      proof.push('file-save-updates-real-runtime-consumer');
      assert.equal(
        (
          await admin.send(
            'PATCH',
            '/api/v1/admin/settings',
            { changes: { 'ai.dailyLimit': 8 } },
            { 'if-match': tag },
          )
        ).response.statusCode,
        412,
      );
      proof.push('stale-browser-cannot-overwrite');
      const guard = new PgCallControl(database.pool, () => settingNumber('ai.dailyLimit'));
      const provider = {
        baseUrl: 'https://example.invalid',
        model: 'fake',
        apiKey: 'synthetic',
        builtIn: true,
      };
      await guard.run(provider, async () => 'first');
      await assert.rejects(guard.run(provider, async () => 'second'));
      await admin.send(
        'PATCH',
        '/api/v1/admin/settings',
        { changes: { 'ai.dailyLimit': 2 } },
        { 'if-match': '"settings:1"' },
      );
      await guard.run(provider, async () => 'second');
      assert.equal(
        (await database.pool.query('SELECT calls FROM ai_daily_usage')).rows[0].calls,
        2,
      );
      proof.push('PG-budget-takes-effect-without-counter-reset');
      const secret = 'a-synthetic-model-secret-for-redaction';
      const masked = await admin.send(
        'PATCH',
        '/api/v1/admin/settings',
        {
          changes: {
            'model.language.baseUrl': 'https://example.invalid/v1',
            'model.language.model': 'fake',
            'model.language.apiKey': secret,
          },
        },
        { 'if-match': '"settings:2"' },
      );
      assert.equal(masked.response.statusCode, 200);
      assert.equal(masked.response.body.includes(secret), false);
      assert.equal((await readFile(store.file, 'utf8')).includes(secret), false);
      proof.push('secret-not-in-response-or-plaintext-config');
      await app.close();
      app = undefined;
      store = await new SettingsStore(directory, true, key, {
        WANWU_APP_ORIGIN: origin,
        WANWU_CLOUD_AUTH_MODE: 'session',
      }).load();
      useSettings(store);
      assert.equal(settingNumber('ai.dailyLimit'), 2);
      assert.equal(store.value('service.origin'), origin);
      assert.equal(store.view().items.find((i) => i.key === 'deploy.api.cpu')!.pending, true);
      proof.push('restart-persists-settings-and-deployment-stays-pending');
      // Business-disabled mode still has an HTTPS/CSRF-protected, admin-only recovery entrance.
      app = await buildApp({ ...config, cloudAuthMode: 'disabled' }, database);
      const recovery = new Client();
      assert.equal((await recovery.login('settings_admin')).response.statusCode, 200);
      assert.equal((await recovery.send('GET', '/api/v1/admin/settings')).response.statusCode, 200);
      assert.equal((await recovery.send('GET', '/api/v1/auth/me')).response.statusCode, 503);
      proof.push('admin-recovery-does-not-open-disabled-business');
      const restored = await recovery.send(
        'POST',
        '/api/v1/admin/settings/restore',
        { revision: 0 },
        { 'if-match': '"settings:3"' },
      );
      assert.equal(restored.response.statusCode, 200);
      assert.equal(restored.body.revision, 4);
      assert.equal(settingNumber('ai.dailyLimit'), 2000);
      proof.push('restore-creates-a-new-audited-version');
      const html = await recovery.send('GET', '/api/v1/admin/settings/page');
      assert.equal(html.response.statusCode, 200);
      assert.match(
        html.response.headers['content-security-policy'] as string,
        /frame-ancestors 'none'/,
      );
      proof.push('management-page-has-csp');
      assert.equal(
        (
          await recovery.send(
            'POST',
            '/api/v1/admin/settings/apply',
            {},
            { 'if-match': '"settings:4"' },
          )
        ).response.statusCode,
        503,
      );
      await writeFile(
        join(directory, 'controller-status.json'),
        JSON.stringify(
          signed(
            { format: 1, at: new Date().toISOString(), phase: 'idle' },
            Buffer.from(key, 'hex'),
          ),
        ),
        { mode: 0o600 },
      );
      const applied = await recovery.send(
        'POST',
        '/api/v1/admin/settings/apply',
        {},
        { 'if-match': '"settings:4"' },
      );
      assert.equal(applied.response.statusCode, 202);
      const request = verified(
        JSON.parse(await readFile(join(directory, 'apply-request.json'), 'utf8')),
        Buffer.from(key, 'hex'),
      );
      assert.equal(request?.actor, actor.id);
      assert.equal(request?.revision, 4);
      assert.equal(
        (
          await recovery.send(
            'POST',
            '/api/v1/admin/settings/apply',
            {},
            { 'if-match': '"settings:4"' },
          )
        ).response.statusCode,
        412,
      );
      proof.push('signed-bounded-apply-request-and-duplicate-protection');
      console.log(
        'WANWU_SETTINGS_PROOF ' +
          JSON.stringify({
            status: 'pass',
            checks: proof,
            modelNetworkCalls: 0,
            persistentDatabase: true,
            plaintextSecretsPrinted: false,
          }),
      );
    } finally {
      await app?.close();
      useSettings();
      await database.close();
      await owner.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
