// Invoked only by the fixed host applier after a controlled restart. No HTTP or user credentials.
import { initializeSettings, settingsEnvironment } from './store.ts';
import { openDatabase } from '../db/client.ts';
import { OssStore, ossConfig } from '../storage/ossStore.ts';
let database: ReturnType<typeof openDatabase> | undefined;
try {
  await initializeSettings();
  database = openDatabase(settingsEnvironment().WANWU_DATABASE_URL ?? '');
  await database.pool.query('SELECT 1');
  const row = (
    await database.pool.query(
      "SELECT playback_key FROM sources WHERE catalogue AND status='ready' AND playback_key IS NOT NULL LIMIT 1",
    )
  ).rows[0];
  if (!row) throw new Error('no-trusted-storage-probe');
  await new OssStore(ossConfig()).head(row.playback_key);
  console.log(JSON.stringify({ status: 'pass', database: true, storage: true }));
} catch {
  console.error('Wanwu runtime connection verification failed; private details suppressed.');
  process.exitCode = 1;
} finally {
  await database?.close();
}
