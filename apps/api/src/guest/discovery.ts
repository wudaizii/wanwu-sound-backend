// Two-stage discovery orchestration. Audio is transient; only validated observations reach text.
import { DISCOVERY_RULES } from '@wanwu-v2/sound-rules/discovery';
import { isAudioObservation } from '@wanwu-v2/contracts/discovery';
import type { DiscoveryBrief } from '@wanwu-v2/contracts/discovery';
import { buildObservation, readReply } from '@wanwu-v2/prompts/tasks';
import { readPcm16Wave } from '@wanwu-v2/audio-engine/pcm';
import type { Post } from './net.ts';
import type { Provider } from './config.ts';
import { chatWithAudio } from './providers/audio.ts';
import type { CallControl } from './control.ts';

/** Audio observations are never accepted from the browser as if the server produced them. */
export async function observeDiscovery(
  brief: DiscoveryBrief,
  post: Post,
  provider: Provider | null,
  control?: CallControl,
): Promise<{ brief: DiscoveryBrief; status: string }> {
  const { audio, observations, ...facts } = brief;
  const data: DiscoveryBrief = { ...facts, mode: 'data', observations: [] };
  if (!audio || !provider) return { brief: data, status: audio ? 'not-open' : 'no-audio' };
  const pcm = readPcm16Wave(Buffer.from(audio, 'base64'));
  if (Math.abs(pcm.channels[0]!.length / pcm.sampleRate - brief.seconds) > 0.1)
    throw new Error('audio-duration-mismatch');
  try {
    const call = () =>
      chatWithAudio(
        post,
        provider,
        buildObservation(data),
        audio,
        DISCOVERY_RULES.analysis.listenMs,
      );
    const reply = await (control ? control.run(provider, call) : call());
    const parsed = readReply(reply);
    const raw = parsed.value as { observations?: unknown } | null;
    const valid = Array.isArray(raw?.observations)
      ? raw.observations
          .filter(isAudioObservation)
          .filter((item) => item.range[1] <= brief.seconds && item.range[1] > item.range[0])
          .filter((item, i, all) => all.findIndex((other) => other.id === item.id) === i)
          .slice(0, 8)
      : [];
    return {
      brief: { ...data, mode: valid.length ? 'audio' : 'data', observations: valid },
      status: valid.length ? 'accepted' : 'no-valid-observations',
    };
  } catch {
    return { brief: data, status: 'audio-failed' };
  }
}
