import { openDatabase } from '../db/client.ts';
import { auditFoundation } from './foundationAudit.ts';

const database = openDatabase(process.env.WANWU_MIGRATION_DATABASE_URL ?? '', 'owner');
try {
  const result = await auditFoundation(database.pool);
  console.log(JSON.stringify(result));
  if (result.status !== 'pass') process.exitCode = 1;
} catch {
  console.error('Wanwu read-only foundation audit failed; sensitive details suppressed.');
  process.exitCode = 1;
} finally {
  await database.close();
}
