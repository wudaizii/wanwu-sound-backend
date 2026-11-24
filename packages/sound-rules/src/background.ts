// The local background (本地动态音符): the offline step of the background chain (AI audio → AI notes → this → only
// the child's sounds). From the piece's length, when the child's sounds play, the mood and an optional textbook card
// it writes the notes of a soft accompaniment — no model, no network, and the same work always gets the same notes.
// - Colour (调式、和弦、音区、疏密) comes from the child's mood; without one, from the textbook song; else neutral.
// - Rhythm (速度、拍子、旋律的节奏) comes from the textbook song when one is chosen; else from the mood.
// - Chords and bass are always there; the melody only plays in the gaps between the child's sounds (一问一答).
// - The ending stays inside the piece's length: the chord before is the dominant, then the tonic lands on the last
//   bar line that leaves room to ring, and holds to the end.
// - While a child's sound plays, the whole background makes room (see mix.ts).
// Who plays which part is decided separately (assignParts), so instruments never change the notes.
// Pure; the web renders the plan, a later server can render the same plan.
import type {MoodId} from '@wanwu-v2/contracts/arrangement';
import type {TextbookTrack,TextbookVariation} from '@wanwu-v2/contracts/textbook';
import {duckPoints,mergeSpans} from './mix.ts';
import type {GainPoint,Span} from './mix.ts';
import {seeded} from './random.ts';
import {shapeOf} from './textbookVariation.ts';
import {BACKGROUND_RULES,MIX_RULES} from './rules.ts';
import type {BackgroundMode,BackgroundRules,MixRules} from './rules.ts';

export type {Span} from './mix.ts';
export type BackgroundPart='chord'|'bass'|'melody'|'rhythm';
export const BACKGROUND_PARTS:readonly BackgroundPart[]=['chord','bass','melody','rhythm'];
/** `accent` 0–1: how strongly the note is played. */
export type BackgroundNote={at:number;length:number;midi:number;part:BackgroundPart;accent:number};
/** What the background borrows from a textbook card. */
export type BackgroundTextbook=Pick<TextbookTrack,'id'|'tempoBpm'|'meter'|'rhythmCell'|'mode'|'mood'>&{
 /** 换几种样子: the shape of the song's feature this time (missing = as it is). */
 variation?:TextbookVariation};
export type BackgroundInput={
 /** The piece's real length (the chosen length, or longer when a sound runs past it). The background never adds to it. */
 seconds:number;
 /** When the child's sounds are heard. */
 sounding:readonly Span[];
 mood:MoodId|null;
 textbook:BackgroundTextbook|null;
 /** The work's id: the same work always gets the same melody. */
 seed:string;
};
export type BackgroundPlan={
 rules:string;mix:string;
 /** Which step of the background chain made it; the page says so. */
 source:'local-rules';
 seconds:number;tempo:number;metre:2|3|4;mode:BackgroundMode;tonic:number;
 /** Whose colour it has: the child's mood, the textbook song's, or neutral. */
 colour:MoodId|'none';
 textbook:string|null;
 /** The shape of the textbook song's feature that was played (null without a song). */
 variation:TextbookVariation|null;
 /** Where the tonic lands for the ending, in seconds. */
 cadenceAt:number;
 fadeInSeconds:number;fadeOutSeconds:number;
 notes:BackgroundNote[];
 /** 背景让一让: gain points under the child's sounds. */
 duck:GainPoint[];
};

const near=(value:number,step:number)=>Math.abs(value/step-Math.round(value/step))<1e-6;

