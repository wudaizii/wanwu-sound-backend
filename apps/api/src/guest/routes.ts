// 游客 AI: every route of the module, mounted by one line in app.ts. Visitors need no account; the app's existing
// hooks still require https, the exact Origin and the session CSRF token (from GET /auth/csrf) on every POST, so other
// sites cannot spend this budget through a visitor's browser. Facts and numbers come from the page's anonymous briefs;
// the model only rewords, chooses or writes a motif, and @wanwu-v2/prompts checks every reply as the page would.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { PgBoss } from 'pg-boss';
import { exactObject } from '@wanwu-v2/contracts/account';
import { MOODS } from '@wanwu-v2/contracts/arrangement';
import { AI_BACKGROUND_STEPS, isBackgroundBrief } from '@wanwu-v2/contracts/background';
import type { AiBackgroundStep } from '@wanwu-v2/contracts/background';
import {
  isTextbookTalk,
  isTextbookTalkBrief,
  isWorkTalkBrief,
  isWorkTalkReply,
} from '@wanwu-v2/contracts/talk';
import { isDiscoveryBrief } from '@wanwu-v2/contracts/discovery';
import { buildDiscovery, buildDiscoveryRepair } from '@wanwu-v2/prompts/tasks';
import { checkedDiscovery, consistentDiscovery } from './factPolicy.ts';
import {
  buildMoodWords,
  buildTextbookFeatures,
  buildTextbookTalk,
  buildWorkTalk,
  isTextbookFeaturesBrief,
  readMoodWords,
  readReply,
  readTextbookFeatures,
  readTextbookTalk,
  readWorkTalk,
} from '@wanwu-v2/prompts/tasks';
import type { BuiltPrompt } from '@wanwu-v2/prompts/tasks';
import { ApiError } from '../errors.ts';
import type { GuestConfig, Provider } from './config.ts';
import { BackgroundJobs } from './jobs.ts';
import type { JobStore } from './jobs.ts';
import { MemoryCallControl, PgCallControl } from './control.ts';
import type { CallControl } from './control.ts';
import { PgBackgroundJobs } from './pgJobs.ts';
import { runBackground, boundedBackground } from './background.ts';
import { DailyBudget, GUEST_RATE_LIMIT } from './limits.ts';
import { GuestFailure, postJson } from './net.ts';
import type { Post } from './net.ts';
import { OVERRIDE_HEADER, parseOverride } from './override.ts';
import { chat } from './providers/language.ts';
import { DISCOVERY_RULES } from '@wanwu-v2/sound-rules/discovery';
import { observeDiscovery } from './discovery.ts';
import { chatWithAudio } from './providers/audio.ts';

/**
 * Server waits a little less than the page (talk 10 s, AI composing 20 s per model, AI audio 60 s), so the page hears
 * why. Mood words are short; talk rewords up to nine facts and takes qwen3.8-flash 4–6 s (measured 2026-10-30) while the
 * corpus shows; a composition plan is longer and asks the model to think.
 */
export const GUEST_TIMEOUT_MS = {
  mood: 5_500,
  talk: 9_500,
  compose: 19_000,
  audio: 55_000,
  listen: 7_500,
  features: 4_500,
  discovery: 17_000,
} as const;
// Listening, text generation and one optional repair share the configured total budget.
const DISCOVERY_BUDGET_MS = DISCOVERY_RULES.analysis.budgetMs;
const DISCOVERY_REPAIR_MIN_MS = DISCOVERY_RULES.analysis.repairMinMs;
/** A teaching-music excerpt: about 30 s of low-bitrate mono mp3 (≈ 180 KB); the request may carry up to 1.2 MB of base64. */
const EXCERPT_MAX_CHARS = 1_200_000;
export type GuestContext = {
  config: GuestConfig;
  post: Post;
  budget: DailyBudget;
  jobs: JobStore;
  control: CallControl;
  durable: boolean;
};
export function guestContext(
  config: GuestConfig,
  post: Post = postJson,
  database?: { pool: Pool; boss: PgBoss },
): GuestContext {
  if (process.env.NODE_ENV === 'production' && !database)
    throw new Error('Production AI requires PostgreSQL controls');
  const budget = new DailyBudget(config.dailyLimit);
  const control = database
    ? new PgCallControl(database.pool, config.dailyLimit)
    : new MemoryCallControl(budget);
  const jobs = database
    ? new PgBackgroundJobs(database.pool, database.boss, config, (task) =>
        runBackground(task, post, control),
      )
    : new BackgroundJobs();
  return { config, post, budget, jobs, control, durable: !!database };
}

