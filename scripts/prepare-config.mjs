import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { mkdir, writeFile, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// New project secrets only. No cloud calls, existing app reads, or overwriting previous secret material.
const root = fileURLToPath(new URL('../.secrets/', import.meta.url)),
  deployment = path.join(root, 'deployment');
try {
  await mkdir(root, { mode: 0o700 });
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  const entry = await lstat(root);
  if (entry.isSymbolicLink() || !entry.isDirectory() || entry.mode & 0o077)
    throw new Error('Existing secret directory must be private; nothing changed');
}
await mkdir(deployment, { mode: 0o700 }); // EEXIST deliberately stops, never rotates an existing key/password.
const secret = () => randomBytes(32).toString('base64url'),
  owner = secret(),
  app = secret(),
  session = secret();
const url = (role, password) => `postgresql://wanwu_${role}:${password}@database:5432/wanwu_sound`;
const oss = [
  'WANWU_OSS_BUCKET=wanwu-sound-dev-a7k3',
  'WANWU_OSS_REGION=oss-cn-shanghai',
  'WANWU_OSS_PREFIX=wanwu/prod',
  'WANWU_OSS_ACCESS_KEY_ID=',
  'WANWU_OSS_ACCESS_KEY_SECRET=',
];
const write = (file, rows) => writeFile(file, rows.join('\n') + '\n', { flag: 'wx', mode: 0o600 });
await write(path.join(deployment, '.env.database'), [
  'POSTGRES_USER=wanwu_owner',
  'POSTGRES_DB=wanwu_sound',
  `POSTGRES_PASSWORD=${owner}`,
]);
await write(path.join(deployment, '.env.api'), [
  `WANWU_DATABASE_URL=${url('app', app)}`,
  `WANWU_SESSION_SECRET=${session}`,
  'WANWU_APP_ORIGIN=https://wanwu.proterm.ink',
  'WANWU_CLOUD_AUTH_MODE=disabled',
  'WANWU_TRUSTED_PROXY_ADDRESSES=',
  ...oss,
]);
await write(path.join(deployment, '.env.models'), [
  '# Optional AI settings; empty means built-in AI is closed.',
]);
await write(path.join(deployment, '.env.worker'), [
  `WANWU_DATABASE_URL=${url('app', app)}`,
  'WANWU_APP_ORIGIN=https://wanwu.proterm.ink',
  ...oss,
]);
await write(path.join(deployment, '.env.ops'), [
  `WANWU_MIGRATION_DATABASE_URL=${url('owner', owner)}`,
  `WANWU_APP_DB_PASSWORD=${app}`,
  `WANWU_DATABASE_URL=${url('app', app)}`,
  'WANWU_APP_ORIGIN=https://wanwu.proterm.ink',
  'WANWU_BACKUP_PUBLIC_KEY_FILE=/run/wanwu/backup-public.pem',
  ...oss,
]);
const pair = generateKeyPairSync('rsa', {
  modulusLength: 3072,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
await writeFile(path.join(root, 'backup-private.pem'), pair.privateKey, {
  flag: 'wx',
  mode: 0o600,
});
await writeFile(path.join(deployment, 'backup-public.pem'), pair.publicKey, {
  flag: 'wx',
  mode: 0o644,
});
await write(path.join(root, 'admin-password.txt'), [secret()]);
console.log(
  JSON.stringify({
    status: 'prepared-locally-not-deployed',
    directory: root,
    cloudAuthentication: 'disabled',
    remaining: [
      'dedicated OSS runtime/ops credentials',
      'observed exact proxy IP',
      'same-origin H5 gateway and DNS/TLS authorization',
    ],
    neverUpload: ['backup-private.pem', 'admin-password.txt'],
  }),
);
