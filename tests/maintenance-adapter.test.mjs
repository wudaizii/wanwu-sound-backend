import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = new URL('../deploy/runtime/', import.meta.url);
test('maintenance units use only the protected fixed-action adapter, not host Node or developer privileges', async () => {
  for (const [name, action] of [
    ['backup', 'backup'],
    ['cleanup', 'cleanup'],
    ['health', 'status'],
    ['storage', 'storage'],
  ]) {
    const unit = await readFile(new URL(`wanwu-${name}.service.example`, directory), 'utf8');
    assert.match(unit, /^User=root$/m);
    assert.match(unit, new RegExp(`^ExecStart=/usr/local/sbin/wanwu-maintenance ${action}$`, 'm'));
    assert.match(unit, /^WorkingDirectory=\/etc\/wanwu-sound\/maintenance$/m);
    assert.doesNotMatch(unit, /sudo|\/usr\/bin\/node|User=wudaizii/);
  }
});
test('maintenance adapter syntax and invalid action fail before touching Docker or cloud resources', async () => {
  const file = fileURLToPath(new URL('wanwu-maintenance.sh', directory));
  assert.equal(spawnSync('bash', ['-n', file]).status, 0);
  for (const args of [[], ['start'], ['backup', '--arbitrary-argument']]) {
    const result = spawnSync('bash', [file, ...args], { encoding: 'utf8', timeout: 2000 });
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout, /password|AccessKey|Cookie/);
  }
  const script = await readFile(file, 'utf8');
  assert.match(script, /--project-name wanwu-sound/);
  assert.match(script, /env -i/);
  assert.match(script, /--host unix:\/\/\/var\/run\/docker.sock/);
  assert.match(script, /Maintenance image\/source mismatch/);
  const commands = script
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
  assert.doesNotMatch(commands, /(?:^|\n)\s*(?:eval|source|sudo)\s/m);
});

test('public backup key may be non-root readable while secrets remain owner-only', async () => {
  const script = await readFile(new URL('wanwu-maintenance.sh', directory), 'utf8');
  const functions = script.slice(script.indexOf('private_root_file() {'), script.indexOf('for folder in '));
  const folder = await mkdtemp(join(tmpdir(), 'wanwu-key-permissions-'));
  const publicFile = join(folder, 'public.pem');
  const privateFile = join(folder, 'not-a-public-key.pem');
  const linkedFile = join(folder, 'linked.pem');
  try {
    await writeFile(publicFile, '-----BEGIN PUBLIC KEY-----\nZml4dHVyZQ==\n-----END PUBLIC KEY-----\n');
    await writeFile(privateFile, '-----BEGIN PRIVATE KEY-----\nfixture-only\n-----END PRIVATE KEY-----\n');
    await symlink(publicFile, linkedFile);
    const check = (fn, file, mode, uid = '0') => spawnSync('bash', ['--noprofile', '--norc', '-c', `
      ${functions}
      # Owner/mode metadata is stubbed so this unit test also runs unprivileged on macOS.
      stat() { case "$2" in %u) printf '%s' "$WANWU_FIXTURE_UID";; %a) printf '%s' "$WANWU_FIXTURE_MODE";; *) return 1;; esac; }
      ${fn} "$1"
    `, 'fixture', file], {
      encoding: 'utf8', timeout: 2000,
      env: { PATH: process.env.PATH, WANWU_FIXTURE_UID: uid, WANWU_FIXTURE_MODE: mode },
    }).status;
    assert.equal(check('public_root_key', publicFile, '644'), 0);
    assert.equal(check('public_root_key', publicFile, '444'), 0);
    for (const mode of ['600', '640', '666', '664', '777'])
      assert.notEqual(check('public_root_key', publicFile, mode), 0);
    assert.notEqual(check('public_root_key', publicFile, '644', '1000'), 0);
    assert.notEqual(check('public_root_key', linkedFile, '644'), 0);
    assert.notEqual(check('public_root_key', privateFile, '644'), 0);
    assert.equal(check('private_root_file', privateFile, '600'), 0);
    assert.notEqual(check('private_root_file', privateFile, '644'), 0);
    assert.match(script, /public_root_key "\$directory\/backup-public\.pem"/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
