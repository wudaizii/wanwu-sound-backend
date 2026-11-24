// Five choices → a shaping plan (shaping-v3). Every choice works on the single sounds the 声音体检 found:
// - 高低 / 长短 describe what the child heard, so the sound moves toward that band; already there → unchanged.
// - 长短 is how long one sound lasts (stretch, pitch kept); 出现方式 is how the sounds are laid out (see arrange.ts).
// - 变化 moves within each sound (a croak that rises); for sound that runs together, across it, getting nearer / farther.
// - 轻响 brings every recording to one loudness first, then soft / medium / loud with matching attack and brightness.
// Pure: the renderer (web) or the server turns a plan into audio.
import type {SourceClip} from '@wanwu-v2/contracts/arrangement';
import type {ChosenShape,PitchChoice,SoundAnalysis,SoundDimension} from '@wanwu-v2/contracts/sound';
import {arrange,stretchFor} from './arrange.ts';
import type {Part} from './arrange.ts';
import {SHAPING_RULES} from './rules.ts';
import type {ShapingRules} from './rules.ts';

export {arrange,stretchFor} from './arrange.ts';

/** One stretch of the source played at `at` (output seconds), reading from `from` (source seconds) at `stretch`. */
export type PlanEvent={at:number;from:number;length:number;gain:number;
 attackSeconds:number;releaseSeconds:number;swell:boolean;
 /** Level across the event in dB (变化 on sound that runs together: nearer / farther). */
 rampDb:[number,number]|null;
 bendCents:number;
 /** A low-pass that opens or closes across the event (变化 up / down; 慢慢出现 from far to near), over `portion` of it. */
 sweep:{fromHz:number;toHz:number;portion:number}|null};
export type ShapingPlan={
 rules:string;kind:SoundAnalysis['kind'];
 semitones:number;
 /** Output seconds per source second for every sound (长短); 1 = its own length. */
 stretch:number;
 /** Loudness match × 轻响 level, linear. */
 gain:number;
 lowpassHz:number;highShelfDb:number;
 wave:{rateHz:number;depthCents:number;gainDepth:number}|null;
 /** Time-keeping pitch / stretch path (short overlapping grains); off when nothing needs it. */
 grainSeconds:number|null;
 events:PlanEvent[];
 totalSeconds:number;
};

const BANDS:readonly PitchChoice[]=['low','mid','high'];
const toGain=(db:number)=>10**(db/20);

/** Stable cache key for the chosen dimensions ('-' = unchosen, i.e. original). */
export const shapeKey=(shape:ChosenShape)=>[shape.pitch,shape.duration,shape.contour,shape.intensity,shape.pattern].map(value=>value??'-').join('/');

/** dB to the common loudness: boost capped, peak kept under the ceiling with room for a brightening shelf. */
function matchDb(analysis:SoundAnalysis|null,rules:ShapingRules,shelfDb=0){
 if(!analysis||analysis.silent)return 0;
 const {targetRmsDb,maxBoostDb,peakCeilingDb}=rules.level;
 return Math.min(targetRmsDb-analysis.loudnessDb,maxBoostDb,peakCeilingDb-Math.max(0,shelfDb)-analysis.peakDb);
}
/** Level for hearing a recording as it is (听原声, library previews): the common loudness, unchosen level. */
export function originalGain(analysis:SoundAnalysis,rules:ShapingRules=SHAPING_RULES){
 return toGain(matchDb(analysis,rules)+rules.level.unchosenDb);
}

/** 高低: steps from the band the sound is in to the band the child heard. Same band → no change. */
export function pitchMove(target:PitchChoice|undefined,analysis:SoundAnalysis|null,rules:ShapingRules=SHAPING_RULES){
 if(!target||!analysis||analysis.silent)return {semitones:0,shelfDb:0};
 const steps=BANDS.indexOf(target)-BANDS.indexOf(analysis.band),{semitonesPerStep,maxSemitones,shelfDbPerStep}=rules.pitch;
 return {semitones:Math.max(-maxSemitones,Math.min(maxSemitones,steps*semitonesPerStep)),shelfDb:steps*shelfDbPerStep};
}

/**
 * Why a choice may sound like the original, so the page can say so instead of seeming broken:
 * `already` — the sound is already like that (高低, 长短); `keeps` — the choice means "as it is" (稳稳的, 刚刚好响, 出现一次).
 */
export function unchangedBy(dimension:SoundDimension,value:string,analysis:SoundAnalysis|null):'already'|'keeps'|null{
 if(!analysis||analysis.silent)return null;
 if(dimension==='pitch')return value===analysis.band?'already':null;
 if(dimension==='duration')return value===analysis.lengthBand?'already':null;
 if(dimension==='contour')return value==='flat'?'keeps':null;
 if(dimension==='intensity')return value==='medium'?'keeps':null;
 return value==='once'?'keeps':null;
}