export function guestRoutes(app: FastifyInstance, context: GuestContext) {
  const providers = (request: FastifyRequest) => {
    const override = parseOverride(request.headers[OVERRIDE_HEADER]);
    if (override === 'invalid') throw new ApiError(400, 'invalid-request');
    return {
      language: override?.language ?? context.config.language,
      music: override?.music ?? context.config.music,
    };
  };
  const owner = (request: FastifyRequest) => {
    const session = request.session?.sessionId;
    if (!session && context.durable) throw new ApiError(503, 'temporarily-unavailable');
    return session ? createHash('sha256').update(session).digest('hex') : 'local-preview';
  };
  const outcome = (
    request: FastifyRequest,
    task: string,
    started: number,
    result: string,
    provider: Provider | null,
  ) =>
    request.log.info(
      {
        task,
        result,
        ms: Date.now() - started,
        model: provider?.builtIn ? provider.model : provider ? 'visitor' : null,
        requestId: request.id,
      },
      'Wanwu guest AI',
    );

  /** A text task: language model → reply text. Failures become the error bodies the page already reads. */
  const text = async (
    request: FastifyRequest,
    task: string,
    built: (provider: Provider) => BuiltPrompt,
    timeoutMs: number = GUEST_TIMEOUT_MS.talk,
  ) => {
    const started = Date.now(),
      { language } = providers(request);
    if (!language) {
      outcome(request, task, started, 'not-open', null);
      throw new ApiError(503, 'not-open');
    }
    const prompt = built(language);
    try {
      const reply = await context.control.run(language, () =>
        chat(context.post, language, prompt, timeoutMs),
      );
      outcome(request, task, started, 'ok', language);
      return { reply, model: language.model, promptVersion: prompt.version };
    } catch (error) {
      const reason = error instanceof GuestFailure ? error.reason : 'failed';
      outcome(request, task, started, reason, language);
      if (reason === 'quota') throw new ApiError(429, 'rate-limited', 60);
      if (reason === 'timeout') throw new ApiError(504, 'temporarily-unavailable');
      throw new ApiError(502, 'failed');
    }
  };

  // Which built-in models are set up, so the page shows the AI choices only when they can work (a visitor's own
  // settings open a kind on the page side too). No secrets, no model names.
  app.get(
    '/api/v1/guest/status',
    { config: { rateLimit: { max: 60, timeWindow: 60_000 } } },
    async () => ({
      language: !!context.config.language,
      music: false, // The audio-generation adapter is not implemented; configuration is not capability.
      audio: !!context.config.audio,
    }),
  );

  app.post('/api/v1/moods/interpret', GUEST_RATE_LIMIT, async (request) => {
    const body = request.body as { text?: unknown };
    if (!exactObject(body, ['text']) || typeof body.text !== 'string')
      throw new ApiError(400, 'invalid-request');
    const clean = body.text.trim(),
      length = [...clean].length;
    if (length < 1 || length > 12) throw new ApiError(400, 'invalid-request');
    const { reply, model, promptVersion } = await text(
      request,
      'mood-words',
      () => buildMoodWords({ text: clean }),
      GUEST_TIMEOUT_MS.mood,
    );
    const nearest = readMoodWords(reply).acceptance.value?.nearest ?? null;
    return { nearest: MOODS.includes(nearest as never) ? nearest : null, model, promptVersion };
  });

  app.post('/api/v1/talk/work', GUEST_RATE_LIMIT, async (request) => {
    const brief = request.body;
    if (!isWorkTalkBrief(brief)) throw new ApiError(400, 'invalid-request');
    const { reply, model, promptVersion } = await text(request, 'work-talk', () =>
      buildWorkTalk(brief),
    );
    // Protocol shape (WorkTalkReply + model + promptVersion): the page runs the same acceptance again line by line.
    const value = readReply(reply).value;
    if (readWorkTalk(reply, brief).acceptance.status === 'rejected' || !isWorkTalkReply(value))
      throw new ApiError(502, 'failed');
    return {
      lines: value.lines.map(({ kind, line }) => ({ kind, line })),
      tryThis: value.tryThis,
      model,
      promptVersion,
    };
  });

  app.post('/api/v1/talk/textbook', GUEST_RATE_LIMIT, async (request) => {
    const brief = request.body;
    if (!isTextbookTalkBrief(brief)) throw new ApiError(400, 'invalid-request');
    const { reply, model, promptVersion } = await text(request, 'textbook-talk', () =>
      buildTextbookTalk(brief),
    );
    const value = readReply(reply).value;
    if (readTextbookTalk(reply, brief).acceptance.status === 'rejected' || !isTextbookTalk(value))
      throw new ApiError(502, 'failed');
    return {
      feature: value.feature,
      meeting: value.meeting,
      task: value.task,
      model,
      promptVersion,
    };
  });

  // Actual mix → validated listening observations → independent text task → per-entry acceptance.
  app.post(
    '/api/v1/discovery/work',
    { ...GUEST_RATE_LIMIT, bodyLimit: 5_200_000 },
    async (request) => {
      const incoming = request.body;
      if (!isDiscoveryBrief(incoming) || !consistentDiscovery(incoming))
        throw new ApiError(400, 'invalid-request');
      const started = Date.now();
      providers(request);
      // Reserve the text phase even when listening fails; audio is not stored or logged.
      const listener = context.config.audio;
      let observed;
      try {
        observed = await observeDiscovery(
          incoming,
          context.post,
          incoming.audio ? listener : null,
          context.control,
        );
      } catch {
        throw new ApiError(400, 'invalid-request');
      }
      const brief = observed.brief;
      request.log.info(
        {
          task: 'music-discovery-listen',
          result: observed.status,
          ms: Date.now() - started,
          requestId: request.id,
        },
        'Wanwu listening',
      );
      const first = await text(
        request,
        'music-discovery',
        () => buildDiscovery(brief),
        DISCOVERY_RULES.analysis.textMs,
      );
      let acceptance = checkedDiscovery(first.reply, brief);
      const left = DISCOVERY_BUDGET_MS - (Date.now() - started);
      if (acceptance.notes.length && left >= DISCOVERY_REPAIR_MIN_MS) {
        try {
          const again = await text(
            request,
            'music-discovery-repair',
            () => buildDiscoveryRepair(brief, first.reply, acceptance.notes),
            left,
          );
          const repaired = checkedDiscovery(again.reply, brief);
          if (repaired.set) {
            const kept = acceptance.set?.points ?? [];
            const extra = repaired.set.points.filter(
              (point) => !kept.some((item) => item.point === point.point),
            );
            acceptance = {
              ...repaired,
              set: { ...repaired.set, points: [...kept, ...extra].slice(0, 3) },
            };
          }
        } catch {
          /* the repair failed: the page keeps its local set */
        }
      }
      // Whether the set passed and why not (tokens and rule words only: no names, recordings or keys).
      request.log.info(
        {
          task: 'music-discovery-check',
          accepted: acceptance.set?.points.length ?? 0,
          notes: acceptance.notes,
          requestId: request.id,
        },
        'Wanwu guest AI set',
      );
      if (!acceptance.set) throw new ApiError(502, 'failed');
      return {
        set: acceptance.set,
        rejected: acceptance.notes.length,
        observations: brief.observations,
        mode: brief.mode,
        model: first.model,
        promptVersion: first.promptVersion,
      };
    },
  );

  // 课本特征卡: the page measured the recording; the audio model hears the excerpt (when sent and set up), else the language
  // model reads only the numbers. Both answers pass the same checks; when neither gives one, the page keeps the
  // program's own result (this answers 502/503 and the page knows why). Server total stays under the page's 15 s.
  app.post(
    '/api/v1/textbook/features',
    { ...GUEST_RATE_LIMIT, bodyLimit: EXCERPT_MAX_CHARS + 64 * 1024 },
    async (request) => {
      const body = request.body as { brief?: unknown; audio?: unknown };
      if (
        !body ||
        typeof body !== 'object' ||
        Object.keys(body).some((key) => key !== 'brief' && key !== 'audio') ||
        !isTextbookFeaturesBrief(body.brief)
      )
        throw new ApiError(400, 'invalid-request');
      const audio =
        body.audio === undefined
          ? null
          : typeof body.audio === 'string' &&
              body.audio.length <= EXCERPT_MAX_CHARS &&
              /^[A-Za-z0-9+/=]+$/.test(body.audio)
            ? body.audio
            : 'bad';
      if (audio === 'bad') throw new ApiError(400, 'invalid-request');
      const brief = body.brief,
        started = Date.now(),
        { language } = providers(request),
        listener = context.config.audio;
      // Each try is asked and checked with its own brief: the language model hears nothing (listenSeconds 0), so its rhythm,
      // metre and tempo are not taken — only its mood and words.
      const tries: {
        source: 'audio' | 'language';
        provider: Provider;
        brief: typeof brief;
        run: (provider: Provider) => Promise<string>;
        prompt: ReturnType<typeof buildTextbookFeatures>;
      }[] = [];
      if (audio && listener) {
        const prompt = buildTextbookFeatures(brief);
        tries.push({
          source: 'audio',
          provider: listener,
          brief,
          prompt,
          run: (provider) =>
            chatWithAudio(context.post, provider, prompt, audio, GUEST_TIMEOUT_MS.listen),
        });
      }
      if (language) {
        const numbers = { ...brief, listenSeconds: 0 },
          prompt = buildTextbookFeatures(numbers);
        tries.push({
          source: 'language',
          provider: language,
          brief: numbers,
          prompt,
          run: (provider) => chat(context.post, provider, prompt, GUEST_TIMEOUT_MS.features),
        });
      }
      if (!tries.length) {
        outcome(request, 'textbook-features', started, 'not-open', null);
        throw new ApiError(503, 'not-open');
      }
      for (const attempt of tries) {
        try {
          const read = readTextbookFeatures(
            await context.control.run(attempt.provider, () => attempt.run(attempt.provider)),
            attempt.brief,
          );
          if (read.acceptance.value) {
            outcome(
              request,
              `textbook-features:${attempt.source}`,
              started,
              read.acceptance.status,
              attempt.provider,
            );
            // `checked`: accepted as answered, or partly (some of it replaced by the program's own measurement) — the page says so.
            return {
              ...read.acceptance.value,
              checked: read.acceptance.status,
              source: attempt.source,
              model: attempt.provider.builtIn ? attempt.provider.model : 'visitor',
              promptVersion: attempt.prompt.version,
            };
          }
          outcome(
            request,
            `textbook-features:${attempt.source}`,
            started,
            'rejected',
            attempt.provider,
          );
        } catch (error) {
          outcome(
            request,
            `textbook-features:${attempt.source}`,
            started,
            error instanceof GuestFailure ? error.reason : 'failed',
            attempt.provider,
          );
        }
      }
      throw new ApiError(502, 'failed');
    },
  );

  app.post('/api/v1/backgrounds', GUEST_RATE_LIMIT, async (request, reply) => {
    const body = request.body as { step?: unknown; brief?: unknown };
    if (
      !exactObject(body, ['brief', 'step']) ||
      !AI_BACKGROUND_STEPS.includes(body.step as AiBackgroundStep) ||
      !isBackgroundBrief(body.brief) ||
      !boundedBackground(body.brief)
    )
      throw new ApiError(400, 'invalid-request');
    const step = body.step as AiBackgroundStep,
      brief = body.brief,
      started = Date.now(),
      { language, music } = providers(request);
    const task = {
      owner: owner(request),
      step,
      brief,
      provider: step === 'audio-ai' ? music : step === 'voice-ai' ? context.config.audio : language,
    };
    const jobId = await context.jobs.start(async () => {
      const result = await runBackground(task, context.post, context.control);
      outcome(
        request,
        step,
        started,
        result.status === 'ready' ? 'ok' : result.reason,
        step === 'audio-ai' ? music : step === 'voice-ai' ? context.config.audio : language,
      );
      return result;
    }, task);
    if (!jobId) throw new ApiError(503, 'busy');
    return reply.code(202).send({ jobId });
  });

  app.get<{ Params: { jobId: string } }>('/api/v1/backgrounds/:jobId', async (request) => {
    if (!/^[a-f0-9-]{36}$/.test(request.params.jobId)) throw new ApiError(400, 'invalid-request');
    const state = await context.jobs.get(request.params.jobId, owner(request));
    if (!state) throw new ApiError(404, 'not-found');
    return state;
  });
}
