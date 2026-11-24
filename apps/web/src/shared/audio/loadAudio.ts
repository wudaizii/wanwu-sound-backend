import {RENDER_SAMPLE_RATE} from '@wanwu-v2/audio-engine/pcm';
let decoder:OfflineAudioContext|null=null;

export class AudioLoadError extends Error{
 readonly reason:'timeout'|'network'|'decode'|'aborted';
 constructor(reason:'timeout'|'network'|'decode'|'aborted'){super(reason);this.reason=reason;}
}

export async function decodeAudio(bytes:ArrayBuffer){
 try{
  const Offline=window.OfflineAudioContext||(window as unknown as {webkitOfflineAudioContext:typeof OfflineAudioContext}).webkitOfflineAudioContext;
  decoder??=new Offline(1,1,RENDER_SAMPLE_RATE);
  return await decoder.decodeAudioData(bytes);
 }catch{throw new AudioLoadError('decode');}
}

/** Fetch + decode with a deadline, so a weak connection ends in a clear retry state instead of an endless spinner. */
export async function loadAudio(url:string,{signal,timeoutMs}:{signal?:AbortSignal;timeoutMs:number}){
 const controller=new AbortController();
 let timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
 const forward=()=>controller.abort();
 signal?.addEventListener('abort',forward,{once:true});
 try{
  let response:Response;
  try{response=await fetch(url,{signal:controller.signal});}
  catch{throw new AudioLoadError(timedOut?'timeout':signal?.aborted?'aborted':'network');}
  if(!response.ok)throw new AudioLoadError('network');
  let bytes:ArrayBuffer;
  try{bytes=await response.arrayBuffer();}catch{throw new AudioLoadError(timedOut?'timeout':signal?.aborted?'aborted':'network');}
  return await decodeAudio(bytes);
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',forward);}
}
