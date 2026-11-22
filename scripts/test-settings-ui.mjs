// Browser behaviour/layout gate using the real settings routes and file store.
// Disposable local authentication fixture only; production PG auth is separately tested by test:settings.
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import { chromium } from 'playwright';
import { mkdtemp, chmod, readFile, rm, mkdir, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { SettingsStore, useSettings } from '../apps/api/src/settings/store.ts';
import { settingsRoutes } from '../apps/api/src/settings/routes.ts';
import { ApiError } from '../apps/api/src/errors.ts';
import { signed, verified } from '../apps/api/src/settings/signature.ts';

const scratch = await mkdtemp(join(tmpdir(), 'wanwu-ui-'));
await chmod(scratch, 0o700);
const artifacts = new URL('../artifacts/settings-ui/', import.meta.url);
await mkdir(artifacts, { recursive: true, mode: 0o700 });
let app, browser;
const checks = [];
try {
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      join(scratch, 'key.pem'),
      '-out',
      join(scratch, 'cert.pem'),
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
    ],
    { stdio: 'ignore' },
  );
  const controllerKey = randomBytes(32);
  const store = await new SettingsStore(scratch, true, controllerKey.toString('hex'), {}).load();
  useSettings(store);
  app = Fastify({
    https: {
      key: await readFile(join(scratch, 'key.pem')),
      cert: await readFile(join(scratch, 'cert.pem')),
    },
  });
  await app.register(cookie);
  await app.register(session, {
    cookieName: '__Host-wanwu',
    secret: randomBytes(32).toString('hex'),
    saveUninitialized: false,
    cookie: { secure: true, httpOnly: true, sameSite: 'lax' },
  });
  let origin;
  app.addHook('onRequest', async () => {
    await store.refresh();
  });
  app.addHook('preHandler', async (request) => {
    if (
      request.method !== 'GET' &&
      (request.headers.origin !== origin ||
        request.headers['x-csrf-token'] !== request.session.csrfToken)
    )
      throw new ApiError(403, 'csrf-failed');
  });
  app.setErrorHandler((error, request, reply) => {
    // Match the actual application's session-clearing behaviour on a protected anonymous read.
    if (error.reason === 'needs-account') {
      Reflect.set(request, 'session', null);
      reply.clearCookie('__Host-wanwu', {
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
      });
    }
    reply.code(error.status ?? 500).send({ reason: error.reason ?? 'internal-error' });
  });
  settingsRoutes(app, {
    accounts: {
      async login(username, password) {
        if (username !== 'fixture_admin' || password !== 'synthetic browser fixture passphrase')
          throw new ApiError(401, 'invalid-credentials');
        return { id: 'fixture-admin', role: 'admin', authVersion: 1 };
      },
    },
    async authenticated(request) {
      if (request.session.accountId !== 'fixture-admin') throw new ApiError(401, 'needs-account');
      return { id: 'fixture-admin', role: 'admin', authVersion: 1 };
    },
  });
  origin = await app.listen({ host: '127.0.0.1', port: 0 });
  let executablePath = chromium.executablePath();
  try {
    await access(executablePath);
  } catch {
    executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    await access(executablePath);
  }
  browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin + '/api/v1/admin/settings/page');
  await page.locator('#login:not([hidden])').waitFor();
  await page.locator('[name=username]').fill('fixture_admin');
  await page.locator('[name=password]').fill('synthetic browser fixture passphrase');
  await page.getByRole('button', { name: '登录管理台', exact: true }).click();
  await page.locator('#workspace:not([hidden])').waitFor();
  checks.push('browser-session-login');
  checks.push('login-renews-csrf-after-anonymous-cookie-clearing');
  const daily = page.locator('[id="field-ai.dailyLimit"]');
  await daily.fill('1234');
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await page.waitForFunction(
    () => document.getElementById('revision').textContent === '配置版本 1',
  );
  assert.equal(store.value('ai.dailyLimit'), 1234);
  checks.push('browser-save-changes-real-config-file');
  const tab = await context.newPage();
  await tab.goto(origin + '/api/v1/admin/settings/page');
  await tab.locator('#workspace:not([hidden])').waitFor();
  await daily.fill('1235');
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await page.waitForFunction(
    () => document.getElementById('revision').textContent === '配置版本 2',
  );
  await tab.locator('[id="field-ai.dailyLimit"]').fill('4567');
  await tab.getByRole('button', { name: '保存配置', exact: true }).click();
  await tab.waitForFunction(() =>
    document.getElementById('message').textContent.includes('其他管理员'),
  );
  assert.equal(await tab.locator('[id="field-ai.dailyLimit"]').inputValue(), '4567');
  assert.equal(store.value('ai.dailyLimit'), 1235);
  checks.push('conflict-preserves-unsaved-browser-input');
  await tab.close();
  await page.locator('#search').fill('quota.');
  assert.ok((await page.locator('.row:visible').count()) > 0);
  assert.equal(await page.locator('.row:visible').count(), 6);
  checks.push('configuration-search');
  await page.locator('#search').fill('');
  await page.locator('#effect').selectOption('release');
  await page.locator('[id="field-release.music.mix"]').fill('{not json');
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await page.locator('[id="error-release.music.mix"]').filter({ hasText: 'JSON' }).waitFor();
  assert.equal(store.view().revision, 2);
  checks.push('rule-validation-keeps-file-unchanged');
  await page.getByRole('button', { name: '放弃修改', exact: true }).click();
  await page.locator('#effect').selectOption('all');
  await page.locator('.history').first().locator('summary').click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.audit').filter({ hasText: '版本 0' }).getByRole('button').click();
  await page.waitForFunction(
    () => document.getElementById('revision').textContent === '配置版本 3',
  );
  assert.equal(store.value('ai.dailyLimit'), 2000);
  checks.push('browser-history-restore');
  await page.reload();
  await page.locator('#workspace:not([hidden])').waitFor();
  assert.equal(await daily.inputValue(), '2000');
  checks.push('refresh-retains-saved-configuration');
  // Local receipt fixture exercises the browser protocol; it never launches a host command.
  const control = async (phase, extra = {}) =>
    writeFile(
      join(scratch, 'controller-status.json'),
      JSON.stringify(
        signed(
          {
            format: 1,
            at: new Date().toISOString(),
            phase,
            message: phase === 'applied' ? '配置已应用' : '本机应用状态测试',
            ...extra,
          },
          controllerKey,
        ),
      ),
      { mode: 0o600 },
    );
  await control('idle');
  await page.getByRole('button', { name: '重新读取', exact: true }).click();
  await page.locator('[id="field-proxy.defaultReadSeconds"]').fill('21');
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await page.waitForFunction(
    () => document.getElementById('revision').textContent === '配置版本 4',
  );
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '应用重启与部署设置', exact: true }).click();
  let job;
  for (let i = 0; i < 60; i++) {
    try {
      job = verified(
        JSON.parse(await readFile(join(scratch, 'apply-request.json'), 'utf8')),
        controllerKey,
      );
    } catch {}
    if (job) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(job?.revision, 4);
  await writeFile(
    join(scratch, 'applied.json'),
    JSON.stringify(
      signed(
        { format: 1, revision: 4, effective: { 'proxy.defaultReadSeconds': 21 } },
        controllerKey,
      ),
    ),
    { mode: 0o600 },
  );
  await control('applied', { requestId: job.id, revision: 4 });
  await page.waitForFunction(() => document.getElementById('message').textContent === '配置已应用');
  assert.equal(store.value('proxy.defaultReadSeconds'), 21);
  checks.push('browser-queues-signed-application-and-confirms-receipt');
  await page.screenshot({ path: new URL('desktop.png', artifacts).pathname });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  const savebar = await page.locator('.savebar').boundingBox();
  assert.ok(
    savebar && savebar.y >= 0 && savebar.y + savebar.height <= 845,
    'mobile save controls must stay inside the viewport',
  );
  await page.screenshot({ path: new URL('mobile.png', artifacts).pathname });
  checks.push('desktop-and-mobile-layout');
  assert.deepEqual(errors, []);
  const proof = {
    status: 'pass',
    checks,
    scope:
      'isolated local browser, real settings routes/file; test:settings separately verifies actual PostgreSQL auth',
    modelNetworkCalls: 0,
  };
  await writeFile(new URL('proof.json', artifacts), JSON.stringify(proof, null, 2) + '\n', {
    mode: 0o600,
  });
  console.log(JSON.stringify(proof));
} finally {
  await browser?.close();
  await app?.close();
  useSettings();
  await rm(scratch, { recursive: true, force: true });
}
