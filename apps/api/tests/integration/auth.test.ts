import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import type { Session } from 'fastify';
import { buildApp } from '../../src/app.ts';
import { COOKIE_NAME } from '../../src/auth/cookie.ts';
import { openDatabase } from '../../src/db/client.ts';
import { migrate } from '../../src/db/migrate.ts';
import { bootstrap } from '../../src/db/bootstrap.ts';
import { firstAdmin } from '../../src/accounts.ts';
import { Passwords, randomToken, tokenDigest } from '../../src/security.ts';
import { PgSessionStore } from '../../src/session-store.ts';
import { parseApiFailure } from '@wanwu-v2/contracts/api';
import { DEFAULT_COMPOSE_SETTINGS } from '@wanwu-v2/contracts/work';
import { LocalObjectStore } from '../helpers/localStore.ts';
import { mediaBoss } from '../../src/jobs/mediaQueue.ts';
import { auditFoundation } from '../../src/maintenance/foundationAudit.ts';

const origin = 'https://voiceatalass.netlify.app',
  password = 'a disposable teacher test passphrase';
const adminPassword = 'a disposable administrator passphrase';
let app: Awaited<ReturnType<typeof buildApp>>,
  owner: ReturnType<typeof openDatabase>,
  database: ReturnType<typeof openDatabase>,
  admin: Client;
const config = {
  origin,
  sessionSecret: randomToken(),
  cloudAuthMode: 'session' as const,
  trustedProxyAddresses: ['127.0.0.1', '::1'],
};
let postgresVersion = '';
let objects: LocalObjectStore;
const application = () =>
  buildApp(config, database, true, {
    pool: database.pool,
    boss: mediaBoss(database.pool),
    store: objects,
    origin,
  });

class Client {
  cookie = '';
  csrf = '';
  async send(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: Record<string, unknown>,
    expected = 200,
    headers: Record<string, string> = {},
  ) {
    const result = await app.inject({
      method,
      url,
      payload,
      remoteAddress: '127.0.0.1',
      headers: {
        origin,
        'x-forwarded-proto': 'https',
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(this.csrf ? { 'x-csrf-token': this.csrf } : {}),
        ...headers,
      },
    });
    const body = result.body ? result.json() : {};
    assert.equal(
      result.statusCode,
      expected,
      `${method} ${url}: ${body.reason ?? 'status mismatch'}`,
    );
    if (expected >= 400)
      assert.ok(parseApiFailure(body), 'Failure body must follow the shared v0.6 contract');
    const cookies = result.headers['set-cookie'],
      values = Array.isArray(cookies) ? cookies : cookies ? [cookies] : [];
    const updated = values.filter((value) => value.startsWith(COOKIE_NAME + '=')).at(-1);
    if (updated) this.cookie = updated.split(';')[0]!;
    if (body.csrfToken) this.csrf = body.csrfToken;
    return { result, body };
  }
  async start() {
    await this.send('GET', '/api/v1/auth/csrf');
    return this;
  }
}
async function invited() {
  const { body } = await admin.send('POST', '/api/v1/admin/invitations', {}, 201);
  return body as { id: string; code: string };
}
async function teacher() {
  const username = `teacher_${randomUUID().slice(0, 8)}`,
    invitation = await invited(),
    client = await new Client().start();
  const { body } = await client.send(
    'POST',
    '/api/v1/auth/register',
    { username, password, invitationCode: invitation.code },
    201,
  );
  return { client, username, id: body.account.id as string };
}

