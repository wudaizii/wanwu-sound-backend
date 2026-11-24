// 音乐小发现: small observations counted from the arrangement — who starts, what repeats, call and answer, what sounds
// together, long and short, rests, where it gets busy, how it ends. Fixed rules, not a model, so every sentence is true
// of this piece. Each fact maps to a music idea a non-specialist teacher can explain (the wording and classroom questions
// are corpus: @wanwu-v2/prompts/corpus); this file only finds the facts. The fact type is the talk contract, so the
// server and an AI brief use the same facts.
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import type {Discovery} from '@wanwu-v2/contracts/talk';
import {timedEvents} from '../creation/arrangementTiming.ts';

export type {Discovery};

/** A quiet stretch this long (seconds, nothing sounding) counts as a rest. */
const REST_SECONDS=2.5;
/** The longest sound must be at least this many times the shortest to count as long vs short. */
const LONG_SHORT_RATIO=2.5;

export function findDiscoveries(arrangement:Arrangement):Discovery[]{
 const timed=timedEvents(arrangement);
 if(!timed.length)return [];
 const first=timed[0]!,last=[...timed].sort((a,b)=>a.end-b.end).at(-1)!;
 const counts=new Map<string,{name:string;times:number}>();
 for(const item of timed){const entry=counts.get(item.unit.id);if(entry)entry.times++;else counts.set(item.unit.id,{name:item.unit.name,times:1});}
 if(counts.size===1&&timed.length===1)return [{kind:'single',name:first.unit.name}];
 const found:Discovery[]=[];
 const next=timed.find(item=>item.unit.id!==first.unit.id);
 found.push({kind:'opening',first:first.unit.name,next:next?.unit.name??null});
 // The most repeated sound (ties: the one heard first).
 const repeated=[...counts.values()].reduce((best,entry)=>entry.times>best.times?entry:best);
 if(repeated.times>=2)found.push({kind:'repeat',name:repeated.name,times:repeated.times});
 // Call and answer: A, then B, then A again (in listening order).
 for(let i=0;i+2<timed.length;i++){
  const a=timed[i]!.unit,b=timed[i+1]!.unit,c=timed[i+2]!.unit;
  if(a.id===c.id&&a.id!==b.id){found.push({kind:'echo',a:a.name,b:b.name});break;}
 }
 // Two different sounds overlapping in time.
 outer:for(let i=0;i<timed.length;i++)for(let j=i+1;j<timed.length;j++){
  const a=timed[i]!,b=timed[j]!;
  if(b.start>=a.end)continue;
  if(a.unit.id!==b.unit.id){found.push({kind:'together',a:a.unit.name,b:b.unit.name});break outer;}
 }
 // Long against short.
 const byLength=[...timed].sort((a,b)=>b.seconds-a.seconds),longest=byLength[0]!,shortest=byLength.at(-1)!;
 if(longest.unit.id!==shortest.unit.id&&longest.seconds>=shortest.seconds*LONG_SHORT_RATIO)
  found.push({kind:'long-short',long:longest.unit.name,longSeconds:Math.round(longest.seconds*10)/10,short:shortest.unit.name,shortSeconds:Math.round(shortest.seconds*10)/10});
 // The longest silence between sounds.
 let reach=first.end,longestRest=0;
 for(const item of timed.slice(1)){longestRest=Math.max(longestRest,item.start-reach);reach=Math.max(reach,item.end);}
 if(longestRest>=REST_SECONDS)found.push({kind:'rest',seconds:Math.floor(longestRest)});
 // Where more sounds start: first or second half of the chosen length.
 const middle=arrangement.spanSeconds/2,early=timed.filter(item=>item.start<middle).length,late=timed.length-early;
 if(timed.length>=3&&Math.abs(early-late)>=2)found.push({kind:'busier',half:early>late?'first':'second'});
 found.push({kind:'ending',name:last.unit.name,same:last.unit.id===first.unit.id});
 return found;
}
