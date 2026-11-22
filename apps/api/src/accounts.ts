import { randomUUID } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { AccountView, AccountStatus } from '@wanwu-v2/contracts/account';
import { loginUsername, validPassword } from '@wanwu-v2/contracts/account';
import { accounts, adminAudit, invitations, passwordResets, sessions } from './db/schema.ts';
import type { Database } from './db/client.ts';
import { settingNumber } from './settings/store.ts';
import { ApiError } from './errors.ts';
import { Passwords, randomToken, tokenDigest } from './security.ts';

type Account = typeof accounts.$inferSelect;
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export const accountView = (row: Account): AccountView => ({
  id: row.id,
  username: row.username,
  nickname: row.nickname,
  role: row.role,
  status: row.status,
});
const invitationView = (row: typeof invitations.$inferSelect) => ({
  id: row.id,
  createdAt: row.createdAt.toISOString(),
  expiresAt: row.expiresAt.toISOString(),
  redeemedAt: row.redeemedAt?.toISOString() ?? null,
  revokedAt: row.revokedAt?.toISOString() ?? null,
});
const audit = (tx: Tx, actorId: string, action: string, targetId: string) =>
  tx.insert(adminAudit).values({ id: randomUUID(), actorId, action, targetId });
const isUnique = (error: unknown): boolean =>
  !!error &&
  typeof error === 'object' &&
  (('code' in error && error.code === '23505') || ('cause' in error && isUnique(error.cause)));
async function admin(tx: Tx, id: string) {
  const [row] = await tx.select().from(accounts).where(eq(accounts.id, id)).for('update');
  if (!row || row.status !== 'active' || row.role !== 'admin') throw new ApiError(403, 'forbidden');
}

