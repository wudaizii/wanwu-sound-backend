import type { FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import { exactObject, parseLogin } from '@wanwu-v2/contracts/account';
import type { AuthContext } from '../auth/routes.ts';
import { ApiError } from '../errors.ts';
import { randomToken } from '../security.ts';
import { SettingsError, settingsStore } from './store.ts';

/** The management shell is owned by the backend; no dependency on the H5 build. */
export function settingsRoutes(app: FastifyInstance, { accounts, authenticated }: AuthContext) {
  const admin = async (request: Parameters<AuthContext['authenticated']>[0]) => {
    const actor = await authenticated(request);
    if (actor.role !== 'admin') throw new ApiError(403, 'forbidden');
    return actor;
  };
  const store = () => {
    const value = settingsStore();
    if (!value) throw new ApiError(503, 'not-open');
    return value;
  };
  const etag = (revision: number) => `"settings:${revision}"`;
  const revision = (value: unknown) => {
    if (typeof value !== 'string' || !/^"settings:\d+"$/.test(value))
      throw new ApiError(428, 'precondition-required');
    return Number(value.slice(10, -1));
  };
  for (const [route, file, type] of [
    ['page', 'index.html', 'text/html; charset=utf-8'],
    ['page.js', 'page.js', 'text/javascript; charset=utf-8'],
    ['page.css', 'page.css', 'text/css; charset=utf-8'],
  ] as const) {
    app.get(`/api/v1/admin/settings/${route}`, async (_request, reply) =>
      reply
        .header(
          'Content-Security-Policy',
          "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
        )
        .type(type)
        .send(await readFile(new URL(`ui/${file}`, import.meta.url), 'utf8')),
    );
  }
  // An independent administrative entrance remains usable when business auth is disabled.
  app.get('/api/v1/admin/settings/csrf', async (request) => {
    request.session.csrfToken ??= randomToken();
    return { csrfToken: request.session.csrfToken };
  });
  app.post('/api/v1/admin/settings/login', async (request) => {
    const body = parseLogin(request.body);
    if (!body) throw new ApiError(400, 'invalid-request');
    const actor = await accounts.login(body.username, body.password);
    if (actor.role !== 'admin') throw new ApiError(403, 'forbidden');
    await request.session.regenerate();
    request.session.accountId = actor.id;
    request.session.authVersion = actor.authVersion;
    request.session.csrfToken = randomToken();
    return { csrfToken: request.session.csrfToken };
  });
  app.get('/api/v1/admin/settings', async (request, reply) => {
    await admin(request);
    await store().refresh();
    const view = store().view();
    return reply.header('ETag', etag(view.revision)).send(view);
  });
  app.get('/api/v1/admin/settings/release-plan', async (request) => {
    await admin(request);
    await store().refresh();
    return store().releasePlan();
  });
  const failure = (error: unknown, reply: import('fastify').FastifyReply) => {
    if (!(error instanceof SettingsError)) throw error;
    return reply.code(error.code === 'conflict' ? 412 : error.code === 'invalid' ? 400 : 503).send({
      status: 'error',
      reason:
        error.code === 'conflict'
          ? 'version-conflict'
          : error.code === 'invalid'
            ? 'invalid-request'
            : 'temporarily-unavailable',
      fields: error.fields,
      requestId: reply.request.id,
    });
  };
  app.get('/api/v1/admin/settings/apply-status', async (request) => {
    await admin(request);
    await store().refresh();
    return store().view().controller;
  });
  app.post('/api/v1/admin/settings/apply', async (request, reply) => {
    const actor = await admin(request);
    if (!exactObject(request.body, [])) throw new ApiError(400, 'invalid-request');
    try {
      const result = await store().requestApply(revision(request.headers['if-match']), actor.id);
      return reply.code(202).send(result);
    } catch (error) {
      return failure(error, reply);
    }
  });
  app.patch('/api/v1/admin/settings', async (request, reply) => {
    const actor = await admin(request),
      body = request.body;
    if (
      !exactObject(body, ['changes']) ||
      !body.changes ||
      typeof body.changes !== 'object' ||
      Array.isArray(body.changes) ||
      Object.keys(body.changes).length > 200
    )
      throw new ApiError(400, 'invalid-request');
    try {
      const result = await store().update(
        revision(request.headers['if-match']),
        body.changes as Record<string, unknown>,
        actor.id,
      );
      return reply.header('ETag', etag(result.revision)).send(result);
    } catch (error) {
      return failure(error, reply);
    }
  });
  app.post('/api/v1/admin/settings/restore', async (request, reply) => {
    const actor = await admin(request),
      body = request.body;
    if (!exactObject(body, ['revision']) || !Number.isSafeInteger(body.revision))
      throw new ApiError(400, 'invalid-request');
    try {
      const result = await store().restore(
        revision(request.headers['if-match']),
        Number(body.revision),
        actor.id,
      );
      return reply.header('ETag', etag(result.revision)).send(result);
    } catch (error) {
      return failure(error, reply);
    }
  });
}
