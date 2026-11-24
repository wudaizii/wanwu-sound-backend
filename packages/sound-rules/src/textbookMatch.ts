// 系统帮你找 (textbook-match-v1): which textbook songs are most like the child's arrangement. Both sides are described
// with the same fields — how busy (疏密), how much repeats (重复), how high (音区) and the mood — and a weighted
// similarity picks the top few, each with the one field that makes them alike. Local and rule-based: no model, no
// network; the weights live in ../rules/textbook-match.v1.json so the music role can tune them.
import type {Arrangement,MoodId} from '@wanwu-v2/contracts/arrangement';
import type {PitchChoice} from '@wanwu-v2/contracts/sound';
import {DENSITIES,LEVELS} from '@wanwu-v2/contracts/textbook';
import type {Density,Level,TextbookTrack} from '@wanwu-v2/contracts/textbook';
import {arrange} from './arrange.ts';
import {SHAPING_RULES,TEXTBOOK_MATCH_RULES} from './rules.ts';
import type {ShapingRules,TextbookMatchRules} from './rules.ts';

export type MatchField='density'|'repetition'|'register'|'mood';
export type WorkSummary={
 seconds:number;
 /** Single sounds heard per second, over the whole piece. */
 onsetsPerSecond:number;density:Density;
 /** Share of placed sounds that repeat something: a sound placed again, or a card set to 重复 / 一阵一阵. */
 repetitionShare:number;repetition:Level;
 register:Level;
 mood:MoodId|null;
};
export type TextbookMatch={trackId:string;score:number;
 /** The field that makes them most alike, and the song's value for it, so the page can say why. */
 reason:{field:MatchField;value:Density|Level|MoodId}};

const BANDS:readonly PitchChoice[]=['low','mid','high'];
const levelOf=(value:number,low:number,high:number):Level=>value<low?'low':value>high?'high':'medium';

/** Facts about the arrangement, counted with the same timeline the field plays. Null when nothing is placed. */
export function workSummary(arrangement:Arrangement,rules:TextbookMatchRules=TEXTBOOK_MATCH_RULES,shaping:ShapingRules=SHAPING_RULES):WorkSummary|null{
 const placed=arrangement.events.flatMap(event=>{const unit=arrangement.units.find(item=>item.id===event.unitId);return unit?[{event,unit}]:[];});
 if(!placed.length)return null;
 let onsets=0,end:number=arrangement.spanSeconds,repeated=0,bandSum=0;const seen=new Set<string>();
 for(const {event,unit} of [...placed].sort((a,b)=>a.event.at-b.event.at)){
  const layout=arrange(unit.shape,unit.analysis??null,{start:event.clip.startMs/1000,end:event.clip.endMs/1000},shaping.limits.clipMaxSeconds,event.id,shaping);
  onsets+=layout.events.length;end=Math.max(end,event.at*arrangement.spanSeconds+layout.totalSeconds);
  if(seen.has(unit.id)||unit.shape.pattern==='repeat'||unit.shape.pattern==='bursts')repeated++;
  seen.add(unit.id);
  bandSum+=BANDS.indexOf(unit.shape.pitch??unit.analysis?.band??'mid');
 }
 const onsetsPerSecond=onsets/end,repetitionShare=repeated/placed.length,mood=arrangement.mood;
 return {
  seconds:end,onsetsPerSecond,density:onsetsPerSecond<rules.density.sparseBelow?'sparse':onsetsPerSecond>rules.density.busyAbove?'busy':'medium',
  repetitionShare,repetition:levelOf(repetitionShare,rules.repetition.lowBelow,rules.repetition.highAbove),
  register:levelOf(bandSum/placed.length,2/3,4/3),
  mood:mood?.kind==='preset'?mood.id:mood?.kind==='custom'?mood.nearest:null,
 };
}

/** The song's register from its range: low / medium / high around the rule's lines. */
export function trackRegister(track:Pick<TextbookTrack,'pitchRange'>,rules:TextbookMatchRules=TEXTBOOK_MATCH_RULES):Level{
 return levelOf((track.pitchRange.low+track.pitchRange.high)/2,rules.register.lowBelowMidi,rules.register.highAboveMidi);
}

/** The best few songs for this arrangement, most alike first (ties keep the catalogue's order). */
export function matchTracks(summary:WorkSummary,tracks:readonly TextbookTrack[],rules:TextbookMatchRules=TEXTBOOK_MATCH_RULES):TextbookMatch[]{
 const step=(list:readonly string[],a:string,b:string)=>1-Math.abs(list.indexOf(a)-list.indexOf(b))/(list.length-1);
 const moodSimilarity=(a:MoodId,b:MoodId)=>{const p=rules.moods[a],q=rules.moods[b];return 1-Math.hypot(p.valence-q.valence,p.arousal-q.arousal)/(2*Math.SQRT2);};
 return tracks.map((track,order)=>{
  const fields:[MatchField,number,Density|Level|MoodId][]=[
   ['density',step(DENSITIES,summary.density,track.onsetDensity),track.onsetDensity],
   ['repetition',step(LEVELS,summary.repetition,track.repetition),track.repetition],
   ['register',step(LEVELS,summary.register,trackRegister(track,rules)),trackRegister(track,rules)],
  ];
  if(summary.mood)fields.push(['mood',moodSimilarity(summary.mood,track.mood),track.mood]);
  const weight=fields.reduce((sum,[field])=>sum+rules.weights[field],0)||1;
  const score=fields.reduce((sum,[field,similarity])=>sum+rules.weights[field]*similarity,0)/weight;
  const [field,,value]=fields.reduce((best,item)=>rules.weights[item[0]]*item[1]>rules.weights[best[0]]*best[1]?item:best);
  return {trackId:track.id,score,reason:{field,value},order};
 }).sort((a,b)=>b.score-a.score||a.order-b.order).slice(0,rules.top).map(({order:_,...match})=>match);
}
