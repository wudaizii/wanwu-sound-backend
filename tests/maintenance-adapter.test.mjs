import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
