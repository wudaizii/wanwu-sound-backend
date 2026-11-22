import type { Session } from 'fastify';
import type { SessionStore } from '@fastify/session';
import type { Pool } from 'pg';
import { settingNumber } from './settings/store.ts';
import { tokenDigest } from './security.ts';
import { ApiError } from './errors.ts';

declare module 'fastify' {
  interface Session {
    firstSeenAt?: string;
    csrfToken?: string;
    accountId?: string;
    authVersion?: number;
  }
}
const storeError = (error: unknown) => {
  if (error instanceof ApiError) return error;
  const wrapped = new ApiError(503, 'session-unavailable'),
    code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code))
    Object.defineProperty(wrapped, 'storageCode', { value: code });
  return wrapped;
};

/** Hashed identifiers, real PostgreSQL persistence, and logout tombstones so a
 * late concurrent response cannot recreate a just-revoked session. */
export class PgSessionStore implements SessionStore {
  readonly pool: Pool;
  constructor(pool: Pool) {
    this.pool = pool;
  }
  set(id: string, session: Session, callback: (error?: unknown) => void) {
    void this.persist(id, session).then(
      () => callback(),
      (error) => callback(storeError(error)),
    );
  }
  private async persist(id: string, session: Session) {
    session.firstSeenAt ??= new Date().toISOString();
    const created = new Date(session.firstSeenAt),
      absolute = new Date(created.getTime() + settingNumber('auth.absoluteSeconds') * 1000);
    if (!Number.isFinite(created.getTime()) || absolute.getTime() <= Date.now())
      throw new ApiError(401, 'needs-account');
    const expires = new Date(
      Math.min(Date.now() + settingNumber('auth.idleSeconds') * 1000, absolute.getTime()),
    );
    const data = {
      cookie: JSON.parse(JSON.stringify(session.cookie)),
      firstSeenAt: session.firstSeenAt,
      csrfToken: session.csrfToken,
      accountId: session.accountId,
      authVersion: session.authVersion,
    };
    const client = await this.pool.connect(),
      digest = tokenDigest(id);
    try {
      await client.query('BEGIN');
      // A row lock alone is insufficient after logout deletes the row. Serialize
      // saves and revocation before taking the next statement's MVCC snapshot.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [digest]);
      const result = await client.query(
        `INSERT INTO sessions(digest,account_id,auth_version,data,created_at,expires_at,absolute_expires_at)
   SELECT $1::varchar,$2::uuid,$3::integer,$4::jsonb,$5::timestamptz,$6::timestamptz,$7::timestamptz
   WHERE NOT EXISTS(SELECT 1 FROM revoked_sessions WHERE digest=$1)
    AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM accounts WHERE id=$2 AND status='active' AND auth_version=$3))
   ON CONFLICT(digest) DO UPDATE SET data=EXCLUDED.data,account_id=EXCLUDED.account_id,auth_version=EXCLUDED.auth_version,expires_at=EXCLUDED.expires_at
   WHERE sessions.absolute_expires_at>now() AND NOT EXISTS(SELECT 1 FROM revoked_sessions WHERE digest=$1)`,
        [
          digest,
          session.accountId ?? null,
          session.authVersion ?? null,
          data,
          created,
          expires,
          absolute,
        ],
      );
      if (result.rowCount !== 1) throw new ApiError(401, 'needs-account');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  get(id: string, callback: (error: unknown, session?: Session | null) => void) {
    void this.pool
      .query<{ data: Session }>(
        `SELECT s.data FROM sessions s LEFT JOIN accounts a ON a.id=s.account_id
   WHERE s.digest=$1 AND s.expires_at>now() AND s.absolute_expires_at>now()
    AND s.created_at+($2::int*interval '1 second')>now()
    AND NOT EXISTS(SELECT 1 FROM revoked_sessions WHERE digest=s.digest)
    AND (s.account_id IS NULL OR (a.status='active' AND a.auth_version=s.auth_version))`,
        [tokenDigest(id), settingNumber('auth.absoluteSeconds')],
      )
      .then(
        (result) => callback(null, result.rows[0]?.data ?? null),
        (error) => callback(storeError(error)),
      );
  }
  destroy(id: string, callback: (error?: unknown) => void) {
    void this.revoke(id).then(
      () => callback(),
      (error) => callback(storeError(error)),
    );
  }
  private async revoke(id: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const digest = tokenDigest(id);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [digest]);
      // Overlapping saves finish first and get deleted, or see the tombstone.
      await client.query('SELECT digest FROM sessions WHERE digest=$1 FOR UPDATE', [digest]);
      await client.query(
        `INSERT INTO revoked_sessions(digest,expires_at)
    VALUES($1::varchar,COALESCE((SELECT absolute_expires_at FROM sessions WHERE digest=$1::varchar),now()+INTERVAL '7 days')) ON CONFLICT DO NOTHING`,
        [digest],
      );
      await client.query('DELETE FROM sessions WHERE digest=$1', [digest]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
