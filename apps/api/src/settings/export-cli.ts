// Root-owned host tooling captures this pipe directly. Never run in a user-facing terminal/log.
import { initializeSettings } from './store.ts';
if (process.argv[2] !== '--private-pipe') throw new Error('A private operator pipe is required');
try {
  const store = await initializeSettings();
  if (!store) throw new Error('no-settings');
  process.stdout.write(JSON.stringify(store.hostConfiguration()));
} catch {
  console.error('Cannot export validated Wanwu settings; values suppressed.');
  process.exitCode = 1;
}
