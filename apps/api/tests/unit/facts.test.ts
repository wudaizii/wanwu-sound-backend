import test from 'node:test';
import assert from 'node:assert/strict';
import type { DiscoveryBrief } from '@wanwu-v2/contracts/discovery';
import { acceptDiscoverySet } from '@wanwu-v2/prompts/discovery';
import { checkedDiscovery, consistentDiscovery } from '../../src/guest/factPolicy.ts';
import { boundedBackground } from '../../src/guest/background.ts';
import { calmLullaby } from '../../../../packages/prompts/tests/fixtures/briefs.ts';
import { MemoryCallControl } from '../../src/guest/control.ts';
import { DailyBudget } from '../../src/guest/limits.ts';
import { validateModelEnvironment } from '../../../../deploy/runtime/model-environment.ts';

const brief: DiscoveryBrief = {
  version: 'discovery-brief-v2',
  mode: 'data',
  seconds: 30,
  mood: null,
  background: { kind: 'off', instruments: [], level: null },
  sounds: [
    {
      token: '声音1',
      times: 2,
      spans: [
        [0, 2.4],
        [4.8, 7],
      ],
      chosen: { pitch: null, length: null, loudness: null },
      measured: { pitch: null, length: null, loudnessDb: null },
    },
  ],
  evidence: [
    {
      id: 'E1',
      kind: 'repeat',
      source: 'arrangement',
      sounds: ['声音1'],
      range: [0, 7],
      values: { times: 2 },
    },
  ],
  actions: [
    {
      id: 'A1',
      kind: 'move',
      target: '声音1',
      label: '把后面的声音1往后移',
      occurrence: 2,
      range: [4.8, 7],
    },
  ],
  points: [{ id: 'P1', evidence: ['E1'], action: 'A1' }],
};
const point = {
  point: 'P1',
  action: 'A1',
  evidence: ['E1'],
  knowledge: '结尾的声音又来啦',
  discovery: '「声音1」在乐曲快结束时再次出现，像一个小小的回声。',
  where: '听快结束时再次出现的声音。',
  ask: '你注意到了什么？',
  try: '把后面的「声音1」往后移一点。',
  teacher: {
    concept: '末尾再次响起的声音像在打招呼。',
    how: '和孩子一起找找末尾再次出现的声音。',
    listen: '比较移动前后，哪一次更容易听见。',
  },
};

test('backend rejects the exact false ending repro without editing the frontend-owned shared package', () => {
  const reply = { points: [point] };
  assert.equal(
    acceptDiscoverySet(reply, brief).status,
    'accepted',
    'records the shared-package boundary, not a fixed shared package',
  );
  assert.equal(checkedDiscovery(JSON.stringify(reply), brief).status, 'rejected');
  const actual = structuredClone(brief);
  actual.sounds[0]!.spans[1] = [27.8, 30];
  actual.actions[0]!.range = [27.8, 30];
  actual.evidence[0]!.range = [27.8, 30];
  assert.equal(checkedDiscovery(JSON.stringify(reply), actual).status, 'accepted');
  assert.equal(consistentDiscovery(actual), true);
});
test('cross-field times, referenced tokens and occurrence ranges cannot contradict the brief', () => {
  assert.equal(consistentDiscovery(brief), true);
  for (const change of [
    (b: DiscoveryBrief) => (b.sounds[0]!.times = 9),
    (b: DiscoveryBrief) => (b.actions[0]!.range = [28, 30]),
    (b: DiscoveryBrief) => (b.evidence[0]!.sounds = ['声音2']),
    (b: DiscoveryBrief) => b.sounds[0]!.spans.push([31, 32]),
  ]) {
    const bad = structuredClone(brief);
    change(bad);
    assert.equal(consistentDiscovery(bad), false);
  }
});
test('background input bounds prevent oversized composition loops without replacing child choices', () => {
  assert.equal(boundedBackground(calmLullaby), true);
  assert.equal(boundedBackground({ ...calmLullaby, seconds: 1_000_000 }), false);
  assert.equal(boundedBackground({ ...calmLullaby, instruments: ['not an instrument id'] }), false);
});
test('a busy model slot does not consume a built-in call and BYOK shares concurrency without consuming daily usage', async () => {
  const budget = new DailyBudget(1),
    gate = new MemoryCallControl(budget, 1);
  const provider = {
    baseUrl: 'https://example.com',
    model: 'test',
    apiKey: 'not-a-real-secret',
    builtIn: false,
  };
  let finish!: () => void;
  const first = gate.run(provider, () => new Promise<void>((r) => (finish = r)));
  await assert.rejects(gate.run({ ...provider, builtIn: true }, async () => 1));
  finish();
  await first;
  assert.equal(await gate.run({ ...provider, builtIn: true }, async () => 42), 42);
  await assert.rejects(gate.run({ ...provider, builtIn: true }, async () => 1));
});
test('models env allows only literal model fields and never an auth/database/listener override', () => {
  assert.equal(validateModelEnvironment('# no models\n'), true);
  assert.equal(
    validateModelEnvironment('WANWU_LLM_API_KEY=not-real\nWANWU_GUEST_AI_DAILY_LIMIT=2\n'),
    true,
  );
  for (const bad of [
    'WANWU_DATABASE_URL=secret',
    'WANWU_CLOUD_AUTH_MODE=session',
    'WANWU_LLM_MODEL=${SECRET}',
    'export WANWU_LLM_MODEL=test',
    'WANWU_LLM_MODEL=x\nWANWU_LLM_MODEL=y',
  ])
    assert.throws(() => validateModelEnvironment(bad));
});
