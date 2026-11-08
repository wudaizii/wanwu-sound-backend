import { openDatabase } from '../db/client.ts';
import { OssStore, ossConfig } from '../storage/ossStore.ts';
import { mediaBoss } from '../jobs/mediaQueue.ts';
import { collectGarbage } from './garbageCollection.ts';

const database = openDatabase(process.env.WANWU_DATABASE_URL ?? ''),
  boss = mediaBoss(database.pool);
try {
  const counts = await collectGarbage({
    pool: database.pool,
    boss,
    store: new OssStore(ossConfig()),
    origin: process.env.WANWU_APP_ORIGIN ?? 'https://wanwu.proterm.ink',
  });
  console.log(JSON.stringify({ kind: 'garbage-collection', ...counts }));
  if (counts.failures) process.exitCode = 1;
} catch {
  console.error('Wanwu cleanup failed; no object names, credentials or private data are logged.');
  process.exitCode = 1;
} finally {
  await database.close();
}