before(async () => {
  const ownerUrl = process.env.WANWU_TEST_OWNER_DATABASE_URL ?? '',
    appUrl = process.env.WANWU_TEST_DATABASE_URL ?? '';
  for (const value of [ownerUrl, appUrl]) {
    const url = new URL(value),
      host = process.env.WANWU_TEST_PG_HOST;
    assert.ok(host && /^wanwu-auth-test-[a-f0-9-]{36}$/.test(host));
    assert.equal(url.hostname, host);
    assert.ok(
      /^\/wanwu_sound_test_[a-f0-9]{8}$/.test(url.pathname),
      'Only disposable local databases may run these tests',
    );
  }
  owner = openDatabase(ownerUrl, 'owner');
  database = openDatabase(appUrl);
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      await owner.pool.query('SELECT 1');
      break;
    } catch {
      if (Date.now() > deadline) throw new Error('The disposable PostgreSQL did not become ready');
      await delay(200);
    }
  }
  await bootstrap(owner.pool, process.env.WANWU_TEST_APP_DB_PASSWORD ?? '');
  postgresVersion = (await owner.pool.query('SHOW server_version')).rows[0].server_version;
  assert.ok(postgresVersion.startsWith('17.'));
  const passwords = new Passwords();
  await passwords.ready();
  await firstAdmin(owner.db, passwords, 'administrator', adminPassword);
  objects = await LocalObjectStore.create();
  app = await application();
  admin = await new Client().start();
  await admin.send('POST', '/api/v1/auth/login', {
    username: 'administrator',
    password: adminPassword,
  });
});
after(async () => {
  await app?.close();
  await database?.close();
  await owner?.close();
  await objects?.close();
});

test('foundation audit is read-only and real sessions survive API/pool replacement', async () => {
  const { client, id } = await teacher();
  const cookie = client.cookie;
  const before = await auditFoundation(owner.pool);
  assert.equal(before.status, 'pass');
  assert.equal(before.activeAdministrators, 1);
  await app.close();
  await database.close();
  database = openDatabase(process.env.WANWU_TEST_DATABASE_URL!);
  app = await application();
  client.cookie = cookie;
  assert.equal((await client.send('GET', '/api/v1/auth/me')).body.account.id, id);
  assert.equal((await auditFoundation(owner.pool)).status, 'pass');
});

