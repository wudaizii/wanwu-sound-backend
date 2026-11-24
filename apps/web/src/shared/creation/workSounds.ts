// The audio behind a work's sound units, shared by 万物声场 and 万物成曲: original buffers by source (this visit's
// recordings from the archive, or the bundled example clips), their 声音体检, and shaped renders cached per source +
// shape (+ excerpt). Originals are only read; every render is a new buffer.
import type {SourceClip} from '@wanwu-v2/contracts/arrangement';
import type {ChosenShape,SoundAnalysis} from '@wanwu-v2/contracts/sound';
import {AudioLoadError,loadAudio} from '../audio/loadAudio';
import {planCard,planClip,shapeKey} from '@wanwu-v2/sound-rules/shaping';
import {renderShaped} from '../audio/renderShaped';
import {analysisOf} from '../audio/soundAnalysis';
import {exampleSourceUrl} from './exampleSounds';
import {sessionArchive} from './sourceArchive';
import {authorizedSource} from '../audio/authorizedSource';

/** The recording only existed in an earlier visit (e.g. after a refresh) — it cannot be found any more. */
export class MissingAudioError extends Error{}
export type SoundFailure='missing-audio'|'load-failed'|'no-audio';
/** What to tell the child when a sound could not be prepared; null for a cancelled load (nothing to say). */
export function soundFailure(reason:unknown):SoundFailure|null{
 if(reason instanceof AudioLoadError&&reason.reason==='aborted')return null;
 return reason instanceof MissingAudioError?'missing-audio':reason instanceof AudioLoadError?'load-failed':'no-audio';
}

export class WorkSoundBank{
 private buffers=new Map<string,AudioBuffer>();
 private pending=new Map<string,Promise<AudioBuffer>>();
 private renders=new Map<string,AudioBuffer>();
 private loads=new Set<AbortController>();
 /** `onLength` hears each source's real length (ms) once its audio is decoded. */
 constructor(private timeoutMs:number,private onLength:(sourceId:string,durationMs:number)=>void=()=>{}){}

 source(sourceId:string):Promise<AudioBuffer>{
  const known=this.buffers.get(sourceId);if(known)return Promise.resolve(known);
  const local=sessionArchive.buffer(sourceId);
  if(local)return Promise.resolve(this.learn(sourceId,local));
  const inFlight=this.pending.get(sourceId);if(inFlight)return inFlight;
  const url=exampleSourceUrl(sourceId);
  if(!url){const cloud=authorizedSource(sourceId);return cloud?cloud.then(buffer=>this.learn(sourceId,buffer)):Promise.reject(new MissingAudioError());}
  const controller=new AbortController();this.loads.add(controller);
  const request=loadAudio(url,{signal:controller.signal,timeoutMs:this.timeoutMs})
   .then(buffer=>this.learn(sourceId,buffer))
   .finally(()=>{this.loads.delete(controller);if(this.pending.get(sourceId)===request)this.pending.delete(sourceId);});
  this.pending.set(sourceId,request);
  return request;
 }
 /** The sound card as made in 声音诞生 (palette and library previews). */
 card(sourceId:string,shape:ChosenShape){
  return this.rendered(`card|${sourceId}|${shapeKey(shape)}`,sourceId,buffer=>renderShaped(buffer,planCard(shape,analysisOf(buffer),sourceId)));
 }
 /**
  * One occurrence in the field / score: the chosen excerpt with the card's choices, planned with the unit's own
  * 声音体检 (the one the field and score time it with), so what plays is exactly as long as what is drawn.
  */
 clip(sourceId:string,shape:ChosenShape,clip:SourceClip,analysis:SoundAnalysis|null){
  return this.rendered(`clip|${sourceId}|${shapeKey(shape)}|${clip.startMs}-${clip.endMs}|${analysis?.rules??'-'}`,sourceId,
   buffer=>renderShaped(buffer,planClip(shape,clip,analysis,sourceId)));
 }
 /** The 声音体检 of a source whose audio is already here (null while it is still loading). */
 analysisNow(sourceId:string){const buffer=this.buffers.get(sourceId)??sessionArchive.buffer(sourceId);return buffer?analysisOf(buffer):null;}
 /** Cancel loads still in flight (leaving the page). */
 abort(){for(const controller of this.loads)controller.abort();this.pending.clear();}

 private learn(sourceId:string,buffer:AudioBuffer){
  this.buffers.set(sourceId,buffer);this.onLength(sourceId,Math.round(buffer.duration*1000));
  return buffer;
 }
 private async rendered(key:string,sourceId:string,make:(buffer:AudioBuffer)=>Promise<AudioBuffer>){
  const cached=this.renders.get(key);if(cached)return cached;
  const result=await make(await this.source(sourceId));
  this.renders.set(key,result);return result;
 }
}
