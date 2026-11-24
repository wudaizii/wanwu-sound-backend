import {useEffect,useMemo,useRef,useState} from 'react';
import type {Dispatch,RefObject} from 'react';
import type {Arrangement,SourceClip} from '@wanwu-v2/contracts/arrangement';
import {MIX_RULES} from '@wanwu-v2/sound-rules/mix';
import type {ChosenShape,SoundAnalysis,SoundUnitDraft} from '@wanwu-v2/contracts/sound';
import {audioSupported} from '../../../shared/audio/audioContext';
import {SequencePlayer} from '../../../shared/audio/SequencePlayer';
import {originalGainOf} from '../../../shared/audio/soundAnalysis';
import {pieceSeconds} from '../../../shared/creation/arrangementTiming';
import {EXAMPLE_TIMEOUT_MS} from '../../../shared/creation/exampleSounds';
import {WorkSoundBank,soundFailure} from '../../../shared/creation/workSounds';
import {eventOf,planPlayback,unitOf} from './soundWorldState';
import type {NoticeKey,SoundWorldAction,SoundWorldState} from './soundWorldState';

type Notify=(key:NoticeKey,tone?:'info'|'error')=>void;
/** The background layer (shared with 万物成曲): whether it plays, how loud, and its render for an arrangement. */
type Background={enabled:boolean;gain:number;buffer:(arrangement:Arrangement)=>Promise<AudioBuffer>};

/** Everything the field sounds like: originals and shaped renders from the shared work sound bank, single previews,
 *  听听这段声音 (with the local background when it is on), and the clock the playheads follow. */
