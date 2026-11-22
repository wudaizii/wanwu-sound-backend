import { openDatabase } from '../../api/src/db/client.ts';
import { OssStore, ossConfig } from '../../api/src/storage/ossStore.ts';
import { mediaBoss } from '../../api/src/jobs/mediaQueue.ts';
import { startMediaWorker } from './jobs/mediaWorker.ts';
import { toolVersions } from './media/tools.ts';
import { initializeSettings, settingsEnvironment } from '../../api/src/settings/store.ts';

await initializeSettings();
if (process.env.WANWU_MIGRATION_DATABASE_URL || process.env.WANWU_APP_DB_PASSWORD)
  throw new Error('The worker must not receive management credentials');
const database = openDatabase(settingsEnvironment().WANWU_DATABASE_URL ?? ''),
  boss = mediaBoss(database.pool);
let worker: Awaited<ReturnType<typeof startMediaWorker>> | undefined,
  closing = false;
const stop = async () => {
  if (closing) return;
  closing = true;
  await worker?.stop();
  await boss.stop().catch(() => {});
  await database.close();
};
try {
  const origin = settingsEnvironment().WANWU_APP_ORIGIN ?? 'https://wanwu.proterm.ink';
  if (new URL(origin).origin !== origin || !origin.startsWith('https://'))
    throw new Error('Invalid app origin');
  const store = new OssStore(ossConfig()),
    tools = { ffmpeg: '/usr/bin/ffmpeg', ffprobe: '/usr/bin/ffprobe' };
  await toolVersions(tools);
  worker = await startMediaWorker(
    { pool: database.pool, boss, store, origin },
    '/var/lib/wanwu-media',
    tools,
  );
  database.pool.on('error', () => {
    console.error('Wanwu worker database unavailable.');
    void stop().finally(() => {
      process.exitCode = 1;
    });
  });
  process.once('SIGTERM', () => void stop());
  process.once('SIGINT', () => void stop());
  console.log('Wanwu media worker ready; one heavy task at a time.');
} catch {
  console.error('Wanwu worker could not start; no credentials or object URLs are logged.');
  process.exitCode = 1;
  await stop();
}
