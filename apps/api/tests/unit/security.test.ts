import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLogin,
  parseRegistration,
  validPassword,
  exactObject,
} from '@wanwu-v2/contracts/account';
import { dedicatedDatabaseUrl, readConfig } from '../../src/config.ts';
import { Passwords, randomToken, tokenDigest, sameToken } from '../../src/security.ts';
import { parseApiFailure } from '@wanwu-v2/contracts/api';

const password = 'A disposable test passphrase_123';
test('registration validates exact fields, independent username, passphrases and invitation shape', () => {
  const invitationCode = randomToken();
  assert.equal(
    parseRegistration({ username: 'Teacher_A', password, invitationCode })?.username,
    'teacher_a',
  );
  for (const body of [
    { username: 'ab', password, invitationCode },
    { username: 'teacher@example.com', password, invitationCode },
    { username: 'teacher', password: 'too short', invitationCode },
    { username: 'teacher', password, invitationCode: 'bad' },
    { username: 'teacher', password, invitationCode, role: 'admin' },
    { username: 'teacher', password, invitationCode, accountId: randomToken() },
  ])
    assert.equal(parseRegistration(body), null);
  assert.equal(parseLogin({ username: 'Teacher_A', password: 'wrong' })?.username, 'teacher_a');
  assert.equal(parseLogin({ username: 'teacher', password, role: 'admin' }), null);
  assert.equal(exactObject({}, ['username']), false);
});
test('new passwords require twelve Unicode characters and all four categories without restricting the character set', () => {
  assert.equal(validPassword('Abcdefgh_123'), true);
  assert.equal(validPassword(' 一句中文密码 Aa1_ '), true);
  assert.equal(validPassword('Ab1' + '😀'.repeat(9)), true);
  assert.equal(validPassword('Ab1_' + 'x'.repeat(124)), true);
  for (const invalid of [
    'Abcdefg_123',
    'abcdefgh_123',
    'ABCDEFGH_123',
    'Abcdefgh____',
    'Abcdefgh1234',
    'Abcdefgh 123',
    'x'.repeat(128),
    '😀'.repeat(15),
    'Ab1_' + 'x'.repeat(125),
    'Abcdefgh_123' + '\uD800',
  ])
    assert.equal(validPassword(invalid), false);
  assert.ok(
    parseLogin({ username: 'teacher', password: 'old-short' }),
    'Existing login passwords are not revalidated as new passwords',
  );
});
test('only explicit dedicated database roles/names and HTTPS session configuration are accepted', () => {
  assert.throws(() =>
    dedicatedDatabaseUrl('postgresql://postgres:fake@localhost/postgres', 'owner'),
  );
  assert.throws(() =>
    dedicatedDatabaseUrl('postgresql://supabase_admin:fake@localhost/postgres', 'app'),
  );
  assert.throws(() =>
    dedicatedDatabaseUrl('postgresql://wanwu_owner:fake@localhost/wanwu_sound', 'app'),
  );
  assert.ok(dedicatedDatabaseUrl('postgresql://wanwu_app:fake@localhost/wanwu_sound', 'app'));
  assert.throws(() =>
    readConfig({ WANWU_SESSION_SECRET: randomToken(), WANWU_APP_ORIGIN: 'http://localhost' }),
  );
  assert.throws(() =>
    readConfig({ WANWU_SESSION_SECRET: randomToken(), WANWU_CLOUD_AUTH_MODE: 'client-headers' }),
  );
  assert.throws(() => readConfig({ WANWU_SESSION_SECRET: 'short' }));
  assert.throws(() =>
    readConfig({
      WANWU_SESSION_SECRET: randomToken(),
      WANWU_MIGRATION_DATABASE_URL: 'a disposable management placeholder',
    }),
  );
  assert.throws(() =>
    readConfig({
      WANWU_SESSION_SECRET: randomToken(),
      WANWU_APP_DB_PASSWORD: 'a disposable management placeholder',
    }),
  );
  for (const address of ['true', '1', '0.0.0.0/0', '172.16.0.0/12', 'proxy.example.com'])
    assert.throws(() =>
      readConfig({ WANWU_SESSION_SECRET: randomToken(), WANWU_TRUSTED_PROXY_ADDRESSES: address }),
    );
  assert.deepEqual(
    readConfig({
      WANWU_SESSION_SECRET: randomToken(),
      WANWU_TRUSTED_PROXY_ADDRESSES: '127.0.0.1,172.30.19.1',
    }).trustedProxyAddresses,
    ['127.0.0.1', '172.30.19.1'],
  );
  assert.equal(readConfig({ WANWU_SESSION_SECRET: randomToken() }).cloudAuthMode, 'disabled');
});
test('opaque credentials are random, stored as digests and compared without coercing headers', () => {
  const first = randomToken(),
    second = randomToken();
  assert.equal(first.length, 43);
  assert.ok(first !== second);
  assert.ok(/^[a-f0-9]{64}$/.test(tokenDigest(first)));
  assert.ok(tokenDigest(first) !== first);
  assert.equal(sameToken(first, first), true);
  assert.equal(sameToken(first, second), false);
  assert.equal(sameToken([first], first), false);
  assert.equal(sameToken(undefined, undefined), false);
});
test('error envelopes keep the v0.6 string status and refuse accidental private fields', () => {
  assert.ok(
    parseApiFailure({ status: 'error', reason: 'needs-account', requestId: 'test-request' }),
  );
  assert.equal(
    parseApiFailure({ status: 401, reason: 'needs-account', requestId: 'test-request' }),
    null,
  );
  assert.equal(
    parseApiFailure({ status: 'error', reason: 'unknown', requestId: 'test-request' }),
    null,
  );
  assert.equal(
    parseApiFailure({
      status: 'error',
      reason: 'needs-account',
      requestId: 'test-request',
      password: 'not-a-real-password',
    }),
    null,
  );
});
test('native Argon2id uses the planned cost, independent salts, and a bounded verifier queue', async () => {
  const passwords = new Passwords();
  await passwords.ready();
  const first = await passwords.hash(password),
    second = await passwords.hash(password);
  const fields = first.split('$');
  assert.equal(fields[1], 'argon2id');
  assert.equal(fields[2], 'v=19');
  const costs = Object.fromEntries(
    fields[3]!.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key, Number(value)];
    }),
  );
  assert.deepEqual(costs, { m: 19456, t: 2, p: 1 });
  assert.ok(first !== second);
  assert.equal(await passwords.verify(first, password), true);
  assert.equal(await passwords.verify(first, 'a wrong disposable passphrase'), false);
  assert.equal(await passwords.verify(null, password), false);
  const results = await Promise.allSettled(
    Array.from({ length: 12 }, () => passwords.hash(password)),
  );
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 6);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 6);
  assert.equal(
    await passwords.verify(await passwords.hash(password), password),
    true,
    'Queue reservations must be released',
  );
});
