import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, openSync, writeSync, closeSync } from 'node:fs';
import { mkdir, writeFile, mkdtemp, rm, chmod, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { rendererSeccompProfile } from '../deploy/media-prototype/seccomp-policy.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const operations = process.argv[2] === 'operations';
const runtime = process.argv[2] === 'media-runtime';
const p1 = process.argv[2] === 'p1';
if (process.argv[2] && !operations && !runtime && !p1) throw new Error('Unknown local test target');
const id = randomUUID(),
  name = `wanwu-${operations ? 'operations' : runtime ? 'runtime' : p1 ? 'p1' : 'auth'}-test-${id}`,
  api = `${name}-api`,
  databaseName = `wanwu_sound_test_${id.replaceAll('-', '').slice(0, 8)}`;
const reportFile = path.join(root, 'artifacts', `${name}.json`);
await mkdir(path.dirname(reportFile), { recursive: true });
const logFile = path.join(root, 'artifacts', `${name}.log`),
  log = openSync(logFile, 'wx', 0o600);
let docker = 'docker';
if (
  spawnSync(docker, ['--version']).error?.code === 'ENOENT' &&
  existsSync('/Applications/Docker.app/Contents/Resources/bin/docker')
)
  docker = '/Applications/Docker.app/Contents/Resources/bin/docker';
const environment = {
  ...process.env,
  PATH: `${path.dirname(docker)}:${process.env.PATH ?? ''}`,
  POSTGRES_PASSWORD: randomBytes(32).toString('base64url'),
};
const raw = (args) =>
  spawnSync(docker, args, {
    encoding: 'utf8',
    env: environment,
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
  });
if (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://'))
  throw new Error('Remote Docker is not allowed');
const context = raw(['context', 'show']).stdout?.trim();
if (
  !context ||
  !raw(['context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}'])
    .stdout.trim()
    .startsWith('unix://')
)
  throw new Error('A local Unix-socket Docker context is required');
const prefix = ['--context', context];
const call = (args) => {
  const result = raw([...prefix, ...args]);
  if (result.status !== 0)
    throw new Error(`Local Docker ${args[0]} failed; no environment or credentials are logged`);
  return result.stdout.trim();
};
function run(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(docker, [...prefix, ...args], {
      cwd: root,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '',
      expired = false;
    child.stdout.on('data', (chunk) => {
      writeSync(log, chunk);
      output += chunk.toString();
      if (output.length > 1024 * 1024) output = output.slice(-1024 * 1024);
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      writeSync(log, chunk);
      process.stderr.write(chunk);
    });
    const timer = setTimeout(() => {
      expired = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      code === 0 && !expired
        ? resolve(output)
        : reject(new Error(expired ? 'Local test timeout' : 'Local test operation failed'));
    });
  });
}
const image = 'postgres@sha256:858bb5e98eed02eb8cafbcdc007f9a65d1b613972028944a8ec2133ccaf80d27';
const appPassword = randomBytes(32).toString('base64url');
const status = 'blocked';
let fixtures, profile;
environment.WANWU_TEST_OWNER_DATABASE_URL = `postgresql://wanwu_owner:${environment.POSTGRES_PASSWORD}@${name}:5432/${databaseName}`;
environment.WANWU_TEST_DATABASE_URL = `postgresql://wanwu_app:${appPassword}@${name}:5432/${databaseName}`;
environment.WANWU_TEST_APP_DB_PASSWORD = appPassword;
environment.WANWU_TEST_PG_HOST = name;
await mkdir(path.dirname(reportFile), { recursive: true });
try {
  call(['image', 'inspect', image]);
  await run(
    [
      'build',
      '--platform',
      'linux/amd64',
      '--file',
      operations || runtime ? 'deploy/runtime/Dockerfile' : 'deploy/api-test/Dockerfile',
      ...(operations || runtime ? ['--target', operations ? 'ops-test' : 'worker-test'] : []),
      '--tag',
      api,
      '.',
    ],
    20 * 60_000,
  );
  call(['network', 'create', '--internal', name]);
  call([
    'run',
    '--detach',
    '--name',
    name,
    '--platform',
    'linux/amd64',
    '--network',
    name,
    '--user',
    '999:999',
    '--cpus',
    '0.25',
    '--memory',
    '512m',
    '--memory-swap',
    '512m',
    '--pids-limit',
    '128',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '--read-only',
    '--log-opt',
    'max-size=10m',
    '--log-opt',
    'max-file=3',
    '--tmpfs',
    '/tmp:rw,nosuid,noexec,size=16m,mode=1777',
    '--tmpfs',
    '/var/run/postgresql:rw,nosuid,noexec,size=1m,uid=999,gid=999',
    '--tmpfs',
    '/var/lib/postgresql/data:rw,nosuid,noexec,size=128m,uid=999,gid=999',
    '--env',
    'POSTGRES_PASSWORD',
    '--env',
    'POSTGRES_USER=wanwu_owner',
    '--env',
    `POSTGRES_DB=${databaseName}`,
    image,
    'postgres',
    '-c',
    'shared_buffers=32MB',
    '-c',
    'max_connections=20',
  ]);
  if (runtime) {
    fixtures = await mkdtemp(path.join(root, 'artifacts', 'wanwu-runtime-fixtures-'));
    await chmod(fixtures, 0o777);
    profile = path.join(root, 'artifacts', `${name}.seccomp.json`);
    await writeFile(
      profile,
      rendererSeccompProfile(
        await readFile(path.join(root, 'deploy/media-prototype/seccomp-profile.json')),
      ),
      { flag: 'wx', mode: 0o600 },
    );
  }
  const output = await run(
    [
      'run',
      '--init',
      '--name',
      api,
      '--platform',
      'linux/amd64',
      '--network',
      name,
      '--user',
      '1000:1000',
      '--cpus',
      runtime ? '0.5' : '0.25',
      '--memory',
      runtime ? '1g' : '256m',
      '--memory-swap',
      runtime ? '1g' : '256m',
      '--pids-limit',
      runtime ? '256' : '128',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges:true',
      '--read-only',
      '--log-opt',
      'max-size=10m',
      '--log-opt',
      'max-file=3',
      '--tmpfs',
      `/tmp:rw,nosuid,noexec,size=${runtime ? '256' : '16'}m,mode=1777`,
      ...(runtime
        ? [
            '--security-opt',
            `seccomp=${profile}`,
            '--shm-size',
            '128m',
            '--tmpfs',
            '/home/node:rw,nosuid,noexec,size=32m,uid=1000,gid=1000',
            '--mount',
            `type=bind,source=${fixtures},target=/fixtures`,
          ]
        : []),
      '--env',
      'WANWU_TEST_DATABASE_URL',
      '--env',
      'WANWU_TEST_OWNER_DATABASE_URL',
      '--env',
      'WANWU_TEST_APP_DB_PASSWORD',
      '--env',
      'WANWU_TEST_PG_HOST',
      api,
      ...(p1
        ? ['node', '--test', '--test-reporter=tap', 'apps/api/tests/integration/p1.test.ts']
        : []),
    ],
    runtime ? 660_000 : 180_000,
  );
  const match = output.match(
    operations
      ? /^(?:#\s*)?WANWU_OPERATIONS_PROOF (.+)$/m
      : runtime
        ? /^(?:#\s*)?WANWU_RUNTIME_PROOF (.+)$/m
        : p1
          ? /^(?:#\s*)?WANWU_P1_PROOF (.+)$/m
          : /^(?:#\s*)?WANWU_AUTH_TEST_PROOF (.+)$/m,
  );
  if (!match) throw new Error('Kernel-backed API test evidence is missing');
  const proof = JSON.parse(match[1]);
  if (proof.status !== 'pass') throw new Error('The API test gate did not pass');
  const apiImage = call(['inspect', api, '--format', '{{.Image}}']);
  await writeFile(
    reportFile,
    JSON.stringify(
      {
        ...proof,
        createdAt: new Date().toISOString(),
        context,
        postgresImage: image,
        apiImage,
        logFile,
        scope: 'local Linux and disposable PostgreSQL; not real H5/Netlify/deployment acceptance',
        databasePublishedTo: null,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    `${operations ? 'Operations' : runtime ? 'Media runtime' : p1 ? 'P1' : 'Authentication'} evidence: ${reportFile}`,
  );
} catch (error) {
  const inspected = raw([...prefix, 'inspect', api, '--format', '{{json .State}}']);
  let state = null;
  try {
    state = JSON.parse(inspected.stdout);
  } catch {}
  const logs = raw([...prefix, 'logs', name]);
  const startup = (logs.stdout + '\n' + logs.stderr)
    .split('\n')
    .filter((line) => /FATAL|ERROR|initdb:|Permission denied|Operation not permitted/.test(line))
    .map((line) =>
      line
        .replaceAll(environment.POSTGRES_PASSWORD, '[redacted]')
        .replaceAll(appPassword, '[redacted]'),
    )
    .slice(-20);
  await writeFile(
    reportFile,
    JSON.stringify(
      {
        status,
        createdAt: new Date().toISOString(),
        reason: error.message,
        state,
        startup,
        logFile,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  console.error(
    `${operations ? 'Operations' : runtime ? 'Media runtime' : p1 ? 'P1' : 'Authentication'} tests blocked. Evidence: ${reportFile}`,
  );
  process.exitCode = 1;
} finally {
  for (const target of [api, name]) raw([...prefix, 'rm', '--force', target]);
  raw([...prefix, 'network', 'rm', name]);
  if (fixtures) await rm(fixtures, { recursive: true, force: true });
  closeSync(log);
}