export function backgroundPlan(input:BackgroundInput,rules:BackgroundRules=BACKGROUND_RULES,mix:MixRules=MIX_RULES):BackgroundPlan{
 const {seconds,textbook}=input;
 const colour:MoodId|'none'=input.mood??textbook?.mood??'none',feel=rules.moods[colour];
 const mode:BackgroundMode=input.mood?feel.mode:textbook?.mode??feel.mode,{scale,melody:melodySteps}=rules.modes[mode];
 const tempo=textbook?.tempoBpm??feel.tempo,metre=textbook?.meter??feel.metre;
 const beat=60/tempo,bar=beat*metre,tonic=feel.tonic;
 const notes:BackgroundNote[]=[];

 // ----- harmony: one chord per bar, dominant then tonic at the end -----
 const pitch=(index:number)=>tonic+scale[((index%7)+7)%7]!+12*Math.floor(index/7);
 /** Triad on a scale degree (1–7), kept near the tonic: degrees above a fifth sit below it. */
 const triad=(degree:number)=>{const root=degree-1,notes=[root,root+2,root+4].map(pitch);return scale[root]!>6?notes.map(note=>note-12):notes;};
 const cadenceBar=Math.max(0,Math.floor((seconds-rules.ending.minRingSeconds)/bar+1e-9)),cadenceAt=cadenceBar*bar;
 const degreeOf=(barIndex:number)=>barIndex>=cadenceBar?1:barIndex===cadenceBar-1&&cadenceBar>=2?5:feel.progression[barIndex%feel.progression.length]!;
 for(let i=0;i<=cadenceBar;i++){
  const at=i*bar,end=i<cadenceBar?Math.min(seconds,at+bar):seconds;if(end<=at)break;
  const chord=triad(degreeOf(i));
  for(const midi of chord)notes.push({at,length:end-at,midi,part:'chord',accent:0});
  notes.push({at,length:i<cadenceBar?(end-at)*rules.bass.lengthPortion:end-at,midi:chord[0]!-rules.bass.dropSemitones,part:'bass',accent:i===cadenceBar?1:.6});
 }

 // ----- rhythm: every beat, strong and weak by the metre; one last stroke on the tonic -----
 const levels=metre===2?rules.rhythm.two:metre===3?rules.rhythm.three:rules.rhythm.four;
 for(let b=0;b*beat<seconds-1e-9;b++){
  const at=b*beat;if(at>cadenceAt+1e-9)break;
  const inBar=b%metre,level=levels[inBar]!+(inBar===0?rules.rhythm.accentBoost*feel.accent:0);
  notes.push({at,length:Math.min(beat,seconds-at),midi:0,part:'rhythm',accent:Math.min(1,level)});
 }

 // ----- melody: only in the gaps between the child's sounds, long enough for a phrase -----
 const {liftSemitones,rangeSemitones,leapSteps,minGapBeats,marginSeconds,noteLengthPortion}=rules.melody;
 const busy=mergeSpans(input.sounding.map(span=>({start:span.start-marginSeconds,end:span.end+marginSeconds})),seconds);
 const gaps:Span[]=[];let from=0;
 for(const span of [...busy,{start:seconds,end:seconds}]){if(span.start-from>=minGapBeats*beat)gaps.push({start:from,end:span.start});from=Math.max(from,span.end);}
 // 换几种样子 moves the melody up or down, stretches or squeezes the song's rhythm cell, or starts it half a beat late.
 const variation=textbook?textbook.variation??'original':null;
 const songCell=textbook?.rhythmCell.length?textbook.rhythmCell:null,shape=songCell&&variation?shapeOf(songCell,variation,rules):null;
 const base=tonic+liftSemitones+(shape?.semitones??0),pool:number[]=[];
 for(let octave=0;octave<3;octave++)for(const step of melodySteps){const midi=base+step+12*octave;if(midi<=base+rangeSemitones)pool.push(midi);}
 const random=seeded(input.seed),cell=shape?shape.cell:[feel.melodyEveryBeats];
 const chordTone=(midi:number,at:number)=>{
  const classes=new Set(triad(degreeOf(Math.floor(at/bar+1e-9))).map(note=>((note%12)+12)%12));
  return pool.reduce((best,candidate)=>classes.has(candidate%12)&&Math.abs(candidate-midi)<Math.abs(best-midi)?candidate:best,
   pool.find(candidate=>classes.has(candidate%12))??midi);
 };
 let index=Math.floor(pool.length/2),t=(shape?.delayBeats??0)*beat,step=0;
 const phrase:{at:number;length:number;gap:number}[]=[];
 while(t<cadenceAt-1e-9){
  const length=cell[step%cell.length]!*beat,gap=gaps.findIndex(item=>t>=item.start-1e-9&&t+length*noteLengthPortion<=Math.min(item.end,cadenceAt)+1e-9);
  if(gap>=0)phrase.push({at:t,length:length*noteLengthPortion,gap});
  t+=length;step++;
 }
 phrase.forEach((note,i)=>{
  // A small step up or down (never standing still), turning back at the edges of the range.
  const size=1+Math.floor(random()*leapSteps),up=random()<.5,next=index+(up?size:-size);
  index=next<0||next>=pool.length?index+(up?-size:size):next;
  index=Math.min(pool.length-1,Math.max(0,index));
  const downbeat=near(note.at,bar),last=phrase[i+1]?.gap!==note.gap;
  const midi=downbeat||last?chordTone(pool[index]!,note.at):pool[index]!;index=pool.indexOf(midi);
  notes.push({at:note.at,length:note.length,midi,part:'melody',accent:downbeat?.85:.6});
 });
 // The melody lands on the tonic with the last chord, when no child's sound is there.
 if(gaps.some(gap=>cadenceAt>=gap.start-1e-9&&Math.min(seconds,cadenceAt+beat)<=gap.end+1e-9))
  notes.push({at:cadenceAt,length:seconds-cadenceAt,midi:base,part:'melody',accent:.85});

 return {
  rules:rules.version,mix:mix.version,source:'local-rules',seconds,tempo,metre,mode,tonic,colour,textbook:textbook?.id??null,variation,cadenceAt,
  fadeInSeconds:Math.min(rules.fade.inSeconds,seconds/3),fadeOutSeconds:Math.min(rules.fade.outSeconds,seconds/3,Math.max(rules.ending.minRingSeconds,seconds-cadenceAt)),
  notes:notes.sort((a,b)=>a.at-b.at),
  duck:duckPoints(input.sounding,seconds,mix),
 };
}

