import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { BACKGROUND_COMPOSE_PROMPT } from '@wanwu-v2/prompts/tasks';
import { parseBackgroundResult } from '@wanwu-v2/contracts/background';
import type { DiscoveryBrief } from '@wanwu-v2/contracts/discovery';
import { candidatePoints, localSet } from '@wanwu-v2/prompts/discovery';
import type { BackgroundBrief } from '@wanwu-v2/contracts/background';
import { ApiError } from '../../src/errors.ts';
import { readGuestConfig } from '../../src/guest/config.ts';
import type { GuestConfig } from '../../src/guest/config.ts';
import { DailyBudget } from '../../src/guest/limits.ts';
import { GuestFailure, postJson, publicAddress } from '../../src/guest/net.ts';
import type { Post } from '../../src/guest/net.ts';
import { OVERRIDE_HEADER, parseOverride } from '../../src/guest/override.ts';
import { guestContext, guestRoutes } from '../../src/guest/routes.ts';
import {
  PERSONAL_NAMES,
  calmLullaby,
  textbookBrief,
  workBrief,
} from '../../../../packages/prompts/tests/fixtures/briefs.ts';

const key = 'sk-test-not-a-real-key-123456';
const language = {
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: 'qwen3.8-flash',
  apiKey: key,
  builtIn: true,
};
const audio = { ...language, model: 'qwen3.8-omni-flash' };
const config: GuestConfig = { language, music: null, audio, dailyLimit: 100 };
/** A composer's plan a good model might send (the program repairs whatever does not suit the piece). */
const plan = {
  tempo: 70,
  metre: 3,
  mode: 'major',
  tonicShift: 1,
  progressions: ['1-4-1-5'],
  pattern: 'block',
  bass: 'hold',
  drums: 'none',
  motif: { degrees: [0, 2, 1, 4], beats: [1, 1, 1, 2] },
  answer: 'mirror',
  style: 'lullaby',
  sections: [
    { density: 'sparse', register: 'mid', dynamics: 'soft' },
    { density: 'medium', register: 'high', dynamics: 'medium' },
    { density: 'sparse', register: 'mid', dynamics: 'soft' },
    { density: 'medium', register: 'low', dynamics: 'medium' },
  ],
};
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64');

type Call = {
  url: string;
  headers: Record<string, string>;
  body: { model: string; messages: { content: any }[]; enable_thinking?: boolean };
};
/** A fake chat/completions service: answers each task with what a good model would send. */
function fakeModel(answer: (prompt: string) => unknown, calls: Call[] = []): Post {
  return async (url, headers, body) => {
    const call = { url, headers, body } as Call;
    calls.push(call);
    // Audio requests carry [input_audio, text] parts; the fake reads their text.
    const text = (content: unknown) =>
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map((part) => part?.text ?? '').join('\n')
          : '';
    const prompt = call.body.messages.map((message) => text(message.content)).join('\n'),
      value = answer(prompt);
    if (value instanceof GuestFailure) throw value;
    if (typeof value === 'number') return { status: value, json: null };
    return {
      status: 200,
      json: {
        choices: [
          { message: { content: typeof value === 'string' ? value : JSON.stringify(value) } },
        ],
      },
    };
  };
}
const good = (prompt: string) =>
  prompt.includes('作曲方案')
    ? plan
    : prompt.includes('feature')
      ? {
          feature: '《摇篮曲》是三拍子，嗒— 嗒，像摇篮轻轻晃。',
          meeting: '「声音1」和重拍碰在一起。',
          task: '跟着拍手试一试。',
        }
      : prompt.includes('tryThis')
        ? {
            lines: workBrief.facts.map((fact) => ({
              kind: fact.kind,
              line: '这里听起来很有意思。',
            })),
            tryThis: '再听一遍试试。',
          }
        : { nearest: 'calm' };

