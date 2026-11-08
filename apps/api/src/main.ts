import { buildApp } from './app.ts';
import { readConfig } from './config.ts';
import { openDatabase } from './db/client.ts';
import { mediaBoss } from './jobs/mediaQueue.ts';
import { OssStore, ossConfig } from './storage/ossStore.ts';
import { CLOSED, readGuestConfig } from './guest/config.ts';
import { guestContext } from './guest/routes.ts';
import { verifyBuildSource } from './version.ts';
import { PgBackgroundJobs } from './guest/pgJobs.ts';
import { resourceLimits } from './cloud/quotas.ts';

verifyBuildSource();
resourceLimits();

const config = readConfig(),
  database = openDatabase(process.env.WANWU_DATABASE_URL ?? '');
const host = process.env.WANWU_API_HOST ?? '127.0.0.1',
  port = Number(process.env.WANWU_API_PORT ?? 3100);
if (
  !['127.0.0.1', '0.0.0.0'].includes(host) ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  port === 3000
)
  throw new Error('Invalid Wanwu API listener; existing port 3000 is reserved');
let closing = false;
const boss = config.cloudAuthMode === 'session' ? mediaBoss(database.pool) : undefined;
try {
  if (boss) await boss.start();
  const cloud = boss
    ? { pool: database.pool, boss, store: new OssStore(ossConfig()), origin: config.origin }
    : undefined;
  // Guest AI settings live in their own file; malformed settings close only this module, never the API.
  let guestConfig = CLOSED,
    guestProblem = false;
  try {
    guestConfig = readGuestConfig();
  } catch {
    guestProblem = true;
  }
  const guest = boss
    ? guestContext(guestConfig, undefined, { pool: database.pool, boss })
    : undefined;
  const app = await buildApp(config, database, true, cloud, guest);
  if (guest?.jobs instanceof PgBackgroundJobs) {
    await guest.jobs.listen();
  }
  if (guestProblem)
    app.log.error(
      { reason: 'guest-ai-config-invalid' },
      'Wanwu guest AI settings are invalid; guest AI is closed',
    );
  database.pool.on('error', () =>
    app.log.error({ reason: 'database-connection-error' }, 'Wanwu database connection failed'),
  );
  const stop = async () => {
    if (closing) return;
    closing = true;
    await app.close();
    await boss?.stop();
    await database.close();
  };
  process.once('SIGTERM', () => void stop());
  process.once('SIGINT', () => void stop());
  await app.listen({ host, port });
} catch {
  await boss?.stop().catch(() => {});
  await database.close();
  console.error('Wanwu API could not start; no credentials are logged.');
  process.exitCode = 1;
}
