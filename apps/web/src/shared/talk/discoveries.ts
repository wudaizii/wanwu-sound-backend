// 音乐小发现: small observations counted from the arrangement — who starts, what repeats, call and answer, what sounds
// together, long and short, rests, where it gets busy, how it ends. Fixed rules, not a model, so every sentence is true
// of this piece. Each fact maps to a music idea a non-specialist teacher can explain (the wording and classroom questions
// are corpus: @wanwu-v2/prompts/corpus); this file only finds the facts. The fact type is the talk contract, so the
// server and an AI brief use the same facts.
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import type {Discovery} from '@wanwu-v2/contracts/talk';
import {timedEvents} from '../creation/arrangementTiming.ts';
import {discoveriesFromTimeline} from '@wanwu-v2/audio-engine/discoveries';

export type {Discovery};

export function findDiscoveries(arrangement:Arrangement):Discovery[]{
 return discoveriesFromTimeline(timedEvents(arrangement).map(item=>({id:item.unit.id,name:item.unit.name,start:item.start,end:item.end,seconds:item.seconds})),arrangement.spanSeconds);
}
