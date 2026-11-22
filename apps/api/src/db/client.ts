import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.ts';
import { dedicatedDatabaseUrl } from '../config.ts';
import { settingNumber } from '../settings/store.ts';

export function openDatabase(url: string, role: 'app' | 'owner' = 'app') {
  const pool = new pg.Pool({
    connectionString: dedicatedDatabaseUrl(url, role),
    max: settingNumber('database.poolMax'),
    connectionTimeoutMillis: settingNumber('database.connectMs'),
    idleTimeoutMillis: 30_000,
    statement_timeout: settingNumber('database.statementMs'),
    application_name: `wanwu-${role}`,
  });
  return { pool, db: drizzle(pool, { schema }), close: () => pool.end() };
}
export type Database = ReturnType<typeof openDatabase>['db'];
