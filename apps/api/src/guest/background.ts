import { parseBackgroundResult } from '@wanwu-v2/contracts/background';
import type {
  AiBackgroundStep,
  BackgroundBrief,
  BackgroundResult,
} from '@wanwu-v2/contracts/background';
import { buildBackgroundCompose, readBackgroundCompose } from '@wanwu-v2/prompts/tasks';
import { composeNotes } from '@wanwu-v2/sound-rules/ai-compose';
import type { Provider } from './config.ts';
import type { CallControl } from './control.ts';
import { GuestFailure } from './net.ts';
import type { Post } from './net.ts';
import { chat } from './providers/language.ts';
import { chatVoice } from './providers/audio.ts';
import { generateAudio } from './providers/music.ts';

export type BackgroundTask = {
  owner: string;
  step: AiBackgroundStep;
  brief: BackgroundBrief;
  provider: Provider | null;
};
export function boundedBackground(brief: BackgroundBrief) {
  return (
    brief.seconds <= 90 &&
    brief.workId.length <= 128 &&
    brief.instruments.length <= 6 &&
    brief.instruments.every((id) => /^[A-Za-z0-9:_-]{1,64}$/.test(id)) &&
    Object.values(brief.rules).every(
      (value) => typeof value === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(value),
    ) &&
    brief.sounds.every((s) => s.start >= 0 && s.end > s.start && s.end <= brief.seconds + 1e-6)
  );
}
export async function runBackground(
  task: BackgroundTask,
  post: Post,
  control: CallControl,
): Promise<BackgroundResult> {
  const { step, brief, provider } = task;
  if (!provider) return { status: 'unavailable', reason: 'not-open' };
  // The music adapter is intentionally closed; do not charge a call for an unimplemented adapter.
  if (step === 'audio-ai')
    return generateAudio(provider, brief).catch(() => ({
      status: 'unavailable',
      reason: 'not-open',
    }));
  try {
    return await control.run(provider, async () => {
      const prompt = buildBackgroundCompose(brief);
      const reply =
        step === 'voice-ai'
          ? await chatVoice(post, provider, prompt, 19_000)
          : await chat(post, provider, prompt, 19_000);
      const value = readBackgroundCompose(reply, brief).acceptance.value;
      if (!value) return { status: 'unavailable', reason: 'failed' };
      return (
        parseBackgroundResult(
          {
            status: 'ready',
            source: step,
            notes: composeNotes(brief, value.plan).notes,
            plan: value.plan,
            model: provider.builtIn ? provider.model : 'visitor',
            promptVersion: prompt.version,
          },
          brief.seconds,
        ) ?? { status: 'unavailable', reason: 'failed' }
      );
    });
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error instanceof GuestFailure ? error.reason : 'failed',
    };
  }
}