export class Accounts {
  readonly db: Database;
  readonly passwords: Passwords;
  constructor(db: Database, passwords: Passwords) {
    this.db = db;
    this.passwords = passwords;
  }
  async authenticated(id: string, version: number) {
    const [row] = await this.db.select().from(accounts).where(eq(accounts.id, id));
    if (!row || row.authVersion !== version) throw new ApiError(401, 'needs-account');
    if (row.status !== 'active') throw new ApiError(403, 'account-disabled');
    return row;
  }
  async register(input: { username: string; password: string; invitationCode: string }) {
    const hash = await this.passwords.hash(input.password);
    try {
      return await this.db.transaction(async (tx) => {
        const id = randomUUID();
        // Keep role/auth_version out of INSERT entirely. The app DB role cannot
        // write the role column, even if a future route accidentally accepts it.
        await tx.execute(sql`INSERT INTO accounts(id,username,nickname,password_hash,status)
    VALUES(${id},${input.username},${input.username},${hash},'active')`);
        const [row] = await tx.select().from(accounts).where(eq(accounts.id, id));
        const redeemed = await tx
          .update(invitations)
          .set({ redeemedBy: row!.id, redeemedAt: new Date() })
          .where(
            and(
              eq(invitations.digest, tokenDigest(input.invitationCode)),
              isNull(invitations.redeemedAt),
              isNull(invitations.revokedAt),
              gt(invitations.expiresAt, new Date()),
            ),
          )
          .returning({ id: invitations.id });
        if (redeemed.length !== 1) throw new ApiError(400, 'invalid-invitation');
        return row!;
      });
    } catch (error) {
      if (isUnique(error)) throw new ApiError(409, 'username-taken');
      throw error;
    }
  }
  async login(username: string, password: string) {
    const [row] = await this.db.select().from(accounts).where(eq(accounts.username, username));
    if (!(await this.passwords.verify(row?.passwordHash ?? null, password)))
      throw new ApiError(401, 'invalid-credentials');
    if (row!.status !== 'active') throw new ApiError(403, 'account-disabled');
    return row!;
  }
  async createInvitation(actorId: string) {
    const code = randomToken(),
      id = randomUUID();
    return this.db.transaction(async (tx) => {
      await admin(tx, actorId);
      const [row] = await tx
        .insert(invitations)
        .values({
          id,
          digest: tokenDigest(code),
          createdBy: actorId,
          expiresAt: new Date(Date.now() + settingNumber('auth.invitationSeconds') * 1000),
        })
        .returning();
      await audit(tx, actorId, 'invitation.created', id);
      return { ...invitationView(row!), code };
    });
  }
  async listInvitations(actorId: string) {
    return this.db.transaction(async (tx) => {
      await admin(tx, actorId);
      return (
        await tx.select().from(invitations).orderBy(desc(invitations.createdAt)).limit(100)
      ).map(invitationView);
    });
  }
  async revokeInvitation(actorId: string, id: string) {
    return this.db.transaction(async (tx) => {
      await admin(tx, actorId);
      const [row] = await tx.select().from(invitations).where(eq(invitations.id, id)).for('update');
      if (!row) throw new ApiError(404, 'not-found');
      if (row.redeemedAt) throw new ApiError(409, 'already-redeemed');
      if (!row.revokedAt) {
        await tx.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, id));
        await audit(tx, actorId, 'invitation.revoked', id);
      }
    });
  }
  async setStatus(actorId: string, id: string, status: AccountStatus) {
    return this.db.transaction(async (tx) => {
      await admin(tx, actorId);
      const [target] = await tx.select().from(accounts).where(eq(accounts.id, id)).for('update');
      if (!target) throw new ApiError(404, 'not-found');
      if (target.role === 'admin') throw new ApiError(403, 'forbidden');
      if (target.status !== status) {
        await tx
          .update(accounts)
          .set({ status, authVersion: sql`${accounts.authVersion}+1`, updatedAt: new Date() })
          .where(eq(accounts.id, id));
        await tx.delete(sessions).where(eq(sessions.accountId, id));
        if (status === 'disabled')
          await tx.execute(
            sql`UPDATE publications SET status='revoked',revoked_at=now(),generation=${randomUUID()} WHERE work_id IN(SELECT id FROM works WHERE owner_id=${id})`,
          );
        await tx
          .update(passwordResets)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(passwordResets.accountId, id),
              isNull(passwordResets.usedAt),
              isNull(passwordResets.revokedAt),
            ),
          );
        await audit(
          tx,
          actorId,
          status === 'disabled' ? 'account.disabled' : 'account.enabled',
          id,
        );
      }
      return accountView({ ...target, status });
    });
  }
  async issueReset(actorId: string, id: string) {
    const token = randomToken(),
      expiresAt = new Date(Date.now() + settingNumber('auth.resetSeconds') * 1000);
    return this.db.transaction(async (tx) => {
      await admin(tx, actorId);
      const [target] = await tx.select().from(accounts).where(eq(accounts.id, id)).for('update');
      if (!target) throw new ApiError(404, 'not-found');
      if (target.status !== 'active') throw new ApiError(403, 'account-disabled');
      await tx
        .update(passwordResets)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(passwordResets.accountId, id),
            isNull(passwordResets.usedAt),
            isNull(passwordResets.revokedAt),
          ),
        );
      await tx.insert(passwordResets).values({
        id: randomUUID(),
        accountId: id,
        createdBy: actorId,
        digest: tokenDigest(token),
        expiresAt,
      });
      await audit(tx, actorId, 'password-reset.issued', id);
      return { token, expiresAt: expiresAt.toISOString() };
    });
  }
  async resetPassword(token: string, password: string) {
    const hash = await this.passwords.hash(password);
    await this.db.transaction(async (tx) => {
      const [reset] = await tx
        .select()
        .from(passwordResets)
        .where(eq(passwordResets.digest, tokenDigest(token)));
      if (!reset) throw new ApiError(400, 'invalid-reset-token');
      const [target] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, reset.accountId))
        .for('update');
      if (!target || target.status !== 'active') throw new ApiError(400, 'invalid-reset-token');
      const used = await tx
        .update(passwordResets)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(passwordResets.id, reset.id),
            isNull(passwordResets.usedAt),
            isNull(passwordResets.revokedAt),
            gt(passwordResets.expiresAt, new Date()),
          ),
        )
        .returning({ id: passwordResets.id });
      if (used.length !== 1) throw new ApiError(400, 'invalid-reset-token');
      await tx
        .update(accounts)
        .set({
          passwordHash: hash,
          authVersion: sql`${accounts.authVersion}+1`,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, target.id));
      await tx.delete(sessions).where(eq(sessions.accountId, target.id));
      await audit(tx, target.id, 'password-reset.used', target.id);
    });
  }
  async changePassword(target: Account, oldPassword: string, password: string) {
    if (!(await this.passwords.verify(target.passwordHash, oldPassword)))
      throw new ApiError(401, 'invalid-credentials');
    const hash = await this.passwords.hash(password);
    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, target.id))
        .for('update');
      if (!current || current.status !== 'active' || current.authVersion !== target.authVersion)
        throw new ApiError(401, 'needs-account');
      await tx
        .update(accounts)
        .set({
          passwordHash: hash,
          authVersion: sql`${accounts.authVersion}+1`,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, target.id));
      await tx.delete(sessions).where(eq(sessions.accountId, target.id));
      await tx
        .update(passwordResets)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(passwordResets.accountId, target.id),
            isNull(passwordResets.usedAt),
            isNull(passwordResets.revokedAt),
          ),
        );
      await audit(tx, target.id, 'password.changed', target.id);
    });
  }
}

/** Only called by the protected deployment CLI / test seed, never an HTTP route. */
export async function firstAdmin(
  db: Database,
  passwords: Passwords,
  username: string,
  password: string,
) {
  const clean = loginUsername(username);
  if (!clean || !validPassword(password)) throw new ApiError(400, 'invalid-request');
  const passwordHash = await passwords.hash(password);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(728091,2)`);
    if (
      (
        await tx
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.role, 'admin'))
          .limit(1)
      ).length
    )
      throw new ApiError(409, 'admin-already-exists');
    const [row] = await tx
      .insert(accounts)
      .values({
        id: randomUUID(),
        username: clean,
        nickname: clean,
        role: 'admin',
        status: 'active',
        passwordHash,
      })
      .returning();
    await audit(tx, row!.id, 'admin.bootstrap', row!.id);
    return accountView(row!);
  });
}
