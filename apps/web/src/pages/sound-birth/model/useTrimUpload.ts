import {useState} from 'react';
import type {SoundSource} from '@wanwu-v2/contracts/sound';
import type {SequencePlayer} from '../../../shared/audio/SequencePlayer';
import {sliceBuffer} from '../../../shared/audio/sliceBuffer';
import {originalGainOf} from '../../../shared/audio/soundAnalysis';
import {initialTrim} from './trimEditing';
import type {TrimRange} from './trimEditing';

/** `from`: the library source being trimmed (a long example), or null for an uploaded file. */
type Trim={buffer:AudioBuffer;label:string;mimeType:string;range:TrimRange;from:SoundSource|null;original:Blob|null};
export type TrimUse={label:string;part:AudioBuffer;mimeType:string;range:TrimRange;from:SoundSource|null;original:Blob|null;rawDurationMs:number};

/** A too-long sound being trimmed (an upload or a long library example): the decoded audio (only read), its name and
 *  the part to keep. The child picks the part; nothing is cut for them. */
export function useTrimUpload(player:SequencePlayer,playing:string|null,onUse:(use:TrimUse)=>void){
 const [trim,setTrim]=useState<Trim|null>(null);
 const start=(buffer:AudioBuffer,label:string,mimeType:string,from:SoundSource|null=null,original:Blob|null=null)=>{player.stop();setTrim({buffer,label,mimeType,from,original,range:initialTrim(Math.round(buffer.duration*1000))});};
 const setRange=(range:TrimRange)=>{if(playing==='trim')player.stop();setTrim(current=>current&&{...current,range});};
 const listen=()=>{
  if(!trim)return;if(playing==='trim')return player.stop();
  const part=sliceBuffer(trim.buffer,trim.range.startMs,trim.range.endMs);
  void player.playOne('trim',part,originalGainOf(part));
 };
 const use=()=>{
  if(!trim)return;
  onUse({label:trim.label,part:sliceBuffer(trim.buffer,trim.range.startMs,trim.range.endMs),mimeType:trim.mimeType,range:trim.range,from:trim.from,original:trim.original,rawDurationMs:trim.buffer.duration*1000});setTrim(null);
 };
 return {trim,start,setRange,listen,use,cancel:()=>setTrim(null)};
}
