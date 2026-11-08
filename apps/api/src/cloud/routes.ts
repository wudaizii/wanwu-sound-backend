import type { FastifyInstance, FastifyRequest } from 'fastify';
import { cloudId, uuid, workEtag } from '@wanwu-v2/contracts/cloud';
import { exactObject } from '@wanwu-v2/contracts/account';
import type { Actor, CloudContext } from './context.ts';
import { Sources } from './sources.ts';
import { Works } from './works.ts';
import { Library } from './library.ts';
import { Shares } from './shares.ts';
import { ContentAdmin } from './admin.ts';
import { ApiError } from '../errors.ts';
import { resourceLimits, resourceUsage } from './quotas.ts';
import { transaction } from '../db/transaction.ts';
import { lockActor } from './context.ts';

type Params = { id: string };
type Query = { state?: string; owner?: string; scope?: string; cursor?: string; revision?: string };
export function cloudRoutes(
  app: FastifyInstance,
  context: CloudContext,
  authenticated: (request: FastifyRequest) => Promise<Actor>,
) {
  const sources = new Sources(context),
    works = new Works(context),
    library = new Library(context, sources),
    shares = new Shares(context),
    admin = new ContentAdmin(context);
  const actor = async (request: FastifyRequest) => {
      const resolved = await authenticated(request),
        expected = request.headers['if-account-match'];
      // A precondition against cross-tab account switching, never an authentication source.
      if (expected !== undefined && expected !== resolved.id)
        throw new ApiError(409, 'account-changed');
      return resolved;
    },
    workId = (id: string) => {
      if (!cloudId(id, 'work')) throw new ApiError(400, 'invalid-request');
      return id;
    };
  const entryId = (id: string) => {
    if (!uuid(id)) throw new ApiError(400, 'invalid-request');
    return id;
  };
  app.get('/api/v1/account/usage', async (request) => {
    const user = await actor(request);
    return transaction(context.pool, async (tx) => {
      await lockActor(tx, user);
      const { globalPending: _global, ...usage } = await resourceUsage(tx, user.id);
      return { ...usage, limits: resourceLimits(), accounting: 'conservative-reservations' };
    });
  });
  const version = (value: unknown) => {
    if (value === undefined) return null;
    if (
      typeof value !== 'string' ||
      !/^\d+$/.test(value) ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) < 1
    )
      throw new ApiError(400, 'invalid-request');
    return Number(value);
  };
  const limited = {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: 10 * 60_000,
        keyGenerator: (request: FastifyRequest) => request.session.accountId ?? request.ip,
      },
    },
  };
  app.post('/api/v1/works', async (request, reply) => {
    const work = await works.create(await actor(request), request.body);
    reply.header('ETag', workEtag(work.id, work.revision));
    return reply.code(201).send(work);
  });
  app.get<{ Querystring: Query }>('/api/v1/works', async (request) => {
    const query = request.query;
    if (
      (query.owner !== undefined && query.owner !== 'me') ||
      !['draft', 'saved'].includes(query.state ?? 'draft')
    )
      throw new ApiError(400, 'invalid-request');
    return works.list(
      await actor(request),
      query.state === 'saved' ? 'saved' : 'draft',
      query.cursor ?? null,
    );
  });
  app.get<{ Params: Params; Querystring: Query }>('/api/v1/works/:id', async (request, reply) => {
    const work = await works.get(
      await actor(request),
      workId(request.params.id),
      version(request.query.revision),
    );
    reply.header('ETag', workEtag(work.id, work.revision));
    return work;
  });
  app.get<{ Params: Params; Querystring: Query }>(
    '/api/v1/works/:id/facts',
    async (request, reply) => {
      const { work, facts } = await works.facts(
        await actor(request),
        workId(request.params.id),
        version(request.query.revision),
      );
      reply.header('ETag', workEtag(work.id, work.revision));
      return facts;
    },
  );
  for (const kind of ['arrangement', 'compose-settings'] as const)
    app.put<{ Params: Params }>(`/api/v1/works/:id/${kind}`, async (request, reply) => {
      const work = await works.edit(
        await actor(request),
        workId(request.params.id),
        kind,
        request.body,
        request.headers['if-match'],
      );
      reply.header('ETag', workEtag(work.id, work.revision));
      return work;
    });
  app.patch<{ Params: Params }>('/api/v1/works/:id', async (request, reply) => {
    const work = await works.edit(
      await actor(request),
      workId(request.params.id),
      'title',
      request.body,
      request.headers['if-match'],
    );
    reply.header('ETag', workEtag(work.id, work.revision));
    return work;
  });
  app.put<{ Params: Params }>(
    '/api/v1/works/:id',
    { ...limited, bodyLimit: 1024 * 1024 },
    async (request, reply) => {
      const result = await works.save(
        await actor(request),
        workId(request.params.id),
        request.body,
        request.headers['if-match'],
      );
      reply.header('ETag', workEtag(result.work.id, result.work.revision));
      return reply.code(202).send(result);
    },
  );
  app.delete<{ Params: Params }>('/api/v1/works/:id', async (request, reply) => {
    await works.remove(
      await actor(request),
      workId(request.params.id),
      request.headers['if-match'],
    );
    return reply.code(204).send();
  });
  app.get<{ Params: Params; Querystring: Query }>('/api/v1/works/:id/render', async (request) =>
    works.render(await actor(request), workId(request.params.id), version(request.query.revision)),
  );
  app.post<{ Params: Params }>('/api/v1/works/:id/render', limited, async (request, reply) => {
    const body = request.body;
    if (!exactObject(body, ['revision']) || !Number.isSafeInteger(body.revision))
      throw new ApiError(400, 'invalid-request');
    return reply
      .code(202)
      .send(
        await works.render(
          await actor(request),
          workId(request.params.id),
          version(String(body.revision)),
          true,
        ),
      );
  });
  app.put<{ Params: Params }>('/api/v1/sources/:id', limited, async (request) =>
    sources.intent(await actor(request), request.params.id, request.body),
  );
  app.post<{ Params: Params }>('/api/v1/sources/:id/complete', limited, async (request, reply) => {
    if (!exactObject(request.body, ['uploadId']) || !uuid(request.body.uploadId))
      throw new ApiError(400, 'invalid-request');
    return reply
      .code(202)
      .send(await sources.complete(await actor(request), request.params.id, request.body.uploadId));
  });
  app.get<{ Params: Params }>('/api/v1/sources/:id', async (request) =>
    sources.get(await actor(request), request.params.id),
  );
  for (const [route, kind] of [
    ['sources', 'source'],
    ['sound-units', 'sound-unit'],
  ] as const)
    app.get<{ Querystring: Query }>(`/api/v1/${route}`, async (request) => {
      if (!['mine', 'teachers'].includes(request.query.scope ?? 'mine'))
        throw new ApiError(400, 'invalid-request');
      return library.list(
        await actor(request),
        kind,
        request.query.scope === 'teachers' ? 'teachers' : 'mine',
        request.query.cursor ?? null,
      );
    });
  app.post('/api/v1/library/entries', async (request, reply) =>
    reply.code(201).send(await library.create(await actor(request), request.body)),
  );
  app.patch<{ Params: Params }>('/api/v1/library/entries/:id', async (request) =>
    library.edit(await actor(request), entryId(request.params.id), request.body),
  );
  app.delete<{ Params: Params }>('/api/v1/library/entries/:id', async (request, reply) => {
    await library.remove(await actor(request), entryId(request.params.id));
    return reply.code(204).send();
  });
  app.post<{ Params: Params }>('/api/v1/works/:id/share', async (request, reply) => {
    const result = await shares.publish(
      await actor(request),
      workId(request.params.id),
      request.body,
    );
    return reply.code(result.status === 'pending-render' ? 202 : 201).send(result);
  });
  app.get<{ Params: Params }>('/api/v1/works/:id/share', async (request) =>
    shares.get(await actor(request), workId(request.params.id)),
  );
  app.delete<{ Params: Params }>('/api/v1/works/:id/share', async (request, reply) => {
    await shares.revoke(await actor(request), workId(request.params.id));
    return reply.code(204).send();
  });
  app.get<{ Params: { token: string } }>(
    '/api/v1/shares/:token',
    { config: { rateLimit: { max: 60, timeWindow: 60_000 } } },
    async (request) => shares.publicView(request.params.token),
  );
  app.get<{ Querystring: Query }>('/api/v1/admin/accounts', async (request) =>
    admin.accounts(await actor(request), request.query.cursor ?? null),
  );
  app.get('/api/v1/admin/status', async (request) => admin.status(await actor(request)));
  app.post<{ Params: Params }>('/api/v1/admin/sources/:id/disable', async (request, reply) => {
    await admin.disableSource(await actor(request), request.params.id);
    return reply.code(204).send();
  });
  app.post<{ Params: Params }>(
    '/api/v1/admin/library/entries/:id/disable',
    async (request, reply) => {
      await admin.disableEntry(await actor(request), entryId(request.params.id));
      return reply.code(204).send();
    },
  );
  app.delete<{ Params: Params }>('/api/v1/admin/works/:id/share', async (request, reply) => {
    await shares.revoke(await actor(request), workId(request.params.id), true);
    return reply.code(204).send();
  });
  return { sources, works, library, shares, admin };
}
