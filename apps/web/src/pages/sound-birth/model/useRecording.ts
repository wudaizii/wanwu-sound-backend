import {useEffect,useRef,useState} from 'react';
import {SOUND_SOURCE_MAX_MS} from '@wanwu-v2/contracts/sound';
import {LocalRecorder,RecorderError} from '../../../shared/audio/LocalRecorder';
import {decodeAudio} from '../../../shared/audio/loadAudio';
import type {SequencePlayer} from '../../../shared/audio/SequencePlayer';
import {originalGainOf} from '../../../shared/audio/soundAnalysis';
import {birthCopy} from '../config/copy';
import type {Notify} from './localSource';

export type RecordPhase='idle'|'starting'|'recording'|'review';
export type Take={buffer:AudioBuffer;mimeType:string;original:Blob};

/** The recording dialog: idle → starting → recording → review → use / retake. The take stays in memory until used. */
export function useRecording(player:SequencePlayer,playing:string|null,notify:Notify,onUse:(take:Take)=>void){
 const [phase,setPhase]=useState<RecordPhase>('idle');
 const [ms,setMs]=useState(0);
 const [take,setTake]=useState<Take|null>(null);
 const recorder=useRef<LocalRecorder|null>(null);

 useEffect(()=>{
  if(phase!=='recording')return;
  const timer=setInterval(()=>setMs(recorder.current?.elapsedMs()??0),200);
  return()=>clearInterval(timer);
 },[phase]);
 useEffect(()=>()=>{recorder.current?.cancel();recorder.current=null;},[]);

 const open=()=>{player.stop();setTake(null);setPhase('idle');};
 const start=async()=>{
  player.stop();setTake(null);setMs(0);setPhase('starting');
  const next=new LocalRecorder();recorder.current=next;
  try{await next.start(SOUND_SOURCE_MAX_MS);if(recorder.current===next)setPhase('recording');}
  catch(reason){
   if(recorder.current===next)recorder.current=null;
   setPhase('idle');notify('bar',birthCopy.errors[reason instanceof RecorderError?reason.reason:'failed']);
  }
 };
 async function stop(){
  const active=recorder.current;if(!active)return;
  recorder.current=null;
  try{
   const blob=await active.stop();
   const buffer=await decodeAudio(await blob.arrayBuffer());
   setTake({buffer,mimeType:blob.type||'audio/webm',original:blob});setPhase('review');
  }catch(reason){setPhase('idle');notify('bar',birthCopy.errors[reason instanceof RecorderError?reason.reason:'failed']);}
 }
 const listen=()=>{if(!take)return;if(playing==='take')return player.stop();void player.playOne('take',take.buffer,originalGainOf(take.buffer));};
 const use=()=>{if(!take)return;onUse(take);setTake(null);setPhase('idle');};
 /** Closing the dialog drops a running recording and an unused take. */
 const cancel=()=>{recorder.current?.cancel();recorder.current=null;setTake(null);setPhase('idle');};
 return {phase,ms,take,open,start,stop,listen,use,cancel,active:()=>!!recorder.current};
}
