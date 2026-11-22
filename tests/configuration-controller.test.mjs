import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { signed, verified } from '../apps/api/src/settings/signature.ts';

test('host/controller messages interoperate, reject tampering and reject expired or arbitrary operations', () => {
  const key = randomBytes(32);
  const payload = {
    format: 1,
    id: randomUUID(),
    revision: 3,
    actor: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const module = fileURLToPath(new URL('../deploy/runtime/controller_codec.py', import.meta.url));
  const program = `import runpy,json,sys,time
m=runpy.run_path(sys.argv[1],run_name='isolated_test');data=json.load(sys.stdin);key=bytes.fromhex(data['key'])
v=m['verify'](data['envelope'],key);assert m['valid_request'](v,time.time())
bad=dict(v);bad['command']='restart-other-project';assert not m['valid_request'](bad,time.time())
assert not m['valid_request'](v,time.time()+301)
bad=dict(v);bad['actor']='root';assert not m['valid_request'](bad,time.time())
bad=dict(v);bad['revision']=float('nan');assert not m['valid_request'](bad,time.time())
data['envelope']['payload']['revision']=99;assert m['verify'](data['envelope'],key) is None
print(json.dumps(m['sign']({'format':1,'message':'已应用','effective':{'cpu':0.25,'memory':512}},key),ensure_ascii=False))`;
  const response = JSON.parse(
    execFileSync('python3', ['-c', program, module], {
      input: JSON.stringify({ key: key.toString('hex'), envelope: signed(payload, key) }),
      encoding: 'utf8',
      timeout: 10000,
    }),
  );
  assert.deepEqual(verified(response, key), {
    format: 1,
    message: '已应用',
    effective: { cpu: 0.25, memory: 512 },
  });
  response.payload.effective.memory = 1024;
  assert.equal(verified(response, key), null);
});