async function app(post: Post, options: Partial<GuestConfig> = {}) {
  const server = Fastify();
  await server.register(rateLimit, { global: false });
  server.setErrorHandler((error, _request, reply) =>
    error instanceof ApiError
      ? reply.code(error.status).send({ status: 'error', reason: error.reason })
      : reply
          .code((error as { statusCode?: number }).statusCode ?? 500)
          .send({ status: 'error', reason: 'internal-error' }),
  );
  const context = guestContext({ ...config, ...options }, post);
  guestRoutes(server, context);
  await server.ready();
  return { server, context };
}
async function background(
  server: Awaited<ReturnType<typeof app>>['server'],
  step: string,
  brief: BackgroundBrief = calmLullaby,
  headers: Record<string, string> = {},
) {
  const start = await server.inject({
    method: 'POST',
    url: '/api/v1/backgrounds',
    payload: { step, brief },
    headers,
  });
  assert.equal(start.statusCode, 202);
  const { jobId } = start.json() as { jobId: string };
  for (let i = 0; i < 50; i++) {
    const state = (
      await server.inject({ method: 'GET', url: `/api/v1/backgrounds/${jobId}` })
    ).json() as { status: string };
    if (state.status !== 'pending') return state;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('job did not finish');
}

test('only public addresses are allowed for model calls', () => {
  for (const ip of [
    '127.0.0.1',
    '10.1.2.3',
    '172.22.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.100.100.200',
    '198.18.0.5',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])
    assert.equal(publicAddress(ip), false, ip);
  for (const ip of ['8.130.95.57', '47.96.1.1', '2400:3200::1'])
    assert.equal(publicAddress(ip), true, ip);
  assert.equal(publicAddress('dashscope.aliyuncs.com'), false);
});

test('the real client refuses plain http, private literals and names that resolve to this machine', async () => {
  for (const url of [
    'http://example.com/v1',
    'https://127.0.0.1:9/x',
    'https://[::1]:9/x',
    'https://localhost:9/x',
  ])
    await assert.rejects(
      postJson(url, {}, {}, 2000),
      (error: unknown) => error instanceof GuestFailure && error.reason === 'failed',
      url,
    );
});

test('mapped IPv6 stays private after URL normalization and cannot reach the transport', async () => {
  for (const literal of [
    '::ffff:127.0.0.1',
    '::ffff:169.254.169.254',
    '::ffff:10.0.0.1',
    '0:0:0:0:0:ffff:ac10:1',
    '::ffff:192.168.1.1',
    '::ffff:100.100.100.200',
  ]) {
    const url = new URL(`https://[${literal}]/v1`);
    assert.equal(publicAddress(url.hostname.slice(1, -1)), false, literal);
    assert.equal(
      parseOverride(
        encode({
          language: {
            baseUrl: url.href,
            model: 'test',
            apiKey: key,
          },
        }),
      ),
      'invalid',
    );
    await assert.rejects(postJson(url.href, {}, {}, 100), GuestFailure);
  }
  for (const literal of [
    '::',
    '2001:db8::1',
    'ff02::1',
    '64:ff9b::a00:1',
    '2002:7f00:1::',
    'fe80::1%eth0',
    '192.0.2.1',
    '203.0.113.1',
  ])
    assert.equal(publicAddress(literal), false, literal);
  assert.equal(publicAddress('::ffff:8.8.8.8'), true);
  assert.equal(publicAddress('2606:4700:4700::1111'), true);
});

test('built-in settings come from their own variables; the music model may stay empty', () => {
  assert.deepEqual(readGuestConfig({}), {
    language: null,
    music: null,
    audio: null,
    dailyLimit: 2000,
  });
  const read = readGuestConfig({
    WANWU_LLM_BASE_URL: language.baseUrl + '/',
    WANWU_LLM_MODEL: 'qwen3.8-flash',
    WANWU_LLM_API_KEY: key,
    WANWU_GUEST_AI_DAILY_LIMIT: '50',
  });
  assert.equal(read.language?.baseUrl, language.baseUrl);
  assert.equal(read.music, null);
  assert.equal(read.audio, null);
  assert.equal(read.dailyLimit, 50);
  assert.equal(
    readGuestConfig({
      WANWU_LLM_BASE_URL: language.baseUrl,
      WANWU_LLM_MODEL: 'qwen3.8-flash',
      WANWU_LLM_API_KEY: key,
      WANWU_AUDIO_MODEL: 'qwen3.8-omni-flash',
    }).audio?.model,
    'qwen3.8-omni-flash',
  );
  assert.throws(() => readGuestConfig({ WANWU_AUDIO_MODEL: 'qwen3.8-omni-flash' }), /WANWU_LLM/);
  assert.throws(() =>
    readGuestConfig({
      WANWU_LLM_BASE_URL: 'http://example.com/v1',
      WANWU_LLM_MODEL: 'm',
      WANWU_LLM_API_KEY: key,
    }),
  );
  assert.throws(() => readGuestConfig({ WANWU_LLM_MODEL: 'qwen3.8-flash' }));
  assert.throws(() => readGuestConfig({ WANWU_MUSIC_PROVIDER: 'other' }));
});

test('a visitor override replaces only the kinds it names and refuses anything not exactly right', () => {
  const own = { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: key };
  const parsed = parseOverride(encode({ language: own }));
  assert.ok(parsed && parsed !== 'invalid');
  assert.equal(parsed.language?.builtIn, false);
  assert.equal(parsed.music, undefined);
  assert.equal(parseOverride(undefined), null);
  for (const bad of [
    { language: { ...own, baseUrl: 'http://api.deepseek.com/v1' } },
    { language: { ...own, baseUrl: 'https://127.0.0.1/v1' } },
    { language: { ...own, baseUrl: 'https://localhost/v1' } },
    { language: { ...own, baseUrl: 'https://[::1]/v1' } },
    { language: { ...own, baseUrl: 'https://user:pw@api.deepseek.com/v1' } },
    { language: { ...own, extra: 1 } },
    { other: own },
    {},
    { language: { ...own, apiKey: 'short' } },
  ])
    assert.equal(parseOverride(encode(bad)), 'invalid', JSON.stringify(bad));
  assert.equal(parseOverride('not base64!'), 'invalid');
});

test('the daily budget resets at midnight in Asia/Shanghai', () => {
  let now = new Date('2026-10-30T15:59:00Z');
  const budget = new DailyBudget(2, () => now);
  assert.equal(budget.take(), true);
  assert.equal(budget.take(), true);
  assert.equal(budget.take(), false);
  assert.equal(budget.retryAfter(), 60);
  now = new Date('2026-10-30T16:00:01Z');
  assert.equal(budget.take(), true);
});

test('status says which built-in models are set up, nothing more', async () => {
  const { server } = await app(fakeModel(good));
  assert.deepEqual((await server.inject({ method: 'GET', url: '/api/v1/guest/status' })).json(), {
    language: true,
    music: false,
    audio: true,
  });
  const closed = await app(fakeModel(good), { language: null, audio: null });
  assert.deepEqual(
    (await closed.server.inject({ method: 'GET', url: '/api/v1/guest/status' })).json(),
    { language: false, music: false, audio: false },
  );
});

test('mood words: the model only chooses a preset, thinking is off on 百炼, the key never leaves the auth header', async () => {
  const calls: Call[] = [];
  const { server } = await app(fakeModel(good, calls));
  const reply = await server.inject({
    method: 'POST',
    url: '/api/v1/moods/interpret',
    payload: { text: ' 有点想睡觉 ' },
  });
  assert.equal(reply.statusCode, 200);
  assert.deepEqual(reply.json(), {
    nearest: 'calm',
    model: 'qwen3.8-flash',
    promptVersion: 'mood-words-prompt-v1',
  });
  assert.equal(calls[0]!.url, `${language.baseUrl}/chat/completions`);
  assert.equal(calls[0]!.body.enable_thinking, false);
  assert.equal(calls[0]!.headers.authorization, `Bearer ${key}`);
  assert.equal(JSON.stringify(calls[0]!.body).includes(key), false);
  for (const text of ['', '一二三四五六七八九十一二三', 3])
    assert.equal(
      (await server.inject({ method: 'POST', url: '/api/v1/moods/interpret', payload: { text } }))
        .statusCode,
      400,
    );
  const odd = await app(fakeModel(() => ({ nearest: 'sleepy' })));
  assert.equal(
    (
      await odd.server.inject({
        method: 'POST',
        url: '/api/v1/moods/interpret',
        payload: { text: '困' },
      })
    ).json().nearest,
    null,
  );
});

test('talk: replies in the protocol shape for the page to check again; unusable replies fail', async () => {
  const calls: Call[] = [];
  const { server } = await app(fakeModel(good, calls));
  const work = await server.inject({
    method: 'POST',
    url: '/api/v1/talk/work',
    payload: workBrief,
  });
  assert.equal(work.statusCode, 200);
  const body = work.json() as {
    lines: { kind: string; line: string }[];
    tryThis: string;
    promptVersion: string;
  };
  assert.equal(body.lines.length, workBrief.facts.length);
  assert.equal(body.lines[0]!.kind, workBrief.facts[0]!.kind);
  assert.equal(body.promptVersion, 'work-talk-prompt-v1');
  for (const name of PERSONAL_NAMES)
    assert.equal(JSON.stringify(calls).includes(name), false, 'names never reach the model');
  const textbook = await server.inject({
    method: 'POST',
    url: '/api/v1/talk/textbook',
    payload: textbookBrief,
  });
  assert.equal(textbook.statusCode, 200);
  assert.ok('feature' in (textbook.json() as object));
  const bad = await app(fakeModel(() => '这不是 JSON'));
  assert.equal(
    (await bad.server.inject({ method: 'POST', url: '/api/v1/talk/work', payload: workBrief }))
      .statusCode,
    502,
  );
  assert.equal(
    (
      await bad.server.inject({
        method: 'POST',
        url: '/api/v1/talk/textbook',
        payload: textbookBrief,
      })
    ).statusCode,
    502,
  );
  assert.equal(
    (
      await server.inject({
        method: 'POST',
        url: '/api/v1/talk/work',
        payload: { ...workBrief, facts: [] },
      })
    ).statusCode,
    400,
  );
});

test('failures become the reasons the page already handles', async () => {
  const closed = await app(fakeModel(good), { language: null });
  assert.equal(
    (
      await closed.server.inject({
        method: 'POST',
        url: '/api/v1/moods/interpret',
        payload: { text: '开心' },
      })
    ).json().reason,
    'not-open',
  );
  const slow = await app(fakeModel(() => new GuestFailure('timeout')));
  assert.equal(
    (
      await slow.server.inject({
        method: 'POST',
        url: '/api/v1/moods/interpret',
        payload: { text: '开心' },
      })
    ).statusCode,
    504,
  );
  const limited = await app(fakeModel(() => 429));
  assert.equal(
    (
      await limited.server.inject({
        method: 'POST',
        url: '/api/v1/moods/interpret',
        payload: { text: '开心' },
      })
    ).statusCode,
    429,
  );
  const broken = await app(fakeModel(() => 500));
  assert.equal(
    (
      await broken.server.inject({
        method: 'POST',
        url: '/api/v1/moods/interpret',
        payload: { text: '开心' },
      })
    ).statusCode,
    502,
  );
  const spent = await app(fakeModel(good), { dailyLimit: 1 });
  assert.equal(
    (
      await spent.server.inject({
        method: 'POST',
        url: '/api/v1/moods/interpret',
        payload: { text: '开心' },
      })
    ).statusCode,
    200,
  );
  const over = await spent.server.inject({
    method: 'POST',
    url: '/api/v1/moods/interpret',
    payload: { text: '开心' },
  });
  assert.equal(over.statusCode, 429);
  assert.ok(Number(over.headers['retry-after']) > 0 || over.json().reason === 'rate-limited');
  assert.equal(
    (
      await spent.server.inject({
        method: 'POST',
        url: '/api/v1/moods/interpret',
        payload: { text: '开心' },
        headers: { [OVERRIDE_HEADER]: '%%%' },
      })
    ).statusCode,
    400,
  );
});

test('a visitor override is used for its kind and does not spend the built-in budget', async () => {
  const calls: Call[] = [];
  const { server } = await app(fakeModel(good, calls), { dailyLimit: 0 });
  const own = { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: key };
  const reply = await server.inject({
    method: 'POST',
    url: '/api/v1/moods/interpret',
    payload: { text: '开心' },
    headers: { [OVERRIDE_HEADER]: encode({ language: own }) },
  });
  assert.equal(reply.statusCode, 200);
  assert.equal(calls[0]!.url, 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(calls[0]!.body.model, 'deepseek-chat');
  assert.equal('enable_thinking' in calls[0]!.body, false);
});

test('background jobs: the voice model, then the text model compose a plan the program writes out; failures fall through', async () => {
  const calls: Call[] = [];
  const { server } = await app(fakeModel(good, calls));
  for (const [step, model] of [
    ['voice-ai', 'qwen3.8-omni-flash'],
    ['notes-ai', 'qwen3.8-flash'],
  ] as const) {
    const ready = (await background(server, step)) as {
      status: string;
      source: string;
      notes: { part: string }[];
      plan: unknown;
      promptVersion: string;
    };
    assert.equal(ready.status, 'ready', step);
    assert.equal(ready.source, step);
    assert.ok(parseBackgroundResult(ready, calmLullaby.seconds), `${step} result is valid`);
    assert.equal(ready.promptVersion, BACKGROUND_COMPOSE_PROMPT.version);
    assert.ok(
      new Set(ready.notes.map((note) => note.part)).size >= 3,
      'all parts written, not only a melody',
    );
    const call = calls.at(-1)!;
    assert.equal(call.body.model, model);
    assert.equal(typeof call.body.messages.at(-1)!.content, 'string', 'words only, no audio');
    assert.match(call.body.messages[0]!.content, /作曲家/);
  }
  assert.deepEqual(await background(server, 'audio-ai'), {
    status: 'unavailable',
    reason: 'not-open',
  });
  const noVoice = await app(fakeModel(good), { audio: null });
  assert.deepEqual(await background(noVoice.server, 'voice-ai'), {
    status: 'unavailable',
    reason: 'not-open',
  });
  const bad = await app(fakeModel(() => 'a melody, not a plan'));
  assert.deepEqual(await background(bad.server, 'notes-ai'), {
    status: 'unavailable',
    reason: 'failed',
  });
  const slow = await app(fakeModel(() => new GuestFailure('timeout')));
  assert.deepEqual(await background(slow.server, 'voice-ai'), {
    status: 'unavailable',
    reason: 'timeout',
  });
  for (const step of ['local-rules', 'program'])
    assert.equal(
      (
        await server.inject({
          method: 'POST',
          url: '/api/v1/backgrounds',
          payload: { step, brief: calmLullaby },
        })
      ).statusCode,
      400,
      step,
    );
  assert.equal(
    (
      await server.inject({
        method: 'POST',
        url: '/api/v1/backgrounds',
        payload: { step: 'notes-ai', brief: { ...calmLullaby, version: 'background-request-v1' } },
      })
    ).statusCode,
    400,
    'old briefs are refused',
  );
  assert.equal(
    (
      await server.inject({
        method: 'GET',
        url: '/api/v1/backgrounds/00000000-0000-0000-0000-000000000000',
      })
    ).statusCode,
    404,
  );
});

const featuresBrief = {
  title: '小鸟在唱歌',
  listenSeconds: 30,
  tempoBpm: 96,
  meter: 2,
  meterConfidence: 0.29,
  mode: 'major',
  onsetDensity: 'medium',
  brightness: 'mid',
  candidates: [
    { cell: [0.5, 0.5, 0.5, 0.5], bars: 51 },
    { cell: [0.5, 0.5, 1], bars: 4 },
  ],
  fallbackCell: [0.5, 0.5, 0.25, 0.75],
  others: [],
};
const featuresReply = {
  rhythmCell: [0.5, 0.5, 1],
  meter: 2,
  tempo: 'same',
  mood: 'lively',
  childLine: '像小鸟蹦蹦跳跳',
  teacherNote: '先两下快的再一下长的，带孩子拍手念“小鸟—叫”。',
};
const checkedOf = (reply: { json(): unknown }) =>
  reply.json() as {
    source: string;
    checked: string;
    rhythmCell: number[];
    meter: number;
    tempoBpm: number;
  };
const isAudio = (call: Call) => Array.isArray(call.body.messages.at(-1)!.content);

test('textbook features: the audio model hears the excerpt; its checked answer comes back', async () => {
  const calls: Call[] = [];
  const { server } = await app(fakeModel(() => featuresReply, calls));
  const reply = await server.inject({
    method: 'POST',
    url: '/api/v1/textbook/features',
    payload: { brief: featuresBrief, audio: Buffer.from('fake mp3').toString('base64') },
  });
  assert.equal(reply.statusCode, 200);
  const body = reply.json() as {
    rhythmCell: number[];
    source: string;
    model: string;
    childLine: string;
    tempoBpm: number;
    promptVersion: string;
  };
  assert.deepEqual(body.rhythmCell, [0.5, 0.5, 1]);
  assert.equal(body.source, 'audio');
  assert.equal(body.model, 'qwen3.8-omni-flash');
  assert.equal(body.tempoBpm, 96);
  assert.equal(body.promptVersion, 'textbook-features-prompt-v4');
  assert.equal(checkedOf(reply).checked, 'accepted');
  assert.equal(calls.length, 1);
  assert.ok(isAudio(calls[0]!));
  assert.equal(
    (calls[0]!.body as unknown as { reasoning_effort: string }).reasoning_effort,
    'none',
  );
  const sent = (call: Call) =>
    (call.body.messages.at(-1)!.content as unknown as { input_audio?: { format: string } }[])[0]!
      .input_audio!.format;
  assert.equal(sent(calls[0]!), 'mp3');
  // The page sends a WAV excerpt (RIFF header): it goes to the model as WAV.
  await server.inject({
    method: 'POST',
    url: '/api/v1/textbook/features',
    payload: { brief: featuresBrief, audio: Buffer.from('RIFF....WAVEfmt ').toString('base64') },
  });
  assert.equal(sent(calls[1]!), 'wav');
});

test('textbook features: no excerpt, or the audio model failing, falls to the language model with numbers only; neither → 502', async () => {
  const calls: Call[] = [];
  const { server } = await app(fakeModel(() => featuresReply, calls));
  const numbersOnly = (
    await server.inject({
      method: 'POST',
      url: '/api/v1/textbook/features',
      payload: { brief: featuresBrief },
    })
  ).json() as { source: string };
  assert.equal(numbersOnly.source, 'language');
  assert.equal(isAudio(calls[0]!), false);
  assert.ok(calls[0]!.body.messages.at(-1)!.content.includes('没有附音频'));
  // The language model heard nothing: its rhythm, metre and tempo are not taken, only its mood and words.
  const guessing = await app(
    fakeModel(() => ({ ...featuresReply, rhythmCell: [1, 1, 1], meter: 3, tempo: 'half' })),
  );
  const guessed = checkedOf(
    await guessing.server.inject({
      method: 'POST',
      url: '/api/v1/textbook/features',
      payload: { brief: featuresBrief },
    }),
  );
  assert.deepEqual(
    [guessed.source, guessed.meter, guessed.tempoBpm, guessed.rhythmCell],
    ['language', 2, 96, [0.5, 0.5, 0.25, 0.75]],
  );
  const deaf = await app(
    fakeModel((prompt) =>
      prompt.includes('附带的这段音频') ? new GuestFailure('timeout') : featuresReply,
    ),
  );
  assert.equal(
    (
      (
        await deaf.server.inject({
          method: 'POST',
          url: '/api/v1/textbook/features',
          payload: { brief: featuresBrief, audio: 'AAAA' },
        })
      ).json() as { source: string }
    ).source,
    'language',
  );
  const broken = await app(fakeModel(() => '不知道'));
  assert.equal(
    (
      await broken.server.inject({
        method: 'POST',
        url: '/api/v1/textbook/features',
        payload: { brief: featuresBrief, audio: 'AAAA' },
      })
    ).statusCode,
    502,
  );
  const closed = await app(fakeModel(good), { language: null, audio: null });
  assert.equal(
    (
      await closed.server.inject({
        method: 'POST',
        url: '/api/v1/textbook/features',
        payload: { brief: featuresBrief },
      })
    ).statusCode,
    503,
  );
  for (const payload of [
    { brief: { ...featuresBrief, meter: 7 } },
    { brief: featuresBrief, audio: 'not base64!' },
    { brief: featuresBrief, audio: 'A'.repeat(1_300_000) },
    { brief: featuresBrief, extra: 1 },
  ])
    assert.equal(
      (await server.inject({ method: 'POST', url: '/api/v1/textbook/features', payload }))
        .statusCode,
      payload.audio?.length === 1_300_000 ? 413 : 400,
    );
});

// ----- 音乐小发现 -----
const discoveryEvidence: DiscoveryBrief['evidence'] = [
  {
    id: 'E1',
    kind: 'repeat',
    source: 'arrangement',
    sounds: ['声音1'],
    range: [1, 9],
    values: { sound: '声音1', times: 2 },
  },
  {
    id: 'E2',
    kind: 'return',
    source: 'arrangement',
    sounds: ['声音1', '声音2'],
    range: [1, 9],
    values: { a: '声音1', b: '声音2' },
  },
];
const discoveryActions: DiscoveryBrief['actions'] = [
  { id: 'replay', kind: 'replay', target: null, label: '从头再听一遍' },
  { id: 'remove-1', kind: 'remove', target: '声音1', label: '拿走一次「声音1」' },
];
const discoveryBrief: DiscoveryBrief = {
  version: 'discovery-brief-v2',
  mode: 'data',
  seconds: 30,
  mood: null,
  background: { kind: 'plain', instruments: [], level: 'medium' },
  sounds: [
    {
      token: '声音1',
      times: 2,
      spans: [
        [1, 2],
        [8, 9],
      ],
      chosen: { pitch: 'high', length: null, loudness: null },
      measured: { pitch: null, length: null, loudnessDb: null },
    },
    {
      token: '声音2',
      times: 1,
      spans: [[4, 6]],
      chosen: { pitch: null, length: null, loudness: null },
      measured: { pitch: 'low', length: 'long', loudnessDb: -30 },
    },
  ],
  evidence: discoveryEvidence,
  actions: discoveryActions,
  points: candidatePoints(discoveryEvidence, discoveryActions),
};
/** A set that passes (written with the same rules as the page's local set). */
const goodSet = localSet(discoveryBrief.points, discoveryEvidence, discoveryActions);

test('discovery route never returns early events described as the end, even after model repair', async () => {
  const calls: Call[] = [];
  const wrong = structuredClone(goodSet);
  for (const point of wrong.points) {
    point.where = '听乐曲快结束时的声音。';
    point.discovery = '「声音1」在结尾再次出现。';
  }
  const { server } = await app(fakeModel(() => wrong, calls));
  const response = await server.inject({
    method: 'POST',
    url: '/api/v1/discovery/work',
    payload: discoveryBrief,
  });
  assert.equal(response.statusCode, 502);
  assert.equal(calls.length, 2, 'one bounded repair, never unlimited retries or invented facts');
});

test('discovery: partial entries survive and one targeted repair can recover the failed entry', async () => {
  const calls: Call[] = [];
  const broken = structuredClone(goodSet);
  broken.points[0]!.discovery = '我听到背景在唱';
  const { server } = await app(
    fakeModel((prompt) => (prompt.includes('仅修复') ? goodSet : broken), calls),
  );
  const reply = await server.inject({
    method: 'POST',
    url: '/api/v1/discovery/work',
    payload: discoveryBrief,
  });
  assert.equal(reply.statusCode, 200);
  assert.equal(reply.json().set.points.length, goodSet.points.length);
  assert.equal(reply.json().promptVersion, 'music-discovery-prompt-v3');
  assert.equal(calls.length, 2);
  const partial = await app(fakeModel(() => broken));
  const result = await partial.server.inject({
    method: 'POST',
    url: '/api/v1/discovery/work',
    payload: discoveryBrief,
  });
  assert.equal(result.statusCode, 200, 'a rejected entry does not discard its neighbours');
  assert.equal(result.json().set.points.length, goodSet.points.length - 1);
  const invalid = structuredClone(goodSet);
  for (const point of invalid.points) point.action = 'invented';
  const bad = await app(fakeModel(() => invalid));
  assert.equal(
    (
      await bad.server.inject({
        method: 'POST',
        url: '/api/v1/discovery/work',
        payload: discoveryBrief,
      })
    ).statusCode,
    502,
  );
  const closed = await app(
    fakeModel(() => goodSet),
    { language: null },
  );
  assert.equal(
    (
      await closed.server.inject({
        method: 'POST',
        url: '/api/v1/discovery/work',
        payload: discoveryBrief,
      })
    ).json().reason,
    'not-open',
  );
});

test('discovery: actual mix observations precede text; audio failure still produces data-based entries', async () => {
  const { pcm16Wave } = await import('@wanwu-v2/audio-engine/pcm');
  const audio = Buffer.from(pcm16Wave([new Float32Array(8000 * 30)], 8000)).toString('base64');
  const observation = {
    id: 'O1',
    range: [2, 6],
    layer: 'background',
    observation: '短旋律重复',
    basis: '相邻两次听到同一短句',
    keywords: ['重复'],
  };
  const calls: Call[] = [];
  const { server } = await app(
    fakeModel(
      (prompt) => (prompt.includes('输出最多8项') ? { observations: [observation] } : goodSet),
      calls,
    ),
  );
  const response = await server.inject({
    method: 'POST',
    url: '/api/v1/discovery/work',
    payload: { ...discoveryBrief, mode: 'audio', audio },
  });
  assert.equal(response.statusCode, 200);
  assert.ok(isAudio(calls[0]!));
  assert.equal(isAudio(calls[1]!), false);
  assert.ok(String(calls[1]!.body.messages.at(-1)!.content).includes('相邻两次听到同一短句'));
  assert.equal(response.json().mode, 'audio');
  assert.equal(response.json().observations.length, 1);
  const deafCalls: Call[] = [];
  const deaf = await app(
    fakeModel(
      (prompt) => (prompt.includes('输出最多8项') ? new GuestFailure('timeout') : goodSet),
      deafCalls,
    ),
  );
  const fallback = await deaf.server.inject({
    method: 'POST',
    url: '/api/v1/discovery/work',
    payload: { ...discoveryBrief, mode: 'audio', audio },
  });
  assert.equal(fallback.statusCode, 200);
  assert.equal(fallback.json().mode, 'data');
  assert.deepEqual(fallback.json().observations, []);
  const forged = await server.inject({
    method: 'POST',
    url: '/api/v1/discovery/work',
    payload: { ...discoveryBrief, observations: [observation] },
  });
  assert.deepEqual(
    forged.json().observations,
    [],
    'browser-supplied model observations are discarded',
  );
  const wrongLength = Buffer.from(pcm16Wave([new Float32Array(8000)], 8000)).toString('base64');
  assert.equal(
    (
      await server.inject({
        method: 'POST',
        url: '/api/v1/discovery/work',
        payload: { ...discoveryBrief, audio: wrongLength },
      })
    ).statusCode,
    400,
  );
});
