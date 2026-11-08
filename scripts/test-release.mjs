import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, randomUUID, generateKeyPairSync } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile, rm, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { releaseManifest, environmentPins } from '../deploy/runtime/image-pins.ts';

// Only disposable local Compose resources. Never reads production secret files or calls ECS.
const root = fileURLToPath(new URL('../', import.meta.url)),
  execute = promisify(execFile);
const release = await realpath(path.resolve(root, process.argv[2] ?? ''));
if (!release.startsWith(path.join(root, 'artifacts', 'releases') + path.sep))
  throw new Error('Specify a locally built artifacts/releases/<id>/deployment directory');
const manifest = releaseManifest(
  JSON.parse(await readFile(path.join(release, 'release-manifest.json'), 'utf8')),
);
assert.equal(manifest.project, 'wanwu-sound');
let docker = 'docker';
if (spawnSync(docker, ['--version']).error?.code === 'ENOENT')
  docker = '/Applications/Docker.app/Contents/Resources/bin/docker';
const env = { ...process.env, PATH: `${path.dirname(docker)}:${process.env.PATH ?? ''}` };
const raw = async (args, timeout = 120_000) =>
  (
    await execute(docker, args, { cwd: root, env, timeout, maxBuffer: 2 * 1024 * 1024 })
  ).stdout.trim();
