import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import type { Pool } from 'pg';

/** Read-only production preflight. No usernames, password hashes, cookies or object keys in its output. */
export async function auditFoundation(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const identity = (
      await client.query(
        "SELECT current_database() AS name,current_user AS role,current_setting('server_version_num')::integer AS version",
      )
    ).rows[0];
    if (
      !/^wanwu_sound(?:_test_[a-f0-9]{8})?$/.test(identity.name) ||
      identity.role !== 'wanwu_owner'
    )
      throw new Error('dedicated-owner-required');
    const role = (
      await client.query(`SELECT rolsuper,rolinherit,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,
      EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid) AS membership
      FROM pg_roles WHERE rolname='wanwu_app'`)
    ).rows[0];
    const denied = (
      await client.query(`SELECT
      has_schema_privilege('wanwu_app','public','CREATE') AS public_create,
      has_schema_privilege('wanwu_app','wanwu_jobs','CREATE') AS queue_create,
      has_column_privilege('wanwu_app','accounts','role','INSERT') AS insert_role,
      has_column_privilege('wanwu_app','accounts','role','UPDATE') AS update_role,
      has_table_privilege('wanwu_app','admin_audit','DELETE') AS delete_audit,
      has_table_privilege('wanwu_app','backup_object_pins','INSERT,UPDATE,DELETE') AS alter_pins,
      has_table_privilege('wanwu_app','_wanwu_migrations','INSERT,UPDATE,DELETE') AS alter_migrations`)
    ).rows[0];
    const folder = new URL('../../migrations/', import.meta.url);
    const expected = new Map<string, string>();
    for (const name of (await readdir(folder)).filter((n) => /^\d{4}_[a-z_]+\.sql$/.test(n)).sort())
      expected.set(
        name,
        createHash('sha256')
          .update(await readFile(new URL(name, folder)))
          .digest('hex'),
      );
    const applied = (
      await client.query<{ name: string; sha256: string }>(
        'SELECT name,sha256 FROM _wanwu_migrations',
      )
    ).rows;
    const migrationsMatch =
      applied.length === expected.size &&
      applied.every((row) => expected.get(row.name) === row.sha256);
    const activeAdministrators = Number(
      (
        await client.query(
          "SELECT count(*)::integer AS count FROM accounts WHERE role='admin' AND status='active'",
        )
      ).rows[0].count,
    );
    const checks = {
      dedicatedDatabase: true,
      postgres17: identity.version >= 170000 && identity.version < 180000,
      restrictedAppRole: !!role && !Object.values(role).some(Boolean),
      restrictedGrants: !!denied && !Object.values(denied).some(Boolean),
      migrationsMatch,
      administratorPresent: activeAdministrators > 0,
    };
    await client.query('COMMIT');
    return {
      status: Object.values(checks).every(Boolean) ? 'pass' : 'attention',
      checks,
      activeAdministrators,
      migrations: applied.length,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
