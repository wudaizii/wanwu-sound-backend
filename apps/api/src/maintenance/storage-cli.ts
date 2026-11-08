import { openDatabase } from '../db/client.ts';
import { OssStore, ossConfig } from '../storage/ossStore.ts';
import { reconcileStorage } from './storageReconcile.ts';
const database = openDatabase(process.env.WANWU_DATABASE_URL ?? '');
try {
  const counts = await reconcileStorage(database.pool, new OssStore(ossConfig()));
  console.log(JSON.stringify({ kind: 'storage-reconcile', ...counts }));
  if (counts.missing + counts.invalid + counts.unavailable + counts.unregistered)
    process.exitCode = 1;
} catch {
  console.error('Wanwu storage audit failed; object names and credentials suppressed.');
  process.exitCode = 1;
} finally {
  await database.close();
}
