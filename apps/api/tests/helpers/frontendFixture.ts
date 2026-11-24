// Disposable local integration service. It never loads deployment environment files or production credentials.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { join, extname, resolve, sep } from 'node:path';
import { createServer } from 'node:https';
import { request as httpRequest } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { openDatabase } from '../../src/db/client.ts';
import { bootstrap } from '../../src/db/bootstrap.ts';
import { Accounts, firstAdmin } from '../../src/accounts.ts';
import { Passwords, randomToken } from '../../src/security.ts';
import { buildApp } from '../../src/app.ts';
import { LocalObjectStore } from './localStore.ts';
import { mediaBoss } from '../../src/jobs/mediaQueue.ts';
import { guestContext } from '../../src/guest/routes.ts';
import { Works } from '../../src/cloud/works.ts';
import { DEFAULT_COMPOSE_SETTINGS } from '@wanwu-v2/contracts/work';
import { SOUND_CONTRACT_VERSION } from '@wanwu-v2/contracts/sound';
import { RULE_VERSIONS } from '@wanwu-v2/sound-rules/rules';

const exec = promisify(execFile),
  pgImage = 'postgres@sha256:858bb5e98eed02eb8cafbcdc007f9a65d1b613972028944a8ec2133ccaf80d27';
const types: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};
export async function frontendFixture(dist: string) {
  dist = resolve(dist);
  await stat(join(dist, 'index.html'));
  const id = randomUUID(),
    name = `wanwu-frontend-test-${id}`,
    dbName = `wanwu_sound_test_${id.replaceAll('-', '').slice(0, 8)}`;
  const password = randomBytes(32).toString('base64url'),
    appPassword = randomBytes(32).toString('base64url');
  const docker = existsSync('/Applications/Docker.app/Contents/Resources/bin/docker')
    ? '/Applications/Docker.app/Contents/Resources/bin/docker'
    : 'docker';
  const env: NodeJS.ProcessEnv = { ...process.env, POSTGRES_PASSWORD: password },
    cleanups: (() => Promise<unknown>)[] = [];
  const close = async () => {
    for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
  };
  const raw = async (args: string[]) =>
    (await exec(docker, args, { env, timeout: 30000, maxBuffer: 1024 ** 2 })).stdout.trim();
  let stage = 'local Docker';
  try {
    if (env.DOCKER_HOST && !env.DOCKER_HOST.startsWith('unix://'))
      throw new Error('local Docker required');
    const context = await raw(['context', 'show']);
    if (
      !(
        await raw(['context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}'])
      ).startsWith('unix://')
    )
      throw new Error('local Docker required');
    const call = (args: string[]) => raw(['--context', context, ...args]);
    await call(['image', 'inspect', pgImage]);
    stage = 'disposable PostgreSQL';
    await call(['network', 'create', name]);
    cleanups.push(() => call(['network', 'rm', name]));
    cleanups.push(() => call(['rm', '--force', name]));
    await call([
      'run',
      '--detach',
      '--name',
      name,
      '--network',
      name,
      '--platform',
      'linux/amd64',
      '--publish',
      '127.0.0.1::5432',
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
      `POSTGRES_DB=${dbName}`,
      pgImage,
      'postgres',
      '-c',
      'shared_buffers=32MB',
      '-c',
      'max_connections=20',
    ]);
    const ports = JSON.parse(
      await call(['inspect', name, '--format', '{{json .NetworkSettings.Ports}}']),
    )['5432/tcp'];
    if (ports.length !== 1 || ports[0].HostIp !== '127.0.0.1')
      throw new Error('unexpected port exposure');
    const owner = openDatabase(
      `postgresql://wanwu_owner:${password}@127.0.0.1:${ports[0].HostPort}/${dbName}`,
      'owner',
    );
    cleanups.push(() => owner.close());
    for (let i = 0; ; i++) {
      try {
        await owner.pool.query('SELECT 1');
        break;
      } catch {
        if (i > 100) throw new Error('database unavailable');
        await delay(200);
      }
    }
    await bootstrap(owner.pool, appPassword);
    const db = openDatabase(
      `postgresql://wanwu_app:${appPassword}@127.0.0.1:${ports[0].HostPort}/${dbName}`,
    );
    cleanups.push(() => db.close());
    stage = 'synthetic accounts';
    const hashes = new Passwords();
    await hashes.ready();
    const admin = await firstAdmin(owner.db, hashes, 'fixture_admin', 'Administrator_fixture123!');
    const accounts = new Accounts(db.db, hashes),
      teacherPassword = 'Teacher_fixture123!';
    const teachers = [];
    for (const username of ['fixture_teacher', 'fixture_other']) {
      const invitation = await accounts.createInvitation(admin.id);
      const account = await accounts.register({
        username,
        password: teacherPassword,
        invitationCode: invitation.code,
      });
      teachers.push({
        id: account.id,
        username,
        password: teacherPassword,
        role: account.role,
        authVersion: account.authVersion,
      });
    }
    const objects = await LocalObjectStore.create();
    cleanups.push(() => objects.close());
    const boss = mediaBoss(db.pool);
    const scratch = await mkdtemp(join(tmpdir(), 'wanwu-frontend-fixture-'));
    cleanups.push(() => rm(scratch, { recursive: true, force: true }));
    stage = 'temporary TLS';
    await exec(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-sha256',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-keyout',
        join(scratch, 'key.pem'),
        '-out',
        join(scratch, 'cert.pem'),
      ],
      { timeout: 15000, maxBuffer: 1024 ** 2 },
    );
    let upstream = '';
    const server = createServer(
      {
        key: await readFile(join(scratch, 'key.pem')),
        cert: await readFile(join(scratch, 'cert.pem')),
      },
      async (request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Referrer-Policy', 'no-referrer');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        try {
          if (await objects.serve(request, response)) return;
          if (request.url?.startsWith('/api/v1/')) {
            if (!upstream) {
              response.writeHead(503).end();
              return;
            }
            const headers: Record<string, string | string[] | undefined> = {
              ...request.headers,
              host: new URL(upstream).host,
              'x-forwarded-proto': 'https',
              'x-forwarded-for': '127.0.0.1',
            };
            delete headers['x-forwarded-host'];
            const proxy = httpRequest(
              new URL(request.url, upstream),
              { method: request.method, headers },
              (r) => {
                response.writeHead(r.statusCode ?? 502, r.headers);
                r.pipe(response);
              },
            );
            proxy.on('error', () => {
              if (!response.headersSent) response.writeHead(502);
              response.end();
            });
            proxy.setTimeout(20000, () => proxy.destroy());
            request.pipe(proxy);
            return;
          }
          const path = decodeURIComponent(
              new URL(request.url ?? '/', 'https://127.0.0.1').pathname,
            ),
            file = extname(path) ? resolve(dist, `.${path}`) : join(dist, 'index.html');
          if (!file.startsWith(dist + sep)) {
            response.writeHead(403).end();
            return;
          }
          response
            .writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' })
            .end(await readFile(file));
        } catch {
          if (!response.headersSent) response.writeHead(404);
          response.end();
        }
      },
    );
    cleanups.push(
      () =>
        new Promise<void>((done) => {
          server.closeAllConnections();
          server.close(() => done());
        }),
    );
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('HTTPS unavailable');
    const origin = `https://127.0.0.1:${address.port}`;
    objects.setOrigin(origin);
    const cloud = { pool: db.pool, boss, store: objects, origin };
    const model = {
      requests: [] as string[],
      line: '这里听起来很有意思。',
      gate: null as Promise<void> | null,
    };
    stage = 'local API';
    const guest = guestContext(
      {
        language: {
          baseUrl: 'https://example.invalid/v1',
          apiKey: 'synthetic-not-a-real-key',
          model: 'fixture-model',
          builtIn: true,
        },
        music: null,
        audio: null,
        dailyLimit: 1000,
      },
      async (_url, _headers, body) => {
        model.requests.push(JSON.stringify(body));
        const line = model.line,
          gate = model.gate;
        if (gate) await gate;
        return {
          status: 200,
          json: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    lines: [{ kind: 'single', line }],
                    tryThis: '再听一遍试试。',
                  }),
                },
              },
            ],
          },
        };
      },
      { pool: db.pool, boss },
    );
    const api = await buildApp(
      {
        origin,
        sessionSecret: randomToken(),
        cloudAuthMode: 'session',
        trustedProxyAddresses: ['127.0.0.1'],
      },
      db,
      false,
      cloud,
      guest,
    );
    cleanups.push(() => api.close());
    upstream = await api.listen({ host: '127.0.0.1', port: 0 });
    stage = 'synthetic processed source';
    const bytes = Buffer.alloc(44 + 48000 * 2);
    bytes.write('RIFF');
    bytes.writeUInt32LE(bytes.length - 8, 4);
    bytes.write('WAVEfmt ', 8);
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20);
    bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(48000, 24);
    bytes.writeUInt32LE(96000, 28);
    bytes.writeUInt16LE(2, 32);
    bytes.writeUInt16LE(16, 34);
    bytes.write('data', 36);
    bytes.writeUInt32LE(bytes.length - 44, 40);
    for (let i = 0; i < 48000; i++)
      bytes.writeInt16LE(Math.round(Math.sin((i * 2 * Math.PI * 440) / 48000) * 3000), 44 + i * 2);
    const wave = join(scratch, 'synthetic.wav');
    await writeFile(wave, bytes);
    const original = objects.key('originals'),
      playback = objects.key('playback'),
      checksum = createHash('sha256').update(bytes).digest('hex');
    await objects.put(original, wave, 'audio/wav');
    await objects.put(playback, wave, 'audio/wav');
    const teacher = teachers[0]!,
      sourceId = `recording:${randomUUID()}`,
      workId = `work:${randomUUID()}`;
    const source = {
      id: sourceId,
      kind: 'local-recording',
      label: '合成音源',
      durationMs: 1000,
      mimeType: 'audio/wav',
      provenance: {
        recordedBy: '测试录音人',
        recordedOn: '2026-11-01',
        place: '测试地点',
        group: null,
        provenanceUrl: null,
      },
    };
    const analysis = {
      rules: RULE_VERSIONS.analysis,
      durationMs: 1000,
      silent: false,
      main: { startMs: 0, endMs: 1000 },
      units: [{ startMs: 0, endMs: 1000, peakDb: -10 }],
      kind: 'one',
      unitMs: 1000,
      lengthBand: 'short',
      loudnessDb: -20,
      peakDb: -10,
      brightnessHz: 500,
      band: 'mid',
    };
    await owner.pool.query(
      "INSERT INTO sources(id,owner_id,metadata,checksum,bytes,status,original_key,playback_key,playback_checksum,analysis,duration_ms) VALUES($1,$2,$3,$4,$5,'ready',$6,$7,$4,$8,1000)",
      [sourceId, teacher.id, source, checksum, bytes.length, original, playback, analysis],
    );
    await owner.pool.query(
      "INSERT INTO stored_objects(object_key,kind,source_id) VALUES($1,'original',$3),($2,'playback',$3)",
      [original, playback, sourceId],
    );
    const work = await new Works(cloud).create(teacher, {
      id: workId,
      title: '云端核对测试',
      arrangement: {
        version: 'arrangement-v1',
        id: workId,
        units: [
          {
            version: SOUND_CONTRACT_VERSION,
            id: 'unit:fixture',
            sourceId,
            name: '仅留本地的声卡名',
            maker: null,
            markerIndex: 0,
            shape: {},
            input: 'manual',
            createdAt: new Date().toISOString(),
          },
        ],
        events: [
          {
            id: 'event:fixture',
            unitId: 'unit:fixture',
            at: 0,
            row: 0,
            clip: { startMs: 0, endMs: 1000 },
          },
        ],
        rows: 3,
        spanSeconds: 30,
        mood: null,
        origin: 'child',
        updatedAt: new Date().toISOString(),
      },
      settings: DEFAULT_COMPOSE_SETTINGS,
    });
    return { origin, teacher, other: teachers[1]!, work, model, db, close };
  } catch {
    await close();
    throw new Error(`Local frontend fixture failed at ${stage}; private output suppressed`);
  }
}
