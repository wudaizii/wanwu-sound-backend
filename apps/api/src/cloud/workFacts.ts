import type { WorkRecord } from '@wanwu-v2/contracts/cloud';
import { timedEvents, pieceSeconds, cutSeconds } from '@wanwu-v2/audio-engine/timeline';
import { RULE_VERSIONS } from '@wanwu-v2/sound-rules/rules';
import { RENDERER_VERSION } from '@wanwu-v2/audio-engine/version';
import { FACT_POLICY_VERSION } from '../guest/factPolicy.ts';
import { digest } from './context.ts';

/** Read-only facts derived from a server-owned, canonicalised work. No child/source names or storage URLs. */
export function workFacts(work: WorkRecord) {
  const numbers = new Map<string, number>();
  const events = timedEvents(work.arrangement).map(({ event, unit, start, end, seconds }) => {
    if (!numbers.has(unit.id)) numbers.set(unit.id, numbers.size + 1);
    return {
      eventId: event.id,
      token: `声音${numbers.get(unit.id)}`,
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
  };
  return { ...facts, inputDigest: digest(facts) };
}
