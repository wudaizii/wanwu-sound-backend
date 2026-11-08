import { execFile, spawn, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, copyFile, lstat, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { rendererSeccompProfile } from '../deploy/media-prototype/seccomp-policy.ts';
import { createReadStream } from 'node:fs';
import { releaseManifest, releaseEnvironment, imageKinds } from '../deploy/runtime/image-pins.ts';

const execute = promisify(execFile),
  root = fileURLToPath(new URL('../', import.meta.url));
if (root.startsWith('/srv/') || (process.platform !== 'darwin' && process.env.CI !== 'true'))
  throw new Error('Build only on the local Mac or explicit CI, never on the shared ECS');
let docker = 'docker';
if (spawnSync(docker, ['--version']).error?.code === 'ENOENT')
  docker = '/Applications/Docker.app/Contents/Resources/bin/docker';
const environment = { ...process.env, PATH: `${path.dirname(docker)}:${process.env.PATH ?? ''}` };
const call = async (binary, args, timeout = 30_000) =>
  (
    await execute(binary, args, {
      cwd: root,
      env: environment,
      timeout,
      maxBuffer: 4 * 1024 * 1024,
    })
  ).stdout.trim();
const context = await call(docker, ['context', 'show']);
if (
  (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://')) ||
  !(
    await call(docker, ['context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}'])
  ).startsWith('unix://')
)
  throw new Error('A local Docker context is required');
async function sourceSnapshot() {
  const files = (
    await call('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
  )
    .split('\0')
    .filter(
      (name) =>
        name &&
        /^(apps\/|packages\/|deploy\/|data\/|assets-source\/audio\/|scripts\/|package(?:-lock)?\.json$|\.dockerignore$)/.test(
          name,
        ) &&
        !/(?:^|\/)(?:\.env|node_modules|artifacts|dist)(?:\/|\.|$)/.test(name) &&
        !/\.(?:pem|key|p12|pfx)$/.test(name),
    )
    .sort();
  const hash = createHash('sha256'),
    sourceFiles = [];
  for (const file of files) {
    let info;
    try {
      info = await lstat(path.join(root, file));
    } catch {
      continue;
    }
    if (info.isSymbolicLink()) throw new Error('Release source symlinks require separate review');
    if (!info.isFile()) continue;
    const sha256 = createHash('sha256')
      .update(await readFile(path.join(root, file)))
      .digest('hex');
    hash.update(file + '\0' + sha256 + '\n');
    sourceFiles.push({ path: file, sha256 });
  }
  return { sourceDigest: hash.digest('hex'), sourceFiles };
}
const { sourceDigest, sourceFiles } = await sourceSnapshot(),
  commit = await call('git', ['rev-parse', 'HEAD']),
  id = `${commit.slice(0, 12)}-${sourceDigest.slice(0, 12)}`;
const dirty = (await call('git', ['status', '--porcelain'])).length > 0;
const output = path.join(root, 'artifacts', 'releases', id),
  bundle = path.join(output, 'deployment');
await mkdir(bundle, { recursive: true, mode: 0o700 });
const build = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      docker,
      [
        '--context',
        context,
        'build',
        '--platform',
        'linux/amd64',
        '--file',
        'deploy/runtime/Dockerfile',
        '--build-arg',
        `WANWU_BUILD_COMMIT=${commit}`,
        '--build-arg',
        `WANWU_BUILD_SOURCE_DIGEST=${sourceDigest}`,
        '--build-arg',
        `WANWU_BUILD_DIRTY=${dirty}`,
        ...args,
        '.',
      ],
      { cwd: root, env: environment, stdio: 'inherit' },
    );
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('Local release build failed')),
    );
  });
const images = {};
for (const target of ['api', 'worker', 'ops', 'catalogue']) {
  const tag = `wanwu-${target}:${id}`,
    iid = path.join(output, `${target}.iid`),
    metadata = path.join(output, `${target}.metadata.json`);
  await build(['--target', target, '--tag', tag, '--iidfile', iid, '--metadata-file', metadata]);
  const image = await readFile(iid, 'utf8'),
    configDigest = JSON.parse(await readFile(metadata, 'utf8'))['containerimage.config.digest'];
  if (!/^sha256:[a-f0-9]{64}$/.test(image.trim())) throw new Error('Image digest missing');
  images[target] = { tag, id: image.trim(), configDigest };
}
const keepArchive = process.argv.includes('--archive'),
  archive = path.join(output, keepArchive ? 'images.tar' : '.config-digests.tar');
