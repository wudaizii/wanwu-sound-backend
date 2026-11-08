// Two real HTTPS Nginx hosts, one shared API snippet, disposable local upstream; no production network/configuration.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, chmod, rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import https from 'node:https';
const execute = promisify(execFile),
  root = fileURLToPath(new URL('../', import.meta.url));
const id = randomUUID(),
  name = `wanwu-gateway-test-${id}`,
  upstream = `wanwu-gw-up-${id}`;
const nginx = 'nginx@sha256:583b7f2fce1cdb8da5ad5c39ebd3c33b98b87d493190e548bdee1fa8c619c311';
const node = 'node@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20';
const call = async (args, timeout = 30_000) =>
  (await execute('docker', args, { cwd: root, timeout, maxBuffer: 2 * 1024 * 1024 })).stdout.trim();
const context = await call(['context', 'show']);
if (
  (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://')) ||
  !(
    await call(['context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}'])
  ).startsWith('unix://')
)
  throw new Error('Local Unix Docker context required');
const docker = (args, timeout) => call(['--context', context, ...args], timeout);
await mkdir(path.join(root, 'artifacts'), { recursive: true });
const fixture = await mkdtemp(path.join(root, 'artifacts', 'wanwu-gateway-fixture-'));
await chmod(fixture, 0o755);
const write = (name, text) =>
  writeFile(path.join(fixture, name), text, { flag: 'wx', mode: 0o644 });
let result;
try {
  await docker(['image', 'inspect', nginx]);
  await docker(['image', 'inspect', node]);
  await execute(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      path.join(fixture, 'key.pem'),
      '-out',
      path.join(fixture, 'cert.pem'),
      '-days',
      '1',
      '-subj',
      '/CN=wanwu-gateway-test.invalid',
    ],
    { timeout: 20_000 },
  );
  await chmod(path.join(fixture, 'key.pem'), 0o644); // Disposable test TLS key only, removed in finally.
  for (const snippet of ['http', 'api-routes', 'api-proxy']) {
    let text = await readFile(
      path.join(root, `deploy/runtime/wanwu-${snippet}.nginx.conf.example`),
      'utf8',
    );
    if (snippet === 'api-proxy')
      text = text.replace('http://127.0.0.1:3100', `http://${upstream}:3100`);
    await write(`wanwu-${snippet}.conf`, text);
  }
  let servers = '';
  for (const host of ['api', 'h5']) {
    let text = await readFile(
      path.join(root, `deploy/runtime/wanwu-${host}.nginx.conf.example`),
      'utf8',
    );
    text = text
      .replaceAll('listen 443 ssl', 'listen 8443 ssl')
      .replaceAll('listen 80;', 'listen 8080;')
      .replace(/\/etc\/letsencrypt\/live\/[^;]+\/fullchain.pem/g, '/fixtures/cert.pem')
      .replace(/\/etc\/letsencrypt\/live\/[^;]+\/privkey.pem/g, '/fixtures/key.pem')
      .replace(/\/var\/log\/nginx\/([^; ]+)/g, '/tmp/$1');
    servers += text + '\n';
  }
  await write(
    'nginx.conf',
    `pid /tmp/nginx.pid;\nerror_log /tmp/error.log;\nworker_processes 1;\nevents {worker_connections 128;}\nhttp {\nclient_body_temp_path /tmp/body;\nproxy_temp_path /tmp/proxy;\nfastcgi_temp_path /tmp/fastcgi;\nuwsgi_temp_path /tmp/uwsgi;\nscgi_temp_path /tmp/scgi;\ninclude /etc/nginx/wanwu/wanwu-http.conf;\n${servers}\n}\n`,
  );
  await write(
    'upstream.mjs',
    `import http from 'node:http';http.createServer(async(req,res)=>{let bytes=0;for await(const c of req)bytes+=c.length;
 const respond=()=>{res.setHeader('content-type','application/json');res.setHeader('set-cookie','__Host-wanwu=test-only; Path=/; HttpOnly; Secure; SameSite=Lax');
 res.end(JSON.stringify({bytes,cookie:req.headers.cookie,csrf:req.headers['x-csrf-token'],origin:req.headers.origin,match:req.headers['if-match'],forwarded:req.headers['x-forwarded-for'],proto:req.headers['x-forwarded-proto']}));};
 if(req.headers['x-test-delay'])setTimeout(respond,21000);else respond();}).listen(3100,'0.0.0.0');`,
  );
  // This test needs an ephemeral loopback-published HTTPS port; Docker's internal-only network suppresses it.
  await docker(['network', 'create', name]);
  const common = [
    '--detach',
    '--network',
    name,
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '--cpus',
    '0.25',
    '--memory',
    '128m',
    '--memory-swap',
    '128m',
    '--pids-limit',
    '64',
    '--log-opt',
    'max-size=1m',
    '--log-opt',
    'max-file=3',
  ];
  await docker([
    'run',
    ...common,
    '--name',
    upstream,
    '--user',
    '1000:1000',
    '--mount',
    `type=bind,source=${fixture},target=/fixtures,readonly`,
    node,
    'node',
    '/fixtures/upstream.mjs',
  ]);
  const nginxMounts = [
    '--user',
    '101:101',
    '--tmpfs',
    '/tmp:rw,nosuid,noexec,size=32m,mode=1777',
    '--mount',
    `type=bind,source=${fixture},target=/fixtures,readonly`,
    '--mount',
    `type=bind,source=${fixture},target=/etc/nginx/wanwu,readonly`,
  ];
  await docker([
    'run',
    '--rm',
    '--network',
    name,
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    ...nginxMounts,
    '--entrypoint',
    'nginx',
    nginx,
    '-t',
    '-c',
    '/fixtures/nginx.conf',
  ]);
  await docker([
    'run',
    ...common,
    '--name',
    name,
    '--publish',
    '127.0.0.1::8443',
    ...nginxMounts,
    '--entrypoint',
    'nginx',
    nginx,
    '-c',
    '/fixtures/nginx.conf',
    '-g',
    'daemon off;',
  ]);
  await docker(['exec', name, 'nginx', '-t', '-c', '/fixtures/nginx.conf']);
  const port = Number((await docker(['port', name, '8443/tcp'])).split(':').at(-1));
  const request = (host, url, size = 0, extra = {}) =>
    new Promise((resolve, reject) => {
      const req = https.request(
        {
          host: '127.0.0.1',
          port,
          servername: host,
          path: url,
          method: 'POST',
          rejectUnauthorized: false,
          headers: {
            Host: host,
            'content-type': 'application/json',
            'content-length': String(size),
            Origin: 'https://wanwu.proterm.ink',
            Cookie: '__Host-wanwu=disposable-test',
            'x-csrf-token': 'synthetic-test-token',
            'if-match': '"work-r1"',
            'x-forwarded-for': '1.2.3.4',
            ...extra,
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            let body;
            try {
              body = JSON.parse(Buffer.concat(chunks).toString());
            } catch {}
            resolve({ status: res.statusCode, headers: res.headers, body });
          });
        },
      );
      req.setTimeout(55_000, () => req.destroy(new Error('local-gateway-timeout')));
      req.on('error', reject);
      req.end(Buffer.alloc(size, 32));
    });
  let checks = 0;
  for (const host of ['wanwu.proterm.ink', 'wanwu-api.proterm.ink']) {
    for (const [url, size, expected] of [
      ['/api/v1/discovery/work', 300_000, 200],
      ['/api/v1/discovery/work', 5_200_001, 413],
      ['/api/v1/textbook/features', 300_000, 200],
      ['/api/v1/textbook/features', 1_265_537, 413],
      ['/api/v1/works/work_test', 600_000, 200],
      ['/api/v1/works/work:test', 1_048_577, 413],
      ['/api/v1/talk/work', 262_145, 413],
    ]) {
      const response = await request(host, url, size);
      assert.equal(response.status, expected, `${host} ${url}`);
      checks++;
      if (expected === 200) {
        assert.equal(response.body.bytes, size);
        assert.equal(response.body.cookie, '__Host-wanwu=disposable-test');
        assert.equal(response.body.origin, 'https://wanwu.proterm.ink');
        assert.equal(response.body.csrf, 'synthetic-test-token');
        assert.equal(response.body.match, '"work-r1"');
        assert.equal(response.body.proto, 'https');
        assert.notEqual(response.body.forwarded, '1.2.3.4');
        assert.ok(response.headers['set-cookie'][0].includes('HttpOnly; Secure; SameSite=Lax'));
      }
    }
  }
  // Prove the former generic 20s read timeout no longer truncates this specific route.
  assert.equal(
    (await request('wanwu.proterm.ink', '/api/v1/discovery/work', 0, { 'x-test-delay': 'true' }))
      .status,
    200,
  );
  checks++;
  result = {
    status: 'pass',
    checks,
    nginxImage: nginx,
    twoHosts: true,
    cookieAndCSRFUnchanged: true,
    delayedDiscoverySeconds: 21,
    productionAcceptance: false,
  };
  await writeFile(
    path.join(root, 'artifacts', `${name}.json`),
    JSON.stringify(result, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  console.log(JSON.stringify(result));
} catch (error) {
  // Only this script's disposable fixtures/containers. Never inspect a shared server or credentials.
  for (const target of [name, upstream]) {
    const logs = await execute('docker', ['--context', context, 'logs', target], {
      timeout: 5000,
    }).catch(() => null);
    if (logs) console.error(logs.stdout + logs.stderr);
    console.error(await docker(['inspect', target, '--format', '{{json .State}}']).catch(() => ''));
  }
  throw error;
} finally {
  for (const target of [name, upstream]) await docker(['rm', '--force', target]).catch(() => {});
  await docker(['network', 'rm', name]).catch(() => {});
  await rm(fixture, { recursive: true, force: true });
}
