// The API process: framework settings, session, the hooks every request passes (https, Origin + CSRF on writes) and
// error bodies. Each area's routes live in its own module and are mounted below, one line each.
import Fastify, { LogController } from 'fastify';
import type { FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { Accounts } from './accounts.ts';
import type { ApiConfig } from './config.ts';
import { SESSION_IDLE_MS } from './config.ts';
import type { openDatabase } from './db/client.ts';
import { ApiError } from './errors.ts';
import { Passwords, randomToken, sameToken } from './security.ts';
import { PgSessionStore } from './session-store.ts';
import { COOKIE_NAME, clearSessionCookie } from './auth/cookie.ts';
import { authRoutes, limitAttemptsByName } from './auth/routes.ts';
import type { Authenticated } from './auth/routes.ts';
import { adminRoutes } from './admin/routes.ts';
import { cloudRoutes } from './cloud/routes.ts';
import type { CloudContext } from './cloud/context.ts';
import { guestRoutes } from './guest/routes.ts';
import type { GuestContext } from './guest/routes.ts';
import { PgBackgroundJobs } from './guest/pgJobs.ts';
import { buildIdentity } from './version.ts';

/** Status and reason for an error: ours carry both; the framework's own (rate limit, body size, schema) are named. */
function errorOutcome(error: unknown) {
  if (error instanceof ApiError) return { status: error.status, reason: error.reason };
  const known = error as { statusCode?: number; validation?: unknown };
  if (known.statusCode === 429) return { status: 429, reason: 'rate-limited' } as const;
  if (known.statusCode === 413) return { status: 413, reason: 'too-large' } as const;
  if (known.validation || known.statusCode === 400)
    return { status: 400, reason: 'invalid-request' } as const;
  return { status: 500, reason: 'internal-error' } as const;
}

export async function buildApp(
  config: ApiConfig,
  database: ReturnType<typeof openDatabase>,
  logging = false,
  cloud?: CloudContext,
  guest?: GuestContext,
) {
  const app = Fastify({
    logger: logging
      ? {
          redact: [
            'req.headers.cookie',
            'req.headers.authorization',
            'req.headers["x-wanwu-model-config"]',
            'res.headers["set-cookie"]',
          ],
        }
      : false,
    logController: new LogController({ disableRequestLogging: true }),
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    bodyLimit: 256 * 1024,
    trustProxy: config.trustedProxyAddresses.length ? config.trustedProxyAddresses : false,
    requestTimeout: 20_000,
  });
  const passwords = new Passwords();
  await passwords.ready();
  const accounts = new Accounts(database.db, passwords),
    store = new PgSessionStore(database.pool);
  await app.register(cookie);
  await app.register(session, {
    secret: config.sessionSecret,
    store,
    cookieName: COOKIE_NAME,
    saveUninitialized: false,
    rolling: true,
    idGenerator: () => randomToken(),
    cookie: { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: SESSION_IDLE_MS },
  });
  await app.register(rateLimit, {
    global: false,
    hook: 'preHandler',
    cache: 10_000,
    errorResponseBuilder: () => ({ reason: 'rate-limited' }),
  });
  app.setErrorHandler((error, request, reply) => {
    const { status, reason } = errorOutcome(error);
    if (reason === 'needs-account' || reason === 'session-unavailable') {
      // The plugin itself also sets session=null on destroy; its public types
      // omit that state. Prevent a failed rolling save from repeating onSend.
      Reflect.set(request, 'session', null);
      clearSessionCookie(reply);
    }
    if (status === 429 && !reply.hasHeader('Retry-After'))
      reply.header('Retry-After', String(error instanceof ApiError ? (error.retryAfter ?? 1) : 1));
    if (status >= 500)
      request.log.error(
        {
          requestId: request.id,
          reason,
          storageCode: (error as { storageCode?: string }).storageCode,
        },
        'Wanwu request failed',
      );
    return reply.code(status).send({ status: 'error', reason, requestId: request.id });
  });
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({ status: 'error', reason: 'not-found', requestId: request.id }),
  );
  app.addHook('onRequest', async (request, reply) => {
    reply
      .header('Cache-Control', 'no-store')
      .header('Referrer-Policy', 'no-referrer')
      .header('X-Content-Type-Options', 'nosniff');
    if (['/api/v1/health', '/api/v1/version'].includes(request.url.split('?')[0]!)) return;
    if (config.cloudAuthMode !== 'session') throw new ApiError(503, 'not-open');
    if (request.protocol !== 'https') throw new ApiError(400, 'https-required');
  });
  app.addHook('preHandler', async (request) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (
        request.headers.origin !== config.origin ||
        !sameToken(request.headers['x-csrf-token'], request.session.csrfToken)
      )
        throw new ApiError(403, 'csrf-failed');
    }
  });
  /** The signed-in account, checked against the database on every request (a disabled account or new password ends it). */
  const authenticated: Authenticated = async (request: FastifyRequest) => {
    const { accountId, authVersion } = request.session;
    if (!accountId || !Number.isInteger(authVersion)) throw new ApiError(401, 'needs-account');
    return accounts.authenticated(accountId, authVersion!);
  };
  app.get('/api/v1/health', async () => {
    await database.db.execute(sql`SELECT 1`);
    return { status: 'ok' };
  });
  app.get('/api/v1/version', async () => buildIdentity());
  authRoutes(app, { accounts, authenticated });
  adminRoutes(app, { config, accounts, authenticated });
  limitAttemptsByName(app);
  if (cloud) cloudRoutes(app, cloud, authenticated);
  if (guest) guestRoutes(app, guest);
  if (guest?.jobs instanceof PgBackgroundJobs)
    app.addHook('onClose', () =>
      guest.jobs instanceof PgBackgroundJobs ? guest.jobs.close() : Promise.resolve(),
    );
  await app.ready();
  return app;
}