/** The part a sound card previews: the sound without the silence around it, ending between sounds within the limit. */
export function cardPart(shape:ChosenShape,analysis:SoundAnalysis,rules:ShapingRules=SHAPING_RULES):Part{
 const total=analysis.durationMs/1000,main=analysis.main?{start:analysis.main.startMs/1000,end:analysis.main.endMs/1000}:{start:0,end:total};
 // Sound that runs together slows down as a whole; separate sounds keep their moments, so only texture needs the room.
 const stretch=analysis.kind==='texture'?stretchFor(shape.duration,analysis,rules):1,limit=main.start+rules.limits.cardMaxSeconds/stretch;
 if(main.end<=limit)return main;
 const lastWhole=analysis.kind==='texture'?undefined:[...analysis.units].reverse().find(unit=>unit.endMs/1000<=limit);
 return {start:main.start,end:lastWhole&&lastWhole.endMs/1000>main.start?lastWhole.endMs/1000:limit};
}

/** Default excerpt when a sound is placed in 万物声场: the whole sound without the silence around it (the child can 剪一剪). */
export function defaultClipFor(analysis:SoundAnalysis,minMs:number):SourceClip{
 const main=analysis.main??{startMs:0,endMs:analysis.durationMs};
 return {startMs:main.startMs,endMs:Math.min(analysis.durationMs,Math.max(main.endMs,main.startMs+minMs))};
}

function buildPlan(shape:ChosenShape,analysis:SoundAnalysis|null,part:Part,maxSeconds:number,seed:string,rules:ShapingRules):ShapingPlan{
 const layout=arrange(shape,analysis,part,maxSeconds,seed,rules),texture=layout.kind==='texture';
 const pitch=pitchMove(shape.pitch,analysis,rules),tone=rules.intensityTone[shape.intensity??'medium'];
 const shelfDb=pitch.shelfDb+tone.highShelfDb,level=shape.intensity?rules.level.choiceDb[shape.intensity]:rules.level.unchosenDb;
 const c=rules.contour,moves=texture?c.texture:c.unit,edges=rules.edges,fade=rules.pattern.fadeIn;
 const bendCents=shape.contour==='rising'?moves.bendCents:shape.contour==='falling'?-moves.bendCents:0;
 const rampDb:[number,number]|null=!texture?null:shape.contour==='rising'?[-c.texture.rampDb,0]:shape.contour==='falling'?[0,-c.texture.rampDb]:null;
 const wave=shape.contour==='wavy'?{...moves.wave}:null;
 const events=layout.events.map(event=>{
  const sweep=shape.contour==='rising'?{fromHz:c.sweepClosedHz,toHz:c.sweepOpenHz,portion:1}
   :shape.contour==='falling'?{fromHz:c.sweepOpenHz,toHz:c.sweepClosedHz,portion:1}
   :shape.pattern==='fade-in'?{fromHz:fade.fromHz,toHz:c.sweepOpenHz,portion:fade.portion}:null;
  const edge=Math.min(edges.textureFadeSeconds,event.length/3);
  const attack=shape.pattern==='fade-in'&&(texture||layout.events.length===1)?event.length*fade.portion:texture?edge:Math.min(tone.attackSeconds,event.length/3);
  const release=event.fadeOut?event.length*event.fadeOut:texture?edge:Math.min(event.length/2,Math.max(edges.releaseMinSeconds,event.length*edges.releasePortion));
  return {at:event.at,from:event.from,length:event.length,gain:event.gain,attackSeconds:attack,releaseSeconds:release,swell:event.swell,rampDb,bendCents,sweep};
 });
 return {
  rules:rules.version,kind:layout.kind,semitones:pitch.semitones,stretch:layout.stretch,
  gain:toGain(matchDb(analysis,rules,shelfDb)+level),lowpassHz:tone.lowpassHz,highShelfDb:shelfDb,wave,
  grainSeconds:pitch.semitones||bendCents||wave||Math.abs(layout.stretch-1)>1e-6?rules.grain.seconds:null,
  events,totalSeconds:layout.totalSeconds,
 };
}

/** 声音诞生 preview of a sound card, within the preview limit. */
export function planCard(shape:ChosenShape,analysis:SoundAnalysis,seed:string,rules:ShapingRules=SHAPING_RULES){
 return buildPlan(shape,analysis,cardPart(shape,analysis,rules),rules.limits.cardMaxSeconds,seed,rules);
}
/** 万物声场 / 万物成曲: the child's excerpt with the card's choices. `analysis` is the unit's own (null: not known yet). */
export function planClip(shape:ChosenShape,clip:SourceClip,analysis:SoundAnalysis|null,seed:string,rules:ShapingRules=SHAPING_RULES){
 return buildPlan(shape,analysis,{start:clip.startMs/1000,end:clip.endMs/1000},rules.limits.clipMaxSeconds,seed,rules);
}
/** How long one placed occurrence is heard — the same timeline the renderer plays. */
export function clipHeardSeconds(shape:ChosenShape,analysis:SoundAnalysis|null,clip:SourceClip,seed='',rules:ShapingRules=SHAPING_RULES){
 return arrange(shape,analysis,{start:clip.startMs/1000,end:clip.endMs/1000},rules.limits.clipMaxSeconds,seed,rules).totalSeconds;
}
