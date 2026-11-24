import {useEffect,useRef,useState} from 'react';
import {audioSupported} from '../../../shared/audio/audioContext';
import {AudioLoadError,loadAudio} from '../../../shared/audio/loadAudio';
import type {SequencePlayer} from '../../../shared/audio/SequencePlayer';
import {originalGainOf} from '../../../shared/audio/soundAnalysis';
import {EXAMPLE_TIMEOUT_MS} from '../../../shared/creation/exampleSounds';
import type {SoundSource} from '@wanwu-v2/contracts/sound';
import {birthCopy} from '../config/copy';
import type {LibraryItem} from '../services/soundLibrary';
import type {Notify} from './localSource';
import {authorizedSource} from '../../../shared/audio/authorizedSource';

/** 从声音库挑选: load an item once (one request at a time), preview it, or take it as the source. */
export function useLibraryItems(player:SequencePlayer,playing:string|null,notify:Notify,cache:{get:(id:string)=>AudioBuffer|null|undefined;set:(id:string,buffer:AudioBuffer)=>void},
 onPick:(source:SoundSource,buffer:AudioBuffer)=>void){
 const [loadingId,setLoadingId]=useState<string|null>(null);
 const loads=useRef<AbortController|null>(null);
 useEffect(()=>()=>loads.current?.abort(),[]);

 const report=(reason:unknown)=>{
  if(reason instanceof AudioLoadError&&reason.reason==='aborted')return;
  notify('bar',reason instanceof AudioLoadError&&reason.reason==='decode'?birthCopy.fileUnreadable:birthCopy.slowNetwork);
 };
 const itemBuffer=async(item:LibraryItem)=>{
  if(item.cloud){const pending=authorizedSource(item.source.id);if(!pending)throw new AudioLoadError('network');const buffer=await pending;cache.set(item.source.id,buffer);return buffer;}
  const cached=cache.get(item.source.id);if(cached)return cached;
  if(!item.url)throw new AudioLoadError('network');
  loads.current?.abort();const controller=new AbortController();loads.current=controller;
  setLoadingId(item.source.id);
  try{const buffer=await loadAudio(item.url,{signal:controller.signal,timeoutMs:EXAMPLE_TIMEOUT_MS});cache.set(item.source.id,buffer);return buffer;}
  finally{if(loads.current===controller){loads.current=null;setLoadingId(null);}}
 };
 const preview=async(item:LibraryItem)=>{
  if(!audioSupported())return notify('bar',birthCopy.noAudio);
  const key=`item:${item.source.id}`;if(playing===key)return player.stop();
  try{const buffer=await itemBuffer(item);await player.playOne(key,buffer,originalGainOf(buffer));}catch(reason){report(reason);}
 };
 const pick=async(item:LibraryItem)=>{
  if(!audioSupported())return notify('bar',birthCopy.noAudio);
  try{
   const buffer=await itemBuffer(item);
   onPick(item.source.kind==='example'?{...item.source,durationMs:Math.round(buffer.duration*1000)}:item.source,buffer);
  }catch(reason){report(reason);}
 };
 return {loadingId,preview,pick,abort:()=>loads.current?.abort()};
}