// Index builds may omit config.digest from BuildKit metadata. Read the actual Docker export, never guess from the image ID.
if (
  keepArchive ||
  Object.values(images).some((image) => !/^sha256:[a-f0-9]{64}$/.test(image.configDigest))
) {
  try {
    await call(
      docker,
      ['save', '--output', archive, ...Object.values(images).map((image) => image.tag)],
      10 * 60_000,
    );
    const entries = JSON.parse(await call('tar', ['-xOf', archive, 'manifest.json']));
    for (const image of Object.values(images)) {
      const entry = entries.find((row) => row.RepoTags?.includes(image.tag));
      if (!entry || !/^(?:blobs\/sha256\/)?[a-f0-9]{64}(?:\.json)?$/.test(entry.Config))
        throw new Error('Exported config descriptor missing');
      const bytes = (
        await execute('tar', ['-xOf', archive, entry.Config], {
          encoding: 'buffer',
          maxBuffer: 4 * 1024 * 1024,
        })
      ).stdout;
      const actual = 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
        named = 'sha256:' + entry.Config.match(/[a-f0-9]{64}/)[0];
      if (actual !== named || (image.configDigest && image.configDigest !== actual))
        throw new Error('Exported config digest mismatch');
      image.configDigest = actual;
    }
    if (keepArchive) {
      const checksum = createHash('sha256');
      for await (const chunk of createReadStream(archive)) checksum.update(chunk);
      await writeFile(
        path.join(output, 'images.tar.sha256'),
        `${checksum.digest('hex')}  images.tar\n`,
        { mode: 0o600 },
      );
    }
  } finally {
    if (!keepArchive) await rm(archive, { force: true });
  }
}
const manifest = {
  project: 'wanwu-sound',
  commit,
  sourceDigest,
  dirty,
  builtAt: new Date().toISOString(),
  platform: 'linux/amd64',
  images,
  sourceFiles,
};
releaseManifest(manifest);
for (const name of [
  'compose.yml',
  'operate.mjs',
  'wanwu-maintenance.sh',
  'resolve-images.mjs',
  'image-pins.ts',
  'wanwu-api.nginx.conf.example',
  'wanwu-api-proxy.nginx.conf.example',
  'wanwu-api-routes.nginx.conf.example',
  'wanwu-http.nginx.conf.example',
  'wanwu-h5.nginx.conf.example',
  'model-environment.ts',
  'models.env.example',
  'api.env.example',
  'worker.env.example',
  'database.env.example',
  'ops.env.example',
  'release.env.example',
  'oss-runtime-policy.example.json',
  'oss-ops-policy.example.json',
  'wanwu-backup.service.example',
  'wanwu-backup.timer.example',
  'wanwu-cleanup.service.example',
  'wanwu-cleanup.timer.example',
  'wanwu-health.service.example',
  'wanwu-health.timer.example',
  'wanwu-storage.service.example',
  'wanwu-storage.timer.example',
])
  await copyFile(path.join(root, 'deploy/runtime', name), path.join(bundle, name));
await writeFile(
  path.join(bundle, 'seccomp-profile.json'),
  rendererSeccompProfile(
    await readFile(path.join(root, 'deploy/media-prototype/seccomp-profile.json')),
  ),
  { mode: 0o600 },
);
if (
  (await sourceSnapshot()).sourceDigest !== sourceDigest ||
  (await call('git', ['rev-parse', 'HEAD'])) !== commit
)
  throw new Error('Source changed during image construction; no new release manifest emitted');
await writeFile(
  path.join(bundle, 'release-manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
  { mode: 0o600 },
);
await writeFile(
  path.join(bundle, '.env.release'),
  releaseEnvironment(
    manifest,
    Object.fromEntries(imageKinds.map((kind) => [kind, images[kind].id])),
  ),
  { mode: 0o600 },
);
console.log(
  JSON.stringify(
    { status: 'built-locally-not-deployed', id, bundle, sourceDigest, images },
    null,
    2,
  ),
);
