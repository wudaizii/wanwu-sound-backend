// Plays a background plan (@wanwu-v2/sound-rules/background) with the chosen voices, offline into one buffer for the
// whole piece. It carries no musical numbers: which notes, the ending, the fades and how far it makes room under the
// child's sounds all come from the plan; who plays which part comes from assignParts. Only the timbre of the mock
// instruments lives here (a server instrument library will bring samples instead). The child's recordings are never
// touched: the buffer is its own layer.
import type {BackgroundNote,BackgroundPart,BackgroundPlan} from '@wanwu-v2/sound-rules/background';
import {ORIGINAL_PLAYER} from '@wanwu-v2/sound-rules/background';
import type {InstrumentRecipe} from './instruments.ts';

/** `original` is the background as generated: a soft, plain voice. */
export type Voice='original'|InstrumentRecipe;

const hz=(midi:number)=>440*2**((midi-69)/12);
const SAMPLE_RATE=22050;

type OfflineConstructor=typeof OfflineAudioContext;
type Env={gain:AudioParam};
const sustain=(env:Env,at:number,end:number,peak:number,attack:number)=>{
 env.gain.setValueAtTime(0,at);env.gain.linearRampToValueAtTime(peak,at+Math.min(attack,(end-at)/2));
 env.gain.setValueAtTime(peak,Math.max(at+attack,end-.4));env.gain.linearRampToValueAtTime(0,end);
};
const strike=(env:Env,at:number,end:number,peak:number)=>{
 env.gain.setValueAtTime(0,at);env.gain.linearRampToValueAtTime(peak,at+.008);env.gain.exponentialRampToValueAtTime(.001,Math.max(at+.02,end));
};
/** Louder for an accented note: 0 → ×0.7, 1 → ×1.15. */
const accented=(peak:number,note:BackgroundNote)=>peak*(.7+.45*note.accent);

/** One note in one voice. Returns false when this voice does not play this part. */
function play(ctx:BaseAudioContext,out:AudioNode,voice:Voice,note:BackgroundNote){
 const {at,length,part}=note,end=at+length,freq=hz(note.midi);
 // Silent until its envelope starts (a gain defaults to 1, which would let a rolled chord note blip early).
 const env=ctx.createGain();env.gain.value=0;
 const osc=ctx.createOscillator();
 switch(voice){
  case 'original':
   if(part==='rhythm')return false;
   osc.type='sine';osc.frequency.value=freq;
   if(part==='chord')sustain(env,at,end,.05,.6);
   else if(part==='bass')sustain(env,at,end,accented(.11,note),.05);
   else strike(env,at,end,accented(.11,note));
   break;
  case 'pad':
   // 风琴: everything held, reedy.
   if(part==='rhythm')return false;
   osc.type='triangle';osc.frequency.value=freq;
   sustain(env,at,end,part==='chord'?.07:part==='bass'?accented(.09,note):accented(.08,note),part==='chord'?.5:.04);
   break;
  case 'bells':
   // 木琴: every note struck and decaying; chords become a quick roll.
   if(part==='rhythm')return false;
   osc.type='sine';
   if(part==='chord'){const roll=at+(note.midi%12)*.012;osc.frequency.value=freq*2;strike(env,roll,Math.min(end,roll+.8),.06);}
   else{osc.frequency.value=part==='bass'?freq*2:freq;strike(env,at,end,part==='melody'?accented(.17,note):.1);}
   break;
  case 'pulse':
   // 小鼓: the beat, strong and weak — a deeper thump on strong beats.
   if(part!=='rhythm')return false;
   osc.type='sine';osc.frequency.setValueAtTime(note.accent>=.9?90:130,at);osc.frequency.exponentialRampToValueAtTime(45,at+.25);
   strike(env,at,Math.min(end,at+.35),.4*note.accent);
   break;
 }
 osc.connect(env).connect(out);osc.start(at);osc.stop(end+.02);
 return true;
}

/**
 * Renders the plan (mono, low sample rate: it sits underneath). `parts` says which players play each part
 * (ORIGINAL_PLAYER or an instrument id) and `voices` how each instrument id sounds.
 */
export async function renderBackground(plan:BackgroundPlan,parts:Record<BackgroundPart,string[]>,voices:Readonly<Record<string,InstrumentRecipe>>):Promise<AudioBuffer>{
 const {seconds}=plan;
 const Offline=window.OfflineAudioContext||(window as unknown as {webkitOfflineAudioContext:OfflineConstructor}).webkitOfflineAudioContext;
 const ctx=new Offline(1,Math.max(1,Math.ceil(seconds*SAMPLE_RATE)),SAMPLE_RATE);
 // Fade in and out over the whole piece, then make room under the child's sounds (the plan's duck points).
 const fade=ctx.createGain(),duck=ctx.createGain();
 fade.gain.setValueAtTime(0,0);fade.gain.linearRampToValueAtTime(1,plan.fadeInSeconds);
 fade.gain.setValueAtTime(1,seconds-plan.fadeOutSeconds);fade.gain.linearRampToValueAtTime(0,seconds);
 duck.gain.setValueAtTime(plan.duck[0]?.gain??1,0);for(const point of plan.duck.slice(1))duck.gain.linearRampToValueAtTime(point.gain,point.at);
 const voiceOf=(player:string):Voice=>player===ORIGINAL_PLAYER?'original':voices[player]??'original';
 const bright=Object.values(parts).some(players=>players.some(player=>voiceOf(player)==='bells'));
 const tone=ctx.createBiquadFilter();tone.type='lowpass';tone.frequency.value=bright?5200:2400;
 fade.connect(duck).connect(tone).connect(ctx.destination);
 for(const [part,players] of Object.entries(parts) as [BackgroundPart,string[]][]){
  if(!players.length)continue;
  // Several players on one part: keep the part about as loud as one.
  const level=ctx.createGain();level.gain.value=1/Math.sqrt(players.length);level.connect(fade);
  for(const player of players)for(const note of plan.notes)if(note.part===part)play(ctx,level,voiceOf(player),note);
 }
 return ctx.startRendering();
}
