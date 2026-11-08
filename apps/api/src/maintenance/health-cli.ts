import { openDatabase } from '../db/client.ts';
import { operationalHealth } from './operationalHealth.ts';
const database = openDatabase(process.env.WANWU_DATABASE_URL ?? '');
try {
  if (process.argv.includes('--worker-only')) {
    const row = (
      await database.pool.query(
        "SELECT extract(epoch FROM now()-seen_at)::int AS age FROM runtime_status WHERE component='media-worker'",
      )
    ).rows[0];
    const pass = !!row && row.age < 90;
    console.log(
      JSON.stringify({ status: pass ? 'pass' : 'attention', workerAgeSeconds: row?.age ?? null }),
    );
    if (!pass) process.exitCode = 1;
  } else {
    const report = await operationalHealth(database.pool);
    console.log(JSON.stringify(report));
    if (report.status !== 'pass') process.exitCode = 1;
  }
} catch {
  console.error('Wanwu operational health check failed; details suppressed.');
  process.exitCode = 1;
} finally {
  await database.close();
}
