// Shared time-keeping pitch and stretch: short overlapping Hann-windowed slices of the source, each read at
// the pitch for its moment, laid out so the output moves through the source at 1 / stretch speed. Pitch and length are
// independent: 高低 never changes how long a sound is, and 长短 never changes its pitch.
import type {PlanEvent,ShapingPlan} from '@wanwu-v2/sound-rules/shaping';

const CURVE=64;
const hann=Float32Array.from({length:CURVE},(_,i)=>Math.sin(Math.PI*i/(CURVE-1))**2);
/** The first grain starts at full level so the event's own envelope decides its attack. */
const falling=Float32Array.from({length:CURVE},(_,i)=>Math.cos(Math.PI/2*i/(CURVE-1))**2);

/** Cents at `t` seconds into an event: transposition, 变化 bend across the event, 有起伏 vibrato. */
function centsAt(plan:ShapingPlan,event:PlanEvent,t:number){
 const wave=plan.wave?plan.wave.depthCents*Math.sin(2*Math.PI*plan.wave.rateHz*t):0;
 return plan.semitones*100+event.bendCents*Math.min(1,t/Math.max(.001,event.length))+wave;
}

export function scheduleGrains(ctx:BaseAudioContext,source:AudioBuffer,plan:ShapingPlan,event:PlanEvent,output:AudioNode){
 const grain=plan.grainSeconds??.08,hop=grain/2,last=source.duration-.001;
 // A bus is reused only AFTER its previous grain (including the original 5 ms stop padding) has ended.
 // Its exact Hann/falling curve and times stay unchanged. Usually three buses replace thousands of always-
 // connected GainNodes; at most one live grain uses a bus, so this does not combine different envelopes.
 const padding=.005,count=Math.ceil((grain+padding)/hop);
 const windows=Array.from({length:count},()=>{const gain=ctx.createGain();gain.gain.value=0;gain.connect(output);return gain;});
 for(let k=0;k*hop<event.length;k++){
  const centre=k*hop,start=k===0?centre:centre-hop,length=k===0?hop:grain;
  const rate=2**(centsAt(plan,event,centre)/1200);
  const node=ctx.createBufferSource(),window=windows[k%count]!;
  node.buffer=source;node.playbackRate.value=rate;
  window.gain.setValueCurveAtTime(k===0?falling:hann,event.at+start,length);
  node.connect(window);
  // The grain's middle lines up with where the event is in the source at that moment.
  const offset=event.from+centre/plan.stretch-(k===0?0:hop*rate);
  node.start(event.at+start,Math.max(0,Math.min(offset,last)));node.stop(event.at+start+length+padding);
 }
}