test('public version is available without a session and never returns runtime secrets', async () => {
  const response = await app.inject({ url: '/api/v1/version' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(Object.keys(response.json()).sort(), [
    'commit',
    'contractVersion',
    'dirty',
    'sourceDigest',
  ]);
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('cloud drafts are account-owned, readable on another device, and reject stale revisions', async () => {
  const a = await teacher(),
    b = await teacher(),
    id = `work:${randomUUID()}`;
  const content = {
    id,
    title: '草稿甲',
    arrangement: {
      version: 'arrangement-v1',
      id,
      units: [],
      events: [],
      rows: 3,
      spanSeconds: 30,
      mood: null,
      origin: 'child',
      updatedAt: new Date().toISOString(),
    },
    settings: DEFAULT_COMPOSE_SETTINGS,
  };
  await a.client.send('POST', '/api/v1/works', content, 201);
  await b.client.send('GET', `/api/v1/works/${id}`, undefined, 404);
  await b.client.send('GET', `/api/v1/works/${id}/facts`, undefined, 404);
  const derived = await a.client.send('GET', `/api/v1/works/${id}/facts`);
  assert.equal(derived.body.provenance, 'server-work');
  assert.equal(derived.body.revision, 1);
  assert.equal(derived.body.seconds, 30);
  assert.equal(
    (await a.client.send('GET', '/api/v1/account/usage')).body.accounting,
    'conservative-reservations',
  );
  const secondDevice = await new Client().start();
  await secondDevice.send('POST', '/api/v1/auth/login', { username: a.username, password });
  const opened = await secondDevice.send('GET', `/api/v1/works/${id}`);
  assert.equal(opened.body.title, content.title);
  const etag = String(opened.result.headers.etag);
  await a.client.send('PATCH', `/api/v1/works/${id}`, { title: '草稿乙' }, 200, {
    'if-match': etag,
  });
  await secondDevice.send('PATCH', `/api/v1/works/${id}`, { title: '过期修改' }, 412, {
    'if-match': etag,
  });
  assert.equal((await secondDevice.send('GET', `/api/v1/works/${id}`)).body.title, '草稿乙');
});

test('registration establishes a real PostgreSQL session, secure host-only cookie, and a minimal account view', async () => {
  const invitation = await invited(),
    client = await new Client().start(),
    oldCookie = client.cookie;
  const oldCsrf = client.csrf;
  const { body, result } = await client.send(
    'POST',
    '/api/v1/auth/register',
    { username: 'Upper_CASE', password, invitationCode: invitation.code },
    201,
  );
  assert.equal(body.account.username, 'upper_case');
  assert.equal(body.account.role, 'teacher');
  assert.ok(oldCookie !== client.cookie, 'Session ID must rotate');
  const header = String(result.headers['set-cookie']);
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/'])
    assert.ok(header.includes(attribute), `Missing ${attribute}`);
  assert.ok(!/Domain=/i.test(header), 'No Domain attribute');
  const setCookies = result.headers['set-cookie'];
  assert.equal(
    Array.isArray(setCookies) ? setCookies.length : 1,
    1,
    'Rotation should not require duplicate Set-Cookie headers',
  );
  assert.ok(oldCsrf !== client.csrf, 'The CSRF token must rotate together with the session');
  await client.send('POST', '/api/v1/auth/logout', undefined, 403, { 'x-csrf-token': oldCsrf });
  assert.deepEqual(Object.keys(body.account).sort(), [
    'id',
    'nickname',
    'role',
    'status',
    'username',
  ]);
  await client.send('GET', '/api/v1/auth/me');
  const rows = await owner.pool.query('SELECT digest,data FROM sessions WHERE account_id=$1', [
    body.account.id,
  ]);
  assert.equal(rows.rowCount, 1);
  assert.ok(rows.rows[0].digest !== client.cookie, 'Only the session digest is stored');
  const old = await app.inject({
    url: '/api/v1/auth/me',
    remoteAddress: '127.0.0.1',
    headers: { cookie: oldCookie, 'x-forwarded-proto': 'https' },
  });
  assert.equal(old.statusCode, 401, 'Old anonymous session must not become authenticated');
});

test('one invitation concurrently registers at most one account, with no orphaned loser', async () => {
  const invitation = await invited(),
    clients = await Promise.all([new Client().start(), new Client().start()]);
  const names = [`race_${randomUUID().slice(0, 8)}`, `race_${randomUUID().slice(0, 8)}`];
  const statuses = await Promise.all(
    clients.map(async (client, i) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        remoteAddress: '127.0.0.1',
        headers: {
          cookie: client.cookie,
          origin,
          'x-forwarded-proto': 'https',
          'x-csrf-token': client.csrf,
        },
        payload: { username: names[i], password, invitationCode: invitation.code },
      });
      return response.statusCode;
    }),
  );
  assert.deepEqual(statuses.sort(), [201, 400]);
  assert.equal(
    (
      await owner.pool.query(
        'SELECT count(*)::int AS count FROM accounts WHERE username=ANY($1::text[])',
        [names],
      )
    ).rows[0].count,
    1,
  );
  const stored = (
    await owner.pool.query('SELECT digest,redeemed_by,redeemed_at FROM invitations WHERE id=$1', [
      invitation.id,
    ])
  ).rows[0];
  assert.ok(stored.digest === tokenDigest(invitation.code));
  assert.ok(stored.redeemed_by && stored.redeemed_at);
  const { body } = await admin.send('GET', '/api/v1/admin/invitations');
  assert.ok(
    body.invitations.every(
      (item: Record<string, unknown>) => !('code' in item) && !('digest' in item),
    ),
  );
});

test('expired and revoked invitations fail, and a duplicate username does not consume a fresh invitation', async () => {
  const existing = await teacher(),
    fresh = await invited(),
    client = await new Client().start();
  await client.send(
    'POST',
    '/api/v1/auth/register',
    { username: existing.username, password, invitationCode: fresh.code },
    409,
  );
  await client.send(
    'POST',
    '/api/v1/auth/register',
    { username: `reuse_${randomUUID().slice(0, 8)}`, password, invitationCode: fresh.code },
    201,
  );
  const expired = await invited();
  await owner.pool.query(
    "UPDATE invitations SET created_at=now()-INTERVAL '2 days',expires_at=now()-INTERVAL '1 day' WHERE id=$1",
    [expired.id],
  );
  const visitor = await new Client().start();
  await visitor.send(
    'POST',
    '/api/v1/auth/register',
    { username: 'expired_invite', password, invitationCode: expired.code },
    400,
  );
  const revoked = await invited();
  await admin.send('DELETE', `/api/v1/admin/invitations/${revoked.id}`, undefined, 204);
  await visitor.send(
    'POST',
    '/api/v1/auth/register',
    { username: 'revoked_invite', password, invitationCode: revoked.code },
    400,
  );
});

test('CSRF, source, TLS forwarding, role fields and fabricated identity headers cannot grant access', async () => {
  const client = await new Client().start();
  await client.send(
    'POST',
    '/api/v1/auth/login',
    { username: 'administrator', password: adminPassword },
    403,
    { 'x-csrf-token': 'forged' },
  );
  await client.send(
    'POST',
    '/api/v1/auth/login',
    { username: 'administrator', password: adminPassword },
    403,
    { origin: 'https://untrusted.example' },
  );
  const fake = await app.inject({
    url: '/api/v1/auth/me',
    remoteAddress: '127.0.0.1',
    headers: {
      'x-forwarded-proto': 'https',
      'x-user-id': 'administrator',
      'x-role': 'admin',
      'x-openai-user-id': 'administrator',
    },
  });
  assert.equal(fake.statusCode, 401);
  const insecure = await app.inject({
    url: '/api/v1/auth/csrf',
    remoteAddress: '10.0.0.2',
    headers: { 'x-forwarded-proto': 'https' },
  });
  assert.equal(
    insecure.statusCode,
    400,
    'Untrusted peers must not spoof TLS through forwarding headers',
  );
  const invitation = await invited();
  await client.send(
    'POST',
    '/api/v1/auth/register',
    { username: 'escalation', password, invitationCode: invitation.code, role: 'admin' },
    400,
  );
  const normal = await teacher();
  await normal.client.send('POST', '/api/v1/admin/invitations', {}, 403, { 'x-role': 'admin' });
  await assert.rejects(
    database.pool.query("UPDATE accounts SET role='admin' WHERE id=$1", [normal.id]),
    (error) => (error as { code?: string }).code === '42501',
  );
});

test('logout revokes its ID and concurrent stale saves cannot resurrect it', async () => {
  const normal = await teacher(),
    oldCookie = normal.client.cookie;
  await normal.client.send('POST', '/api/v1/auth/logout', undefined, 204);
  const result = await app.inject({
    url: '/api/v1/auth/me',
    remoteAddress: '127.0.0.1',
    headers: { cookie: oldCookie, 'x-forwarded-proto': 'https' },
  });
  assert.equal(result.statusCode, 401);
  const store = new PgSessionStore(database.pool);
  const save = (id: string, data: Session) =>
    new Promise<void>((resolve, reject) =>
      store.set(id, data, (error) => (error ? reject(error) : resolve())),
    );
  const destroy = (id: string) =>
    new Promise<void>((resolve, reject) =>
      store.destroy(id, (error) => (error ? reject(error) : resolve())),
    );
  const get = (id: string) =>
    new Promise<Session | null>((resolve, reject) =>
      store.get(id, (error, data) => (error ? reject(error) : resolve(data ?? null))),
    );
  for (let i = 0; i < 6; i++) {
    const id = randomToken(),
      data: Session = {
        cookie: {
          originalMaxAge: 86400000,
          secure: true,
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
        },
        firstSeenAt: new Date().toISOString(),
        csrfToken: randomToken(),
      };
    await save(id, data);
    await Promise.allSettled(i % 2 ? [destroy(id), save(id, data)] : [save(id, data), destroy(id)]);
    assert.equal(await get(id), null, 'Revocation must survive overlapping persistence');
    await assert.rejects(save(id, data));
  }
});

test('changing password invalidates all devices and the old password', async () => {
  const normal = await teacher(),
    second = await new Client().start(),
    oldCookie = normal.client.cookie;
  await second.send('POST', '/api/v1/auth/login', { username: normal.username, password });
  const next = 'a different disposable long passphrase';
  await normal.client.send(
    'POST',
    '/api/v1/auth/change-password',
    { oldPassword: password, password: next },
    204,
  );
  await second.send('GET', '/api/v1/auth/me', undefined, 401);
  const stale = await app.inject({
    url: '/api/v1/auth/me',
    remoteAddress: '127.0.0.1',
    headers: { cookie: oldCookie, 'x-forwarded-proto': 'https' },
  });
  assert.equal(stale.statusCode, 401);
  const fresh = await new Client().start();
  await fresh.send('POST', '/api/v1/auth/login', { username: normal.username, password }, 401);
  await fresh.send('POST', '/api/v1/auth/login', { username: normal.username, password: next });
});

test('reset links are single-use, expire, replace old links, and revoke prior sessions', async () => {
  const normal = await teacher(),
    visitor = await new Client().start();
  const issue = async () => {
    const { body } = await admin.send(
      'POST',
      `/api/v1/admin/accounts/${normal.id}/password-reset`,
      {},
      201,
    );
    const url = new URL(body.resetUrl);
    assert.equal(url.origin, origin);
    assert.equal(url.search, '');
    return new URLSearchParams(url.hash.slice(1)).get('token')!;
  };
  const old = await issue(),
    current = await issue();
  await visitor.send('POST', '/api/v1/auth/reset-password', { token: old, password }, 400);
  await visitor.send(
    'POST',
    '/api/v1/auth/reset-password',
    { token: current, password: 'a reset disposable long passphrase' },
    204,
  );
  await normal.client.send('GET', '/api/v1/auth/me', undefined, 401);
  const retry = await new Client().start();
  await retry.send('POST', '/api/v1/auth/reset-password', { token: current, password }, 400);
  const expired = await issue();
  await owner.pool.query(
    "UPDATE password_resets SET created_at=now()-INTERVAL '1 hour',expires_at=now()-INTERVAL '1 minute' WHERE digest=$1",
    [tokenDigest(expired)],
  );
  await retry.send('POST', '/api/v1/auth/reset-password', { token: expired, password }, 400);
});

test('disabled accounts cannot log in, retain sessions or regain old sessions after re-enable', async () => {
  const normal = await teacher(),
    oldCookie = normal.client.cookie;
  await admin.send('PATCH', `/api/v1/admin/accounts/${normal.id}`, { status: 'disabled' });
  await normal.client.send('GET', '/api/v1/auth/me', undefined, 401);
  const fresh = await new Client().start();
  await fresh.send('POST', '/api/v1/auth/login', { username: normal.username, password }, 403);
  await admin.send('PATCH', `/api/v1/admin/accounts/${normal.id}`, { status: 'active' });
  const stale = await app.inject({
    url: '/api/v1/auth/me',
    remoteAddress: '127.0.0.1',
    headers: { cookie: oldCookie, 'x-forwarded-proto': 'https' },
  });
  assert.equal(stale.statusCode, 401);
  await fresh.send('POST', '/api/v1/auth/login', { username: normal.username, password });
});

test('idle/absolute expiry, invitation/credential throttling and disabled mode fail closed', async () => {
  const normal = await teacher();
  await owner.pool.query(
    "UPDATE sessions SET expires_at=now()-INTERVAL '1 second' WHERE account_id=$1",
    [normal.id],
  );
  await normal.client.send('GET', '/api/v1/auth/me', undefined, 401);
  const fresh = await new Client().start();
  await fresh.send('POST', '/api/v1/auth/login', { username: normal.username, password });
  await owner.pool.query(
    "UPDATE sessions SET created_at=now()-INTERVAL '8 days',expires_at=now()-INTERVAL '1 day',absolute_expires_at=now()-INTERVAL '1 day' WHERE account_id=$1",
    [normal.id],
  );
  await fresh.send('GET', '/api/v1/auth/me', undefined, 401);
  const probe = await new Client().start();
  for (let i = 0; i < 10; i++)
    await probe.send('POST', '/api/v1/auth/login', { username: 'nonexistent_user', password }, 401);
  const limited = await probe.send(
    'POST',
    '/api/v1/auth/login',
    { username: 'nonexistent_user', password },
    429,
  );
  assert.ok(
    Number(limited.result.headers['retry-after']) > 500,
    'Retry-After must describe the real remaining cooldown',
  );
  const disabled = await buildApp({ ...config, cloudAuthMode: 'disabled' }, database);
  try {
    assert.equal((await disabled.inject('/api/v1/health')).statusCode, 200);
    assert.equal((await disabled.inject('/api/v1/auth/csrf')).statusCode, 503);
  } finally {
    await disabled.close();
  }
});

test('migrations are repeatable and the app role cannot modify roles, audit history or schema', async () => {
  await migrate(owner.pool);
  assert.deepEqual(
    (await owner.pool.query('SELECT name FROM _wanwu_migrations ORDER BY name')).rows.map(
      (row) => row.name,
    ),
    [
      '0001_accounts.sql',
      '0002_creation.sql',
      '0003_excerpts.sql',
      '0004_maintenance.sql',
      '0005_renderer_runtime.sql',
      '0006_backup_pins.sql',
      '0007_ai_runtime.sql',
      '0008_storage_checks.sql',
      '0009_source_admission.sql',
    ],
  );
  await assert.rejects(
    bootstrap(owner.pool, 'a different disposable database password'),
    /does not match/,
  );
  for (const statement of [
    'CREATE TABLE should_not_exist(id int)',
    'DELETE FROM admin_audit',
    'SELECT * FROM _wanwu_migrations',
    'DELETE FROM backup_object_pins',
  ]) {
    await assert.rejects(
      database.pool.query(statement),
      (error) => (error as { code?: string }).code === '42501',
    );
  }
  assert.ok(
    (await owner.pool.query('SELECT count(*)::int AS count FROM admin_audit')).rows[0].count > 0,
  );
});

test('proxy trust can name the exact deployment gateway without trusting the entire Docker subnet', async () => {
  const trusted = await buildApp({ ...config, trustedProxyAddresses: ['172.30.19.1'] }, database);
  try {
    assert.equal(
      (
        await trusted.inject({
          url: '/api/v1/auth/csrf',
          remoteAddress: '172.30.19.1',
          headers: { 'x-forwarded-proto': 'https' },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await trusted.inject({
          url: '/api/v1/auth/csrf',
          remoteAddress: '172.30.19.2',
          headers: { 'x-forwarded-proto': 'https' },
        })
      ).statusCode,
      400,
    );
  } finally {
    await trusted.close();
  }
});

test('one reset credential racing in two sessions can change the password only once', async () => {
  const normal = await teacher(),
    issued = await admin.send(
      'POST',
      `/api/v1/admin/accounts/${normal.id}/password-reset`,
      {},
      201,
    );
  const secret = new URLSearchParams(new URL(issued.body.resetUrl).hash.slice(1)).get('token');
  const clients = await Promise.all([new Client().start(), new Client().start()]);
  const statuses = await Promise.all(
    clients.map(async (client, i) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        remoteAddress: '127.0.0.1',
        headers: {
          cookie: client.cookie,
          origin,
          'x-forwarded-proto': 'https',
          'x-csrf-token': client.csrf,
        },
        payload: { token: secret, password: `a disposable racing passphrase ${i}` },
      });
      return response.statusCode;
    }),
  );
  assert.deepEqual(statuses.sort(), [204, 400]);
});