const context = await raw(['context', 'show']);
if (
  (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://')) ||
  !(
    await raw(['context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}'])
  ).startsWith('unix://')
)
  throw new Error('Only a local Unix Docker context is allowed');
const call = (args, timeout) => raw(['--context', context, ...args], timeout);
for (const image of Object.values(manifest.images)) {
  assert.match(image.id, /^sha256:[a-f0-9]{64}$/);
  assert.equal(await call(['image', 'inspect', image.id, '--format', '{{.Id}}']), image.id);
}
const id = randomUUID(),
  project = `wanwu-release-test-${id}`,
  sentinel = `${project}-old-site`;
const folder = path.join(root, 'artifacts', project),
  reportFile = folder + '.json';
await mkdir(folder, { mode: 0o700 });
const composeFile = path.join(folder, 'compose.yml'),
  releaseFile = path.join(folder, '.env.release');
const compose = (args) =>
  call([
    'compose',
    '--project-name',
    project,
    '--env-file',
    releaseFile,
    '--file',
    composeFile,
    ...args,
  ]);
const write = (name, content) =>
  writeFile(path.join(folder, name), content, { flag: 'wx', mode: 0o600 });
const password = () => randomBytes(32).toString('base64url'),
  owner = password(),
  app = password();
const dbUrl = (role, pw) => `postgresql://wanwu_${role}:${pw}@database:5432/wanwu_sound`;
const appDb = `WANWU_DATABASE_URL=${dbUrl('app', app)}\n`,
  origin = 'WANWU_APP_ORIGIN=https://voiceatalass.netlify.app\n';
const oss =
  'WANWU_OSS_BUCKET=wanwu-release-test-fixture\nWANWU_OSS_REGION=oss-cn-shanghai\nWANWU_OSS_PREFIX=wanwu/dev\nWANWU_OSS_ACCESS_KEY_ID=local-fixture-only\nWANWU_OSS_ACCESS_KEY_SECRET=local-fixture-only-not-a-real-key\n';
let candidateTag,
  baseTag,
  stage = 'configuration',
  proof = { status: 'fail' };
try {
  const template = await readFile(path.join(release, 'compose.yml'), 'utf8');
  assert.ok(template.includes('127.0.0.1:3100:3100'));
  // Host port is ephemeral only in this disposable copy. The shipped production port remains 3100.
  await write('compose.yml', template.replace('127.0.0.1:3100:3100', '127.0.0.1::3100'));
  await copyFile(
    path.join(release, 'seccomp-profile.json'),
    path.join(folder, 'seccomp-profile.json'),
  );
  await write(
    '.env.database',
    `POSTGRES_USER=wanwu_owner\nPOSTGRES_DB=wanwu_sound\nPOSTGRES_PASSWORD=${owner}\n`,
  );
  await write(
    '.env.api',
    appDb + origin + oss + `WANWU_SESSION_SECRET=${password()}\nWANWU_CLOUD_AUTH_MODE=disabled\n`,
  );
  await write('.env.worker', appDb + origin + oss);
  await write('.env.models', '# No paid models in a release test.\n');
  await write(
    '.env.ops',
    appDb +
      origin +
      oss +
      `WANWU_MIGRATION_DATABASE_URL=${dbUrl('owner', owner)}\nWANWU_APP_DB_PASSWORD=${app}\n`,
  );
  const key = generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  await write('backup-public.pem', key.publicKey); // Ephemeral private key is not persisted.
  const releaseText = (api) =>
    Object.entries({
      API: api,
      WORKER: manifest.images.worker.id,
      OPS: manifest.images.ops.id,
      CATALOGUE: manifest.images.catalogue.id,
      SOURCE_DIGEST: manifest.sourceDigest,
    })
      .map(([k, v]) => `WANWU_${k === 'SOURCE_DIGEST' ? k : k + '_IMAGE'}=${v}`)
      .join('\n') + '\n';
  await write('.env.release', releaseText(manifest.images.api.id));
  environmentPins(await readFile(releaseFile, 'utf8'), manifest);
  stage = 'compose-validation';
  await compose(['config', '--quiet']);
  stage = 'compose-isolation';
  const config = JSON.parse(await compose(['config', '--format', 'json'])); // Kept in memory; never logged.
  assert.equal(config.services.database.ports, undefined);
  assert.equal(config.services.media.ports, undefined);
  assert.equal(config.services.api.ports[0].host_ip, '127.0.0.1');
  stage = 'old-site-sentinel';
  await call([
    'run',
    '--detach',
    '--name',
    sentinel,
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '--cpus',
    '0.05',
    '--memory',
    '64m',
    '--memory-swap',
    '64m',
    '--pids-limit',
    '32',
    '--publish',
    '127.0.0.1::7777',
    manifest.images.api.id,
    'node',
    '-e',
    "require('node:http').createServer((_,r)=>r.end('old-site-sentinel-unchanged')).listen(7777,'0.0.0.0')",
  ]);
  const published = async (name, port) =>
    JSON.parse(await call(['inspect', name, '--format', '{{json .NetworkSettings.Ports}}']))[
      `${port}/tcp`
    ][0].HostPort;
  const oldOrigin = `http://127.0.0.1:${await published(sentinel, 7777)}`;
  const oldHealth = async () => {
    const r = await fetch(oldOrigin, { signal: AbortSignal.timeout(5000) });
    assert.equal(r.status, 200);
    assert.equal(await r.text(), 'old-site-sentinel-unchanged');
  };
  for (let attempt = 0; ; attempt++) {
    try {
      await oldHealth();
      break;
    } catch {
      if (attempt === 20) throw new Error('Local old-site sentinel did not become ready');
      await delay(250);
    }
  }
  const sentinelId = await call(['inspect', sentinel, '--format', '{{.Id}}']);
  stage = 'database-bootstrap';
  stage = 'catalogue-originals';
  const verified = await compose([
    'run',
    '--rm',
    '--no-deps',
    '--pull',
    'never',
    'catalogue',
    '--input-type=module',
    '-e',
    "import {trustedCatalogue} from './apps/api/src/catalogue.ts';console.log((await trustedCatalogue(true)).size)",
  ]);
  assert.ok(Number(verified) > 0);
  stage = 'database-bootstrap';
  await compose([
    'up',
    '--detach',
    '--wait',
    '--wait-timeout',
    '60',
    '--pull',
    'never',
    'database',
  ]);
  await compose([
    'run',
    '--rm',
    '--no-deps',
    '--pull',
    'never',
    'ops',
    'apps/api/src/db/bootstrap-cli.ts',
  ]);
  const query = (code) =>
    compose([
      'run',
      '--rm',
      '--no-deps',
      '--pull',
      'never',
      'ops',
      '--input-type=module',
      '-e',
      `import pg from 'pg';const p=new pg.Pool({connectionString:process.env.WANWU_DATABASE_URL});try{${code}}finally{await p.end();}`,
    ]);
  await query(
    `await p.query("INSERT INTO maintenance_runs(id,kind,status,finished_at) VALUES('${id}','restore-drill','pass',now())")`,
  );
  const up = async () => {
    await compose([
      'up',
      '--detach',
      '--wait',
      '--wait-timeout',
      '60',
      '--no-deps',
      '--pull',
      'never',
      'api',
      'media',
    ]);
    await oldHealth();
  };
  stage = 'runtime-start';
  await up();
  const apiId = async () => compose(['ps', '--quiet', 'api']);
  const health = async () => {
    const url = `http://127.0.0.1:${await published(await apiId(), 3100)}`;
    assert.equal((await fetch(url + '/api/v1/health')).status, 200);
    const version = await (await fetch(url + '/api/v1/version')).json();
    assert.equal(version.sourceDigest, manifest.sourceDigest);
    assert.equal(version.commit, manifest.commit);
    assert.equal(version.dirty, manifest.dirty);
    const r = await fetch(url + '/api/v1/auth/me');
    assert.equal(r.status, 503);
    assert.equal((await r.json()).reason, 'not-open');
  };
  await health();
  stage = 'real-session-ai-runtime';
  const apiEnvFile = path.join(folder, '.env.api'),
    disabledEnv = await readFile(apiEnvFile, 'utf8');
  await writeFile(
    apiEnvFile,
    disabledEnv.replace('WANWU_CLOUD_AUTH_MODE=disabled', 'WANWU_CLOUD_AUTH_MODE=session') +
      'WANWU_TRUSTED_PROXY_ADDRESSES=127.0.0.1\n',
    { mode: 0o600 },
  );
  await up();
  // Real main.ts + HTTP Cookie/CSRF + pg-boss adapter, closed providers (no OSS/model/network call).
  const runtimeProbe = `
    import assert from 'node:assert/strict';
    import {calmLullaby} from './packages/prompts/tests/fixtures/briefs.ts';
    import pg from 'pg';
    const p=new pg.Pool({connectionString:process.env.WANWU_DATABASE_URL});
    const base='http://127.0.0.1:3100',headers={'x-forwarded-proto':'https'};
    const csrf=await fetch(base+'/api/v1/auth/csrf',{headers});assert.equal(csrf.status,200);
    const token=(await csrf.json()).csrfToken,cookie=csrf.headers.get('set-cookie').split(';')[0];
    const response=await fetch(base+'/api/v1/backgrounds',{method:'POST',headers:{...headers,cookie,
      origin:'https://voiceatalass.netlify.app','content-type':'application/json','x-csrf-token':token},
      body:JSON.stringify({step:'notes-ai',brief:calmLullaby})});assert.equal(response.status,202);
    const {jobId}=await response.json();
    let state;
    for(let i=0;i<100;i++){const r=await fetch(base+'/api/v1/backgrounds/'+jobId,{headers:{...headers,cookie}});
      assert.equal(r.status,200);state=await r.json();if(state.status!=='pending')break;await new Promise(r=>setTimeout(r,100));}
    assert.equal(state.status,'unavailable');assert.equal(state.reason,'not-open');
    assert.equal((await fetch(base+'/api/v1/backgrounds/'+jobId,{headers})).status,404);
    assert.equal((await p.query("SELECT count(*)::int AS n FROM runtime_status WHERE component='ai-worker' AND seen_at>now()-interval '90 seconds'")).rows[0].n,1);
    assert.equal((await p.query("SELECT count(*)::int AS n FROM ai_background_jobs WHERE status='done' AND result->>'reason'='not-open'")).rows[0].n,1);
    await p.end();console.log('session-ai-wiring-pass');`;
  assert.equal(
    await call(['exec', await apiId(), 'node', '--input-type=module', '-e', runtimeProbe]),
    'session-ai-wiring-pass',
  );
  await compose(['restart', '--no-deps', 'api']);
  await up();
  assert.equal(
    await query(
      `console.log((await p.query("SELECT count(*)::int AS n FROM ai_background_jobs WHERE status='done' AND result->>'reason'='not-open'")).rows[0].n)`,
    ),
    '1',
  );
  await writeFile(apiEnvFile, disabledEnv, { mode: 0o600 });
  await up();
  await health();
  for (let attempt = 0; ; attempt++) {
    try {
      await compose([
        'run',
        '--rm',
        '--no-deps',
        '--pull',
        'never',
        'ops',
        'apps/api/src/maintenance/health-cli.ts',
        '--worker-only',
      ]);
      break;
    } catch {
      if (attempt === 20) throw new Error('Production worker heartbeat not observed');
      await delay(500);
    }
  }
  stage = 'runtime-hardening';
  const inspected = JSON.parse(
    await call([
      'inspect',
      await apiId(),
      await compose(['ps', '--quiet', 'media']),
      await compose(['ps', '--quiet', 'database']),
    ]),
  );
  for (const [i, c] of inspected.entries()) {
    assert.equal(c.HostConfig.Privileged, false);
    assert.equal(c.HostConfig.ReadonlyRootfs, true);
    assert.deepEqual(c.HostConfig.CapDrop, ['ALL']);
    assert.equal(c.HostConfig.Memory, [256, 1024, 512][i] * 1024 ** 2);
    assert.equal(c.HostConfig.MemorySwap, c.HostConfig.Memory);
    assert.equal(c.HostConfig.NanoCpus, [0.25, 0.5, 0.25][i] * 1e9);
    assert.equal(c.HostConfig.PidsLimit, [128, 256, 128][i]);
    assert.equal(c.HostConfig.LogConfig.Config['max-size'], '10m');
    assert.equal(c.HostConfig.LogConfig.Config['max-file'], '3');
    assert.ok(
      Object.keys(c.NetworkSettings.Networks).every((name) => name.startsWith(project + '_')),
    );
  }
  assert.ok(inspected[1].HostConfig.SecurityOpt.some((v) => v.startsWith('seccomp=')));
  // A label-only successor proves an actual image switch and rollback without fabricating old application migrations.
  stage = 'image-rollout-and-rollback';
  baseTag = `${project}-base:local`;
  candidateTag = `${project}-candidate:local`;
  await call(['image', 'tag', manifest.images.api.id, baseTag]);
  await write('Dockerfile', `FROM ${baseTag}\nLABEL wanwu.disposable-rollout="${id}"\n`);
  await call(['build', '--file', path.join(folder, 'Dockerfile'), '--tag', candidateTag, folder]);
  const candidate = await call(['image', 'inspect', candidateTag, '--format', '{{.Id}}']);
  assert.notEqual(candidate, manifest.images.api.id);
  const first = await apiId();
  await writeFile(releaseFile, releaseText(candidate), { mode: 0o600 });
  await up();
  await health();
  assert.notEqual(await apiId(), first);
  assert.equal(await call(['inspect', await apiId(), '--format', '{{.Image}}']), candidate);
  await writeFile(releaseFile, releaseText(manifest.images.api.id), { mode: 0o600 });
  await up();
  await health();
  assert.equal(
    await call(['inspect', await apiId(), '--format', '{{.Image}}']),
    manifest.images.api.id,
  );
  assert.equal(
    await query(
      `console.log((await p.query("SELECT count(*)::int AS n FROM maintenance_runs WHERE id='${id}'")).rows[0].n)`,
    ),
    '1',
  );
  stage = 'database-container-replacement';
  const databaseBefore = await compose(['ps', '--quiet', 'database']);
  await compose(['stop', 'api', 'media', 'database']);
  await compose(['rm', '--force', 'database']); // Retain this UUID-scoped named volume.
  await compose([
    'up',
    '--detach',
    '--wait',
    '--wait-timeout',
    '60',
    '--pull',
    'never',
    'database',
  ]);
  assert.notEqual(await compose(['ps', '--quiet', 'database']), databaseBefore);
  assert.equal(
    await query(
      `console.log((await p.query("SELECT count(*)::int AS n FROM maintenance_runs WHERE id='${id}'")).rows[0].n)`,
    ),
    '1',
  );
  await up();
  await health();
  await compose(['stop', 'api', 'media']);
  await oldHealth();
  assert.equal(await call(['inspect', sentinel, '--format', '{{.Id}}']), sentinelId);
  proof = {
    status: 'pass',
    project,
    localOnly: true,
    productionImages: manifest.images,
    authMode: 'disabled',
    databasePublished: false,
    resourceHardeningVerified: true,
    catalogueOriginalsVerified: true,
    workerHeartbeat: true,
    rolloutAndImageRollback: true,
    rollbackScope: 'label-only successor; not historical application/schema compatibility',
    oldSiteSentinelUnchanged: true,
    databaseMarkerSurvived: true,
    databaseContainerReplacementVerified: true,
    imageSourceIdentityVerified: true,
    realSessionAiQueueWired: true,
    aiResultSurvivedApiRestart: true,
    realCloudAcceptance: false,
  };
  console.log('Local release, isolation and rollback smoke checks passed.');
} catch (error) {
  proof = {
    status: 'fail',
    stage,
    reason: error instanceof assert.AssertionError ? error.message : (error.code ?? error.name),
  };
  console.error(
    `Local release smoke failed at ${stage}: ${proof.reason}; secret-bearing subprocess output suppressed.`,
  );
  process.exitCode = 1;
} finally {
  await writeFile(
    reportFile,
    JSON.stringify({ ...proof, createdAt: new Date().toISOString() }, null, 2) + '\n',
    { mode: 0o600 },
  );
  // Exact UUID-scoped disposable resources only. No global prune and no production project access.
  await compose(['down', '--volumes', '--timeout', '15']).catch(() => {});
  await call(['rm', '--force', sentinel]).catch(() => {});
  for (const tag of [candidateTag, baseTag].filter(Boolean))
    await call(['image', 'rm', tag]).catch(() => {});
  await rm(folder, { recursive: true, force: true });
  console.log(`Release smoke evidence: ${reportFile}`);
}
