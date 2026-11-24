// 长短 and 出现方式 on the real sounds of a recording. 长短 is how long ONE sound lasts (时值): every sound is
// stretched or shortened, never cut. 出现方式 is how the sounds are laid out in time (排列): one sound or a series is
// handled sound by sound; sound that runs together comes and goes as waves and gusts. Nothing is cut in the middle
// of a sound — only between sounds, or with a long fade.
// How long it lasts comes from the part it is given (the child's excerpt, or the card's preview part) with 长短:
// 重复 and 一阵一阵 fill that length (never fewer times than the rule's minimum); they only decide the layout in it.
// The same timeline serves the renderer and the field / score, so how long a sound is heard always agrees.
import type {ChosenShape,DurationChoice,SoundAnalysis,SoundKind} from '@wanwu-v2/contracts/sound';
import {seeded} from './random.ts';
import {SHAPING_RULES} from './rules.ts';
import type {ShapingRules} from './rules.ts';

/** A stretch of the source in seconds. */
export type Part={start:number;end:number};
/** One sounding moment of the result: `at` and `length` on the output, `from` in the source. */
export type Arranged={at:number;from:number;length:number;gain:number;
 /** Rises and falls over its length (waves and gusts of sound that runs together). */
 swell:boolean;
 /** Shortened from a longer sound: fades out over this share of its length instead of stopping. */
 fadeOut:number|null};
export type Arrangement={kind:SoundKind;stretch:number;events:Arranged[];totalSeconds:number};

const LENGTHS:readonly DurationChoice[]=['short','medium','long'];
const toGain=(db:number)=>10**(db/20);

/** 长长的 / 短短的: steps from how long the sounds are to how long the child heard them; same band → unchanged. */
export function stretchFor(duration:ChosenShape['duration'],analysis:SoundAnalysis|null,rules:ShapingRules=SHAPING_RULES){
 if(!duration||!analysis||analysis.silent)return 1;
 const d=rules.duration,steps=LENGTHS.indexOf(duration)-LENGTHS.indexOf(analysis.lengthBand);
 const [min,max]=analysis.kind==='texture'?[d.textureMinStretch,d.textureMaxStretch]:[d.minStretch,d.maxStretch];
 return Math.min(max,Math.max(min,d.stretchPerStep**steps));
}

/** The single sounds inside a part, each with a little of its natural ring-out (never into the next sound). */
function unitsIn(analysis:SoundAnalysis|null,part:Part,rules:ShapingRules):Part[]{
 const spans=(analysis?.units??[]).map(unit=>({start:Math.max(part.start,unit.startMs/1000),end:Math.min(part.end,unit.endMs/1000)}))
  .filter(unit=>unit.end-unit.start>=.03);
 return spans.map((unit,i)=>({start:unit.start,end:Math.min(unit.end+rules.edges.unitTailSeconds,spans[i+1]?.start??part.end,part.end)}));
}
const loudestFirst=(analysis:SoundAnalysis|null,units:readonly Part[])=>{
 const peak=(unit:Part)=>Math.max(-120,...(analysis?.units??[]).filter(u=>u.startMs/1000<unit.end&&u.endMs/1000>unit.start).map(u=>u.peakDb));
 return [...units].sort((a,b)=>peak(b)-peak(a));
};

