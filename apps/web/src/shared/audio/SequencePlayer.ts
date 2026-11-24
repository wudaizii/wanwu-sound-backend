import {getAudioContext,resumeAudio} from './audioContext';

/** `layer` groups voices under one live volume control (e.g. a background under the child's sounds). */
export type SequenceVoice={at:number;buffer:AudioBuffer;layer?:string};
/** A limiter on the sum (numbers from the mix rules), so layered sounds never clip. */
export type Limiter={thresholdDb:number;kneeDb:number;ratio:number;attackSeconds:number;releaseSeconds:number};
/**
 * `from`: start this many seconds into the sequence (resume / seek). `length`: how long the sequence lasts, when it
 * should run past its last sound (silence keeps the clock going until then). `layers`: starting gain per layer.
 * `limiter`: put a limiter on the sum.
 */
export type SequenceOptions={from?:number;length?:number;layers?:Record<string,number>;limiter?:Limiter};
type Playing={key:string;nodes:AudioBufferSourceNode[];master:GainNode;limiter:DynamicsCompressorNode|null;layers:Map<string,GainNode>;startedAt:number;from:number;duration:number;remaining:number};

/**
 * Several decoded buffers scheduled on one audio clock (a single preview is a sequence of one).
 * A new play preempts the previous one, so only one thing sounds at a time. Elapsed time comes from the audio clock,
 * so a playhead, a progress bar and "now sounding" highlights can all read the same time.
 */
export class SequencePlayer{
 private current:Playing|null=null;
 private onChange:(key:string|null)=>void;
 constructor(onChange:(key:string|null)=>void){this.onChange=onChange;}
 async play(key:string,voices:readonly SequenceVoice[],gain=1,{from=0,length,layers={},limiter}:SequenceOptions={}){
  this.stop();
  if(!voices.length)return;
  const duration=length??Math.max(...voices.map(voice=>voice.at+voice.buffer.duration));
  const start=Math.min(Math.max(0,from),duration);
  const ctx=await resumeAudio();
  const master=ctx.createGain();master.gain.value=gain;
  let limit:DynamicsCompressorNode|null=null;
  if(limiter){
   limit=ctx.createDynamicsCompressor();
   limit.threshold.value=limiter.thresholdDb;limit.knee.value=limiter.kneeDb;limit.ratio.value=limiter.ratio;
   limit.attack.value=limiter.attackSeconds;limit.release.value=limiter.releaseSeconds;
   master.connect(limit).connect(ctx.destination);
  }else master.connect(ctx.destination);
  const layerNodes=new Map<string,GainNode>();
  const output=(layer:string|undefined)=>{
   if(!layer)return master;
   let node=layerNodes.get(layer);
   if(!node){node=ctx.createGain();node.gain.value=layers[layer]??1;node.connect(master);layerNodes.set(layer,node);}
   return node;
  };
  // A short lead keeps the first sound from being clipped while the graph starts.
  const startedAt=ctx.currentTime+.04;
  const playing:Playing={key,nodes:[],master,limiter:limit,layers:layerNodes,startedAt,from:start,duration,remaining:0};
  const finish=()=>{if(this.current!==playing)return;if(--playing.remaining===0){this.release(playing);this.current=null;this.onChange(null);}};
  for(const voice of voices){
   // Voices that ended before `from` are skipped; one already under way starts part-way through.
   if(voice.at+voice.buffer.duration<=start)continue;
   const node=ctx.createBufferSource();node.buffer=voice.buffer;node.connect(output(voice.layer));
   node.onended=finish;
   node.start(startedAt+Math.max(0,voice.at-start),Math.max(0,start-voice.at));playing.nodes.push(node);
  }
  // A silent end mark keeps the sequence (and its clock) alive until `duration`, even after the last sound.
  const end=ctx.createBufferSource();end.buffer=ctx.createBuffer(1,1,ctx.sampleRate);end.connect(master);
  end.onended=finish;end.start(startedAt+Math.max(0,duration-start));playing.nodes.push(end);
  playing.remaining=playing.nodes.length;
  this.current=playing;this.onChange(key);
 }
 /** One buffer on its own (previews, the original, a recorded take). */
 playOne(key:string,buffer:AudioBuffer,gain=1){return this.play(key,[{at:0,buffer}],gain);}
 /** Change one layer's volume while it plays (smoothly, so it never clicks). */
 setLayerGain(layer:string,gain:number){
  const node=this.current?.layers.get(layer);if(!node)return;
  node.gain.setTargetAtTime(gain,getAudioContext().currentTime,.05);
 }
 /** 0–1 of the active sequence, or null when idle. */
 progress(){
  const elapsed=this.elapsed();
  return elapsed===null||!this.current?null:Math.min(1,elapsed/this.current.duration);
 }
 /** Seconds into the sequence (counting `from`; holds still during the lead-in), or null when idle. */
 elapsed(){
  const playing=this.current;if(!playing)return null;
  return Math.min(playing.duration,playing.from+Math.max(0,getAudioContext().currentTime-playing.startedAt));
 }
 activeKey(){return this.current?.key??null;}
 stop(){
  const playing=this.current;if(!playing)return;
  this.current=null;this.release(playing);this.onChange(null);
 }
 private release(playing:Playing){
  for(const node of playing.nodes){node.onended=null;try{node.stop();}catch{/* already stopped */}node.disconnect();}
  for(const node of playing.layers.values())node.disconnect();
  playing.master.disconnect();playing.limiter?.disconnect();
 }
}
