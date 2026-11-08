// Built-in model settings, loaded by Compose API env_file (.env.api, then .env.models), filled in by the
// product owner). The language model is required for the text tasks and AI composing; the music model may be left empty,
// which closes the AI audio step; the audio-understanding model (WANWU_AUDIO_MODEL, the AI voice step) is optional too. Settings that are
// present but malformed close the module and are reported once.
export type Provider = { baseUrl: string; model: string; apiKey: string; builtIn: boolean };
export const MUSIC_PROVIDERS = ['fun-music'] as const;
export type GuestConfig = {
  language: Provider | null;
  music: Provider | null;
  audio: Provider | null;
  dailyLimit: number;
};
export const CLOSED: GuestConfig = { language: null, music: null, audio: null, dailyLimit: 0 };

const MODEL = /^[A-Za-z0-9._:/-]{1,100}$/,
  KEY = /^[\x21-\x7e]{8,300}$/;
export function validProvider(baseUrl: unknown, model: unknown, apiKey: unknown) {
  if (
    typeof baseUrl !== 'string' ||
    typeof model !== 'string' ||
    typeof apiKey !== 'string' ||
    baseUrl.length > 300
  )
    return false;
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    MODEL.test(model) &&
    KEY.test(apiKey)
  );
}

function provider(env: NodeJS.ProcessEnv, prefix: 'LLM' | 'MUSIC'): Provider | null {
  const baseUrl = env[`WANWU_${prefix}_BASE_URL`] ?? '',
    model = env[`WANWU_${prefix}_MODEL`] ?? '',
    apiKey = env[`WANWU_${prefix}_API_KEY`] ?? '';
  if (!baseUrl && !model && !apiKey) return null;
  if (!validProvider(baseUrl, model, apiKey)) throw new Error(`Invalid WANWU_${prefix}_* settings`);
  return { baseUrl: baseUrl.replace(/\/+$/, ''), model, apiKey, builtIn: true };
}

export function readGuestConfig(env: NodeJS.ProcessEnv = process.env): GuestConfig {
  const language = provider(env, 'LLM');
  // The audio model (hears teaching-music excerpts) uses the language model's service and key, under its own model name.
  const audioModel = env.WANWU_AUDIO_MODEL ?? '';
  if (audioModel && (!language || !MODEL.test(audioModel)))
    throw new Error('WANWU_AUDIO_MODEL needs a valid name and the WANWU_LLM_* settings');
  const audio = audioModel && language ? { ...language, model: audioModel } : null;
  const kind = env.WANWU_MUSIC_PROVIDER ?? '';
  if (kind && !(MUSIC_PROVIDERS as readonly string[]).includes(kind))
    throw new Error('Unsupported WANWU_MUSIC_PROVIDER');
  const music = kind ? provider(env, 'MUSIC') : null;
  const dailyLimit = Number(env.WANWU_GUEST_AI_DAILY_LIMIT ?? 2000);
  if (!Number.isInteger(dailyLimit) || dailyLimit < 0 || dailyLimit > 1_000_000)
    throw new Error('Invalid WANWU_GUEST_AI_DAILY_LIMIT');
  return { language, music, audio, dailyLimit };
}
