import type { WorkRecord } from '@wanwu-v2/contracts/cloud';
import { timedEvents, pieceSeconds, cutSeconds } from '@wanwu-v2/audio-engine/timeline';
import { RULE_VERSIONS } from '@wanwu-v2/sound-rules/rules';
import { RENDERER_VERSION } from '@wanwu-v2/audio-engine/version';
import { FACT_POLICY_VERSION } from '../guest/factPolicy.ts';
import { digest } from './context.ts';
import { discoveriesFromTimeline } from '@wanwu-v2/audio-engine/discoveries';
import { WORK_TALK_BRIEF_VERSION } from '@wanwu-v2/contracts/talk';
import type { SoundToken } from '@wanwu-v2/contracts/talk';
import { textbookTrack } from '../catalogue.ts';

/** Read-only facts derived from a server-owned, canonicalised work. No child/source names or storage URLs. */
export function workFacts(work: WorkRecord) {
  const numbers = new Map<string, number>();
  const events = timedEvents(work.arrangement).map(({ event, unit, start, end, seconds }) => {
    if (!numbers.has(unit.id)) numbers.set(unit.id, numbers.size + 1);
    return {
      eventId: event.id,
      token: `声音${numbers.get(unit.id)}` as SoundToken,
      start,
      end,
      seconds,
      clip: event.clip,
      chosen: unit.shape,
      measured: unit.analysis
        ? {
            rules: unit.analysis.rules,
            band: unit.analysis.band,
            lengthBand: unit.analysis.lengthBand,
            kind: unit.analysis.kind,
            loudnessDb: unit.analysis.loudnessDb,
            durationMs: unit.analysis.durationMs,
          }
        : null,
    };
  });
  const facts = {
    version: FACT_POLICY_VERSION,
    workId: work.id,
    revision: work.revision,
    provenance: 'server-work' as const,
    rules: RULE_VERSIONS,
    renderer: RENDERER_VERSION,
    fieldSeconds: work.arrangement.spanSeconds,
    seconds: pieceSeconds(work.arrangement),
    cutSeconds: cutSeconds(work.arrangement),
    events,
    background: {
      enabled: work.settings.background.enabled,
      instruments: work.settings.background.instruments,
      volume: work.settings.background.volume,
    },
    talkBrief: events.length
      ? {
          version: WORK_TALK_BRIEF_VERSION,
          seconds: pieceSeconds(work.arrangement),
          mood:
            work.arrangement.mood?.kind === 'preset'
              ? work.arrangement.mood.id
              : (work.arrangement.mood?.nearest ?? null),
          textbookTitle:
            work.settings.inspiration.kind === 'textbook'
              ? (textbookTrack(work.settings.inspiration.entryId)?.title ?? null)
              : null,
          facts: discoveriesFromTimeline(
            events.map((event) => ({
              id: event.token,
              name: event.token,
              start: event.start,
              end: event.end,
              seconds: event.seconds,
            })),
            work.arrangement.spanSeconds,
          ),
        }
      : null,
  };
  return { ...facts, inputDigest: digest(facts) };
}
