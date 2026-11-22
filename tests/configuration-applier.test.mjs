import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defaults } from '../apps/api/src/settings/schema.ts';

test('the host configuration adapter rejects shell/newline and resource attacks without operating Docker or systemd', () => {
  const adapter = fileURLToPath(
    new URL('../deploy/runtime/apply-configuration.py', import.meta.url),
  );
  const program = `import runpy,json,sys,pathlib
sys.path.insert(0,str(pathlib.Path(sys.argv[1]).parent))
m=runpy.run_path(sys.argv[1],run_name='isolated_validation')
v=json.load(sys.stdin)
for field,bad in [('deploy.api.cpu',0),('deploy.media.memoryMiB',999999),('deploy.database.pids',1),('deploy.api.cpu',float('nan')),('deploy.api.cpu','1; reboot')]:
 trial=dict(v);trial[field]=bad
 try:m['make_override'](trial);raise AssertionError('invalid allocation accepted')
 except RuntimeError:pass
for key,value in [('WANWU_BAD','line1\\nline2'),('WANWU_BAD\\nOTHER','x'),('WANWU_BAD','nul\\x00')]:
 try:m['env_text']({key:value});raise AssertionError('unsafe environment accepted')
 except RuntimeError:pass
literal='$HOME; $(touch never)'
assert m['env_text']({'WANWU_TEST':literal})=='WANWU_TEST='+literal+'\\n'
o=m['make_override'](v,pathlib.Path('/isolated-fixture'))
assert set(o['services'])=={'api','media','database','ops'}
assert all('privileged' not in s and 'volumes' not in s and 'ports' not in s for s in o['services'].values())
assert o['services']['api']['env_file'][0]['format']=='raw'
print(json.dumps({'status':'pass','hostActions':0,'cases':10}))`;
  const result = JSON.parse(
    execFileSync('python3', ['-c', program, adapter], {
      input: JSON.stringify(defaults({})),
      encoding: 'utf8',
      timeout: 10000,
    }),
  );
  assert.equal(result.status, 'pass');
  assert.equal(result.hostActions, 0);
});