export function arrange(shape:ChosenShape,analysis:SoundAnalysis|null,part:Part,maxSeconds:number,seed:string,rules:ShapingRules=SHAPING_RULES):Arrangement{
 const stretch=stretchFor(shape.duration,analysis,rules),partSeconds=Math.max(.05,part.end-part.start);
 const units=unitsIn(analysis,part,rules);
 // No analysis yet, or nothing separate to find: the part is played as one stretch of sound.
 const kind:SoundKind=!analysis||analysis.silent?'texture':analysis.kind==='texture'||!units.length?'texture':analysis.kind;
 const random=seeded(seed),jitter=()=>toGain((random()*2-1)*rules.pattern.bursts.gainJitterDb);
 const {repeat,bursts,fadeIn}=rules.pattern;
 // 重复 / 一阵一阵 fill the part: as many beats or groups as fit in its length with 长短, at least the minimum.
 const fill=Math.min(partSeconds*stretch,maxSeconds);
 const times=(period:number,gap:number,min:number)=>Math.max(min,Math.floor((fill+gap)/period+1e-9));
 const sound=(unit:Part,max=Infinity)=>{const length=(unit.end-unit.start)*stretch;return length>max?{length:max,fadeOut:rules.edges.cutFadePortion}:{length,fadeOut:null};};
 /** Stretches of a running sound, taken from different places in it, for waves and gusts. */
 const stretchOf=(index:number,seconds:number)=>{const source=seconds/stretch,room=Math.max(0,partSeconds-source);
  return {from:part.start+(room?(index*source)%room:0),length:Math.min(seconds,partSeconds*stretch)};};
 let events:Arranged[];
 if(shape.pattern==='repeat'){
  if(kind==='texture'){
   const wave=Math.min(repeat.waveSeconds,partSeconds*stretch);
   events=Array.from({length:times(wave+repeat.waveGapSeconds,repeat.waveGapSeconds,repeat.minCount)},(_,i)=>({at:i*(wave+repeat.waveGapSeconds),...stretchOf(i,wave),gain:1,swell:true,fadeOut:null}));
  }else{
   // The same sound (its loudest) again and again on a steady beat.
   const motif=loudestFirst(analysis,units)[0]!,{length,fadeOut}=sound(motif,repeat.motifMaxSeconds);
   events=Array.from({length:times(length+repeat.gapSeconds,repeat.gapSeconds,repeat.minCount)},(_,i)=>({at:i*(length+repeat.gapSeconds),from:motif.start,length,gain:1,swell:false,fadeOut}));
  }
 }else if(shape.pattern==='bursts'){
  if(kind==='texture'){
   const gust=Math.min(bursts.gustSeconds,partSeconds*stretch);
   events=Array.from({length:times(gust+bursts.groupGapSeconds,bursts.groupGapSeconds,bursts.minGroups)},(_,g)=>({at:g*(gust+bursts.groupGapSeconds),...stretchOf(g,gust),gain:jitter(),swell:true,fadeOut:null}));
  }else{
   // A few of the sound's own sounds close together, then a pause, a few more… until the part is full.
   const picks=loudestFirst(analysis,units);events=[];let cursor=0;
   for(let g=0;;g++){
    const group:Arranged[]=[];let end=cursor;
    for(let h=0;h<bursts.hitsPerGroup;h++){
     const unit=picks[(g*bursts.hitsPerGroup+h)%picks.length]!,{length,fadeOut}=sound(unit,bursts.hitMaxSeconds);
     group.push({at:end,from:unit.start,length,gain:jitter(),swell:false,fadeOut});
     end+=length+(h<bursts.hitsPerGroup-1?bursts.innerGapSeconds:0);
    }
    if(g>=bursts.minGroups&&end>fill+1e-9)break;
    events.push(...group);cursor=end+bursts.groupGapSeconds;
   }
  }
 }else if(kind==='texture'){
  events=[{at:0,from:part.start,length:partSeconds*stretch,gain:1,swell:false,fadeOut:null}];
 }else{
  // Once / slowly: the sounds keep their own moments (长短 is not 节奏); a longer sound only pushes the next one
  // when they would run into each other. 慢慢出现 makes each one louder than the last.
  const last=Math.max(1,units.length-1);let free=0;
  events=units.map((unit,i)=>{
   const at=Math.max(unit.start-part.start,free),length=(unit.end-unit.start)*stretch;free=at+length+rules.edges.unitGapSeconds;
   return {at,from:unit.start,length,gain:shape.pattern==='fade-in'&&units.length>1?toGain(fadeIn.seriesFromDb*(1-i/last)):1,swell:false,fadeOut:null};
  });
 }
 // Past the limit: end between sounds (drop what does not fit whole); only a single sound longer than the limit is
 // cut, with a long fade.
 const whole=events.filter(event=>event.at+event.length<=maxSeconds+1e-9);
 events=whole.length?whole:events.filter(event=>event.at<maxSeconds).slice(0,1).map(event=>
  ({...event,length:maxSeconds-event.at,fadeOut:event.fadeOut??rules.edges.cutFadePortion}));
 return {kind,stretch,events,totalSeconds:Math.max(0,...events.map(event=>event.at+event.length))};
}
