// 账号: CSRF token, register, login, me, logout, password change and reset, mounted by one line in app.ts. The app's
// hooks already require https, the exact Origin and the CSRF token on every write; the session itself is the plugin's.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  exactObject,
  parseLogin,
  parseRegistration,
  validPassword,
} from '@wanwu-v2/contracts/account';
import { accountView } from '../accounts.ts';
import type { Accounts } from '../accounts.ts';
import { ApiError } from '../errors.ts';
import { randomToken, tokenDigest } from '../security.ts';
import { clearSessionCookie } from './cookie.ts';
import { settingNumber } from '../settings/store.ts';
import { WindowLimiter } from '../settings/rate.ts';

export type Account = Awaited<ReturnType<Accounts['authenticated']>>;
export type Authenticated = (request: FastifyRequest) => Promise<Account>;
export type AuthContext = { accounts: Accounts; authenticated: Authenticated };

/** Reset tokens are 32 random bytes in base64url. */
const token = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
/** Routes that take a password or a reset token: limited per address here and per name in limitAttemptsByName. */
export const sensitive = {};
const passwordAllowed = (value: unknown): value is string =>
  validPassword(value) &&
  [...value].length >= settingNumber('auth.passwordMin') &&
  [...value].length <= settingNumber('auth.passwordMax');

export function authRoutes(app: FastifyInstance, { accounts, authenticated }: AuthContext) {
  const establish = async (
    request: FastifyRequest,
    account: Awaited<ReturnType<Accounts['login']>>,
  ) => {
    await request.session.regenerate();
    request.session.accountId = account.id;
    request.session.authVersion = account.authVersion;
    // Let the plugin's onSend persist the changed session before setting its
    // cookie. An early save emits both a clearing and replacement cookie.
    request.session.csrfToken = randomToken();
    return { account: accountView(account), csrfToken: request.session.csrfToken };
  };
  app.get('/api/v1/auth/csrf', {}, async (request) => {
    request.session.csrfToken ??= randomToken();
    return { csrfToken: request.session.csrfToken };
  });
  app.post('/api/v1/auth/register', sensitive, async (request, reply) => {
    const body = parseRegistration(request.body);
    if (!body || !passwordAllowed(body.password)) throw new ApiError(400, 'invalid-request');
    return reply.code(201).send(await establish(request, await accounts.register(body)));
  });
  app.post('/api/v1/auth/login', sensitive, async (request) => {
    const body = parseLogin(request.body);
    if (!body) throw new ApiError(400, 'invalid-request');
    return establish(request, await accounts.login(body.username, body.password));
  });
  app.get('/api/v1/auth/me', async (request) => ({
    account: accountView(await authenticated(request)),
  }));
  app.post('/api/v1/auth/logout', async (request, reply) => {
    await authenticated(request);
    await request.session.destroy();
    clearSessionCookie(reply);
    return reply.code(204).send();
  });
  app.post('/api/v1/auth/change-password', sensitive, async (request, reply) => {
    const target = await authenticated(request),
      body = request.body;
    if (
      !exactObject(body, ['oldPassword', 'password']) ||
      typeof body.oldPassword !== 'string' ||
      body.oldPassword.length > 512 ||
      !passwordAllowed(body.password)
    )
      throw new ApiError(400, 'invalid-request');
    await accounts.changePassword(target, body.oldPassword, body.password);
    await request.session.destroy();
    clearSessionCookie(reply);
    return reply.code(204).send();
  });
  app.post('/api/v1/auth/reset-password', sensitive, async (request, reply) => {
    const body = request.body;
    if (
      !exactObject(body, ['token', 'password']) ||
      !token(body.token) ||
      !passwordAllowed(body.password)
    )
      throw new ApiError(400, 'invalid-request');
    await accounts.resetPassword(body.token, body.password);
    await request.session.destroy();
    clearSessionCookie(reply);
    return reply.code(204).send();
  });
}

const NAME_LIMITED = [
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/reset-password',
  '/api/v1/admin/settings/login',
];
/**
 * Ten tries per username (or reset token) in ten minutes. The username limiter is independent of the remote address
 * and does not trust forwarded identity headers. Keys are hashed rather than logged names.
 */
export function limitAttemptsByName(app: FastifyInstance) {
  const attempts = new WindowLimiter(),
    addresses = new WindowLimiter();
  app.addHook('preHandler', async (request) => {
    const path = request.url.split('?')[0]!;
    if (
      request.method === 'GET' &&
      ['/api/v1/auth/csrf', '/api/v1/admin/settings/csrf'].includes(path)
    ) {
      addresses.take(
        `csrf:${request.ip}`,
        settingNumber('auth.csrfRateMax'),
        settingNumber('auth.csrfWindowSeconds'),
      );
      return;
    }
    if (![...NAME_LIMITED, '/api/v1/auth/change-password'].includes(path)) return;
    const seconds = settingNumber('auth.rateWindowSeconds');
    addresses.take(`${path}:${request.ip}`, settingNumber('auth.rateMax'), seconds);
    if (!NAME_LIMITED.includes(path)) return;
    const body = request.body as Record<string, unknown> | undefined;
    const key = tokenDigest(String(body?.username ?? body?.token ?? 'invalid').toLowerCase());
    attempts.take(key, settingNumber('auth.nameRateMax'), seconds);
  });
}
