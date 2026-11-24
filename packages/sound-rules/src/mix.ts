// Mixing the child's sounds with the background (mix-v1): the levels of the two layers, how far the background makes
// room while a child's sound plays, and the limiter on the sum. Pure; the web player and a later server mix read the
// same numbers from ../rules/mix.v1.json.
import {MIX_RULES} from './rules.ts';
import type {MixRules} from './rules.ts';

export {MIX_RULES} from './rules.ts';
export type {MixRules} from './rules.ts';

export type Span={start:number;end:number};
export type GainPoint={at:number;gain:number};

/** Sorted spans inside [0, seconds], with spans closer than `join` seconds merged into one. */
export function mergeSpans(spans:readonly Span[],seconds:number,join=0):Span[]{
 const merged:Span[]=[];
 for(const span of [...spans].map(item=>({start:Math.max(0,item.start),end:Math.min(seconds,item.end)})).filter(item=>item.end>item.start).sort((a,b)=>a.start-b.start)){
  const last=merged.at(-1);
  if(last&&span.start-last.end<=join)last.end=Math.max(last.end,span.end);
  else merged.push({...span});
 }
 return merged;
}

/**
 * 背景让一让: the background's level over the piece as straight-line gain points — full, then down by `duck.depthDb`
 * while a child's sound plays (reached by its start, back up `releaseSeconds` after it ends). Sounds too close for the
 * background to come back up in between count as one.
 */
export function duckPoints(sounding:readonly Span[],seconds:number,rules:MixRules=MIX_RULES):GainPoint[]{
 const {depthDb,attackSeconds,releaseSeconds}=rules.duck,low=10**(-depthDb/20);
 const points:GainPoint[]=[{at:0,gain:1}];
 for(const span of mergeSpans(sounding,seconds,attackSeconds+releaseSeconds)){
  const before=points.at(-1)!.at;
  points.push({at:Math.max(before,span.start-attackSeconds),gain:1},{at:Math.max(before,span.start),gain:low},
   {at:span.end,gain:low},{at:Math.min(seconds,span.end+releaseSeconds),gain:1});
 }
 return points;
}