export function useFieldSound(latest:RefObject<SoundWorldState>,dispatch:Dispatch<SoundWorldAction>,notify:Notify,background:Background){
 const [playing,setPlaying]=useState<string|null>(null);
 const [preparing,setPreparing]=useState<string|null>(null);
 const [elapsed,setElapsed]=useState(0);
 /** Real length of each source once its audio is decoded (ms), for default excerpts and the excerpt editor. */
 const [durations,setDurations]=useState<Record<string,number>>({});
 const player=useMemo(()=>new SequencePlayer(setPlaying),[]);
 // Real lengths feed default excerpts, the excerpt editor and excerpts that reach past the recording.
 const bank=useMemo(()=>new WorkSoundBank(EXAMPLE_TIMEOUT_MS,(sourceId,durationMs)=>{
  setDurations(current=>current[sourceId]===durationMs?current:{...current,[sourceId]:durationMs});
  dispatch({type:'source-length',sourceId,durationMs});
 }),[]);
 const token=useRef(0);
 const music=useRef(background);music.current=background;
 /** When each event sounds during 听听这段声音, from the rendered buffers' real lengths. */
 const timeline=useRef<{eventId:string;start:number;end:number}[]>([]);

 // Playheads (field and excerpt editor) follow the audio clock only while something plays.
 useEffect(()=>{
  if(!playing){setElapsed(0);return;}
  let frame=0;const tick=()=>{setElapsed(player.elapsed()??0);frame=requestAnimationFrame(tick);};
  frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[playing,player]);

 // Hiding the tab or leaving the page stops sound and pending loads.
 useEffect(()=>{
  const hidden=()=>{if(document.visibilityState==='hidden'){token.current++;player.stop();}};
  document.addEventListener('visibilitychange',hidden);
  return()=>{document.removeEventListener('visibilitychange',hidden);token.current++;player.stop();bank.abort();};
 },[player,bank]);

 // Know every sound's real length early (examples are ~20 KB), so excerpts and tails are right from the start.
 const sourceIds=latest.current.arrangement?.units.map(unit=>unit.sourceId).join('|')??'';
 useEffect(()=>{
  for(const sourceId of sourceIds.split('|'))if(sourceId)void bank.source(sourceId).catch(()=>{});
 // Only when the set of sources changes.
 },[sourceIds,bank]);

 /** A unit's excerpt as the field plays it (the unit's own 声音体检 keeps it as long as its tail). */
 const clipSound=(unit:{sourceId:string;shape:ChosenShape;analysis?:SoundAnalysis|null},clip:SourceClip)=>bank.clip(unit.sourceId,unit.shape,clip,unit.analysis??null);
 const report=(reason:unknown)=>{const failure=soundFailure(reason);if(failure)notify(failure);};
 /** Prepare then play one buffer; rapid taps only play the latest request; tapping what plays stops it. */
 const playOne=async(key:string,make:()=>Promise<AudioBuffer>,{toggle=true,gain=1}:{toggle?:boolean;gain?:number|((buffer:AudioBuffer)=>number)}={})=>{
  if(!audioSupported())return notify('no-audio');
  if(toggle&&player.activeKey()===key){token.current++;player.stop();return;}
  const mine=++token.current;setPreparing(key);
  try{
   const buffer=await make();
   if(mine===token.current)await player.playOne(key,buffer,typeof gain==='number'?gain:gain(buffer));
  }catch(reason){if(mine===token.current)report(reason);}
  finally{if(mine===token.current)setPreparing(null);}
 };

 /** A sound card as the child made it (its own five choices), whether or not it is in the work yet. */
 const previewUnit=(unit:SoundUnitDraft)=>void playOne(`unit:${unit.id}`,()=>bank.card(unit.sourceId,unit.shape));
 const previewEvent=(eventId:string,toggle=true)=>{
  const work=latest.current.arrangement,event=eventOf(work,eventId),unit=event&&unitOf(work,event.unitId);
  if(event&&unit)void playOne(`event:${event.id}`,()=>clipSound(unit,event.clip),{toggle});
 };
 /** Excerpt editor: hear a draft excerpt as it would sound in the field, or the whole original recording. */
 const previewClip=(eventId:string,clip:SourceClip)=>{
  const work=latest.current.arrangement,event=eventOf(work,eventId),unit=event&&unitOf(work,event.unitId);
  if(unit)void playOne(`clip:${eventId}`,()=>clipSound(unit,clip));
 };
 const previewSource=(sourceId:string)=>void playOne(`source:${sourceId}`,()=>bank.source(sourceId),{gain:originalGainOf});
 const stopSound=()=>{token.current++;player.stop();setPreparing(null);};

 const playAll=async()=>{
  if(!audioSupported())return notify('no-audio');
  if(player.activeKey()==='all'||preparing==='all'){stopSound();return;}
  const work=latest.current.arrangement;
  if(!work?.events.length)return notify('need-event','info');
  const plan=planPlayback(work),mine=++token.current;
  player.stop();setPreparing('all');
  try{
   const layer=music.current;
   const sounds=await Promise.all(plan.map(item=>clipSound(item,item.clip)));
   // The background is its own layer: if it cannot be made, the child's sounds still play.
   const under=layer.enabled?await layer.buffer(work).catch(()=>{notify('background-failed');return null;}):null;
   if(mine!==token.current)return;
   timeline.current=plan.map((item,index)=>({eventId:item.eventId,start:item.startSeconds,end:item.startSeconds+sounds[index]!.duration}));
   const voices=plan.map((item,index)=>({at:item.startSeconds,buffer:sounds[index]!}));
   // With the background, the whole chosen length plays (the background ends there); without it, until the last sound.
   await player.play('all',under?[...voices,{at:0,buffer:under,layer:'background'}]:voices,MIX_RULES.childGain,
    {length:under?pieceSeconds(work):undefined,layers:{background:layer.gain},limiter:MIX_RULES.limiter});
  }catch(reason){if(mine===token.current)report(reason);}
  finally{if(mine===token.current)setPreparing(null);}
 };
 /** Edits change what the field would play, so a running full playback stops. */
 const stopAll=()=>{if(player.activeKey()==='all'||preparing==='all')stopSound();};

 // What sounds right now: during the full playback, events whose time span contains the clock.
 const sounding=useMemo(()=>{
  if(playing==='all')return new Set(timeline.current.filter(item=>elapsed>=item.start&&elapsed<item.end).map(item=>item.eventId));
  if(playing?.startsWith('event:'))return new Set([playing.slice(6)]);
  return new Set<string>();
 },[playing,elapsed]);

 return {player,bank,playing,preparing,elapsed,durations,sounding,clipSound,playOne,
  previewUnit,previewEvent,previewClip,previewSource,stopSound,playAll,stopAll};
}