/** What an instrument is for: parts it leads, and parts it can also cover when nobody leading them is chosen. */
export type PlayerRoles={id:string;lead:readonly BackgroundPart[];can:readonly BackgroundPart[]};
/** The background as generated: soft and plain, for the pitched parts nobody chosen can play. */
export const ORIGINAL_PLAYER='original';

/**
 * Who plays which part. Each part goes to the chosen instruments that lead it; if none does, to those that can play it;
 * a pitched part (chords, bass, melody) nobody chosen can play keeps the original soft voice. So nothing chosen = the
 * original background, and choosing only a drum adds its beat to the original, never leaves the drum alone.
 */
export function assignParts(chosen:readonly PlayerRoles[]):Record<BackgroundPart,string[]>{
 const parts={} as Record<BackgroundPart,string[]>;
 for(const part of BACKGROUND_PARTS){
  const lead=chosen.filter(player=>player.lead.includes(part)),can=chosen.filter(player=>player.can.includes(part));
  const players=(lead.length?lead:can).map(player=>player.id);
  parts[part]=players.length||part==='rhythm'?players:[ORIGINAL_PLAYER];
 }
 return parts;
}

/**
 * 和我的声音碰一碰: what happened between the background and the child's sounds, in one of four words —
 * `together` (most sounds start on a beat: pushing together), `answer` (the melody comes back between sounds again and
 * again: call and answer), `fill` (the melody fills the gaps), `under` (no gap long enough: the background carries the
 * sounds). `example` is the first sound that started on a beat, for the explanation.
 */
export type Meeting={kind:'together'|'answer'|'fill'|'under';example:number|null};
export function backgroundMeeting(plan:Pick<BackgroundPlan,'tempo'|'notes'>,sounding:readonly Span[],rules:BackgroundRules=BACKGROUND_RULES):Meeting{
 const {toleranceSeconds,alignShare,answerTurns}=rules.meeting,beat=60/plan.tempo;
 const onsets=sounding.map((span,index)=>({at:span.start,index})).sort((a,b)=>a.at-b.at);
 const onBeat=onsets.filter(onset=>Math.abs(onset.at-Math.round(onset.at/beat)*beat)<=toleranceSeconds);
 const together=onsets.length>0&&onBeat.length/onsets.length>=alignShare;
 const melody=plan.notes.filter(note=>note.part==='melody');
 if(!melody.length)return {kind:together?'together':'under',example:onBeat[0]?.index??null};
 if(together)return {kind:'together',example:onBeat[0]!.index};
 // Melody between two of the child's sounds counts as one answer.
 const spans=[...sounding].sort((a,b)=>a.start-b.start);
 let turns=0;
 for(let i=0;i+1<spans.length;i++){
  const from=spans[i]!.end,to=spans[i+1]!.start;
  if(melody.some(note=>note.at>=from-1e-6&&note.at<to))turns++;
 }
 return {kind:turns>=answerTurns?'answer':'fill',example:null};
}
