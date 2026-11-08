// A second env_file must never override authentication, database or listener settings.
const allowed=new Set(['WANWU_LLM_BASE_URL','WANWU_LLM_MODEL','WANWU_LLM_API_KEY','WANWU_AUDIO_MODEL',
  'WANWU_MUSIC_PROVIDER','WANWU_MUSIC_BASE_URL','WANWU_MUSIC_MODEL','WANWU_MUSIC_API_KEY','WANWU_GUEST_AI_DAILY_LIMIT']);
export function validateModelEnvironment(source:string) {
  const seen=new Set<string>();
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match=/^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match || !allowed.has(match[1]!) || seen.has(match[1]!)) throw new Error('Invalid model environment fields; values suppressed');
    seen.add(match[1]!);
    if (/[\x00-\x1f\x7f$`]/.test(match[2]!)) throw new Error('Invalid model environment value; value suppressed');
  }
  return true;
}