test('the actual Linux API runtime is non-root, capability-free and within its enforced initial resource budget', async () => {
  assert.equal(process.platform, 'linux');
  assert.notEqual(process.getuid?.(), 0);
  const status = await readFile('/proc/self/status', 'utf8');
  assert.match(status, /^NoNewPrivs:\s+1$/m);
  assert.match(status, /^CapEff:\s+0+$/m);
  const read = async (file: string) => (await readFile(`/sys/fs/cgroup/${file}`, 'utf8')).trim();
  assert.equal(Number(await read('memory.max')), 256 * 1024 ** 2);
  assert.equal(await read('memory.swap.max'), '0');
  assert.equal(Number(await read('pids.max')), 128);
  const [quota, period] = (await read('cpu.max')).split(/\s+/).map(Number);
  assert.equal(quota! / period!, 0.25);
  const events = Object.fromEntries(
    (await read('memory.events')).split('\n').map((line) => {
      const [key, value] = line.split(/\s+/);
      return [key, Number(value)];
    }),
  );
  assert.equal(events.oom, 0);
  assert.equal(events.oom_kill, 0);
  const pidEvents = Object.fromEntries(
    (await read('pids.events')).split('\n').map((line) => {
      const [key, value] = line.split(/\s+/);
      return [key, Number(value)];
    }),
  );
  assert.equal(pidEvents.max, 0);
  console.log(
    'WANWU_AUTH_TEST_PROOF ' +
      JSON.stringify({
        status: 'pass',
        nonRoot: true,
        cpu: 0.25,
        memoryLimit: 256 * 1024 ** 2,
        memoryPeak: Number(await read('memory.peak')),
        memoryEvents: events,
        pidEvents,
        postgresVersion,
        noPublishedPorts: true,
      }),
  );
});
