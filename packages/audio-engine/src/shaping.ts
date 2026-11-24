// Turns a shaping plan (from @wanwu-v2/sound-rules) into a new buffer, offline. The source buffer is only read, never
// modified. This file holds no sound rules — every number comes from the plan, i.e. from the rule files.
import type {PlanEvent,ShapingPlan} from '@wanwu-v2/sound-rules/shaping';
import {scheduleGrains} from './grains.ts';

type OfflineConstructor=typeof OfflineAudioContext;
const SHELF_HZ=3000;
const toGain=(db:number)=>10**(db/20);

/** Level over one event: a swell (wave, gust) or attack → hold → release; never a hard stop. */
function envelope(gain:AudioParam,event:PlanEvent){
 const start=event.at,end=event.at+event.length;
 gain.setValueAtTime(0,start);
 if(event.swell){gain.linearRampToValueAtTime(1,start+event.length*.4);gain.setValueAtTime(1,start+event.length*.55);gain.linearRampToValueAtTime(0,end);return;}
 const attack=Math.min(event.attackSeconds,event.length/2),release=Math.min(event.releaseSeconds,event.length-attack);
 gain.linearRampToValueAtTime(1,start+attack);gain.setValueAtTime(1,Math.max(start+attack,end-release));gain.linearRampToValueAtTime(0,end);
}

function playEvent(ctx:BaseAudioContext,source:AudioBuffer,plan:ShapingPlan,event:PlanEvent,bus:AudioNode){
 const level=ctx.createGain();level.connect(bus);
 if(event.rampDb){level.gain.setValueAtTime(event.gain*toGain(event.rampDb[0]),event.at);level.gain.linearRampToValueAtTime(event.gain*toGain(event.rampDb[1]),event.at+event.length);}
 else level.gain.value=event.gain;
 const shape=ctx.createGain();shape.gain.value=0;envelope(shape.gain,event);
 let last:AudioNode=shape;
 if(plan.wave?.gainDepth){
  // 有起伏 also breathes in level, at the same pace as the pitch.
  const breathe=ctx.createGain(),lfo=ctx.createOscillator(),depth=ctx.createGain();
  breathe.gain.value=1-plan.wave.gainDepth/2;lfo.frequency.value=plan.wave.rateHz;depth.gain.value=plan.wave.gainDepth/2;
  lfo.connect(depth).connect(breathe.gain);lfo.start(event.at);lfo.stop(event.at+event.length);
  shape.connect(breathe);last=breathe;
 }
 last.connect(level);
 let input:AudioNode=shape;
 if(event.sweep){
  const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.Q.value=.7;
  filter.frequency.setValueAtTime(event.sweep.fromHz,event.at);
  filter.frequency.exponentialRampToValueAtTime(event.sweep.toHz,event.at+Math.max(.01,event.length*event.sweep.portion));
  filter.connect(shape);input=filter;
 }
 if(plan.grainSeconds){scheduleGrains(ctx,source,plan,event,input);return;}
 const node=ctx.createBufferSource();node.buffer=source;node.connect(input);
 node.start(event.at,Math.min(Math.max(0,event.from),Math.max(0,source.duration-.001)));node.stop(event.at+event.length);
}

export async function renderShaped(source:AudioBuffer,plan:ShapingPlan):Promise<AudioBuffer>{
 const Offline=window.OfflineAudioContext||(window as unknown as {webkitOfflineAudioContext:OfflineConstructor}).webkitOfflineAudioContext;
 const sampleRate=source.sampleRate,total=Math.max(.05,plan.totalSeconds);
 const ctx=new Offline(source.numberOfChannels,Math.ceil((total+.02)*sampleRate),sampleRate);
 // Shared tone for the whole sound: level → high shelf (brighter / darker) → low-pass (softer) → out.
 const bus=ctx.createGain();bus.gain.value=plan.gain;
 const shelf=ctx.createBiquadFilter();shelf.type='highshelf';shelf.frequency.value=SHELF_HZ;shelf.gain.value=plan.highShelfDb;
 const lowpass=ctx.createBiquadFilter();lowpass.type='lowpass';lowpass.Q.value=.7;lowpass.frequency.value=Math.min(plan.lowpassHz,sampleRate/2-100);
 bus.connect(shelf).connect(lowpass).connect(ctx.destination);
 for(const event of plan.events)playEvent(ctx,source,plan,event,bus);
 return ctx.startRendering();
}
