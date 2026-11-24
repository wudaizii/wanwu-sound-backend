import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {RefObject} from 'react';
import {audioSupported} from '../../../shared/audio/audioContext';
import {SequencePlayer} from '../../../shared/audio/SequencePlayer';
import type {SequenceVoice} from '../../../shared/audio/SequencePlayer';
import {MIX_RULES} from '@wanwu-v2/sound-rules/mix';
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import {pieceSeconds,planPlayback} from '../../../shared/creation/arrangementTiming';
import {EXAMPLE_TIMEOUT_MS} from '../../../shared/creation/exampleSounds';
import {WorkSoundBank,soundFailure} from '../../../shared/creation/workSounds';
import type {ComposeNoticeKey,ComposeState} from './composeState';
import {soundingAt} from './scoreLayout';
import type {ScoreLayout} from './scoreLayout';

const PIECE='piece';
/** Pressing play this close to the end starts again from the top. */
const END_SLACK=.05;
type Music={gain:number;key:string;buffer:(arrangement:Arrangement)=>Promise<AudioBuffer>};

/** One clock for the whole piece: play / pause / seek / scrub, the background as its own layer, and what sounds now. */
export function usePiecePlayback(latest:RefObject<ComposeState>,notify:(key:ComposeNoticeKey,tone?:'info'|'error')=>void,music:Music,layout:ScoreLayout|null){
 const [playing,setPlaying]=useState(false);
 const [preparing,setPreparing]=useState(false);
 /** Where playback stands while it is not running (paused / sought / at the start), in seconds. */
 const [position,setPosition]=useState(0);
 /** Seconds from the audio clock while playing. */
 const [clock,setClock]=useState(0);
 const [ended,setEnded]=useState(false);
 /** True while this hook stops the player itself, so only a natural end counts as "finished". */
 const halting=useRef(false);
 const player=useMemo(()=>new SequencePlayer(key=>{
  setPlaying(key===PIECE);
  if(key===null&&!halting.current){setPosition(0);setEnded(true);}
 }),[]);
 const bank=useMemo(()=>new WorkSoundBank(EXAMPLE_TIMEOUT_MS),[]);
 const token=useRef(0);
 const positionRef=useRef(position);positionRef.current=position;
 const latestGain=useRef(music.gain);latestGain.current=music.gain;
 const halt=useCallback(()=>{halting.current=true;player.stop();halting.current=false;},[player]);

 // The playhead, progress bar and highlights all follow the audio clock while the piece plays.
 useEffect(()=>{
  if(!playing)return;
  let frame=0;const tick=()=>{setClock(player.elapsed()??0);frame=requestAnimationFrame(tick);};
  frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[playing,player]);

 // Hiding the tab pauses where it is; leaving the page stops sound and pending loads.
 useEffect(()=>{
  const hidden=()=>{if(document.visibilityState==='hidden'&&player.activeKey()===PIECE){token.current++;setPosition(player.elapsed()??0);halt();}};
  document.addEventListener('visibilitychange',hidden);
  return()=>{document.removeEventListener('visibilitychange',hidden);token.current++;halt();bank.abort();};
 },[player,bank,halt]);

 // Know every source early so the first play starts quickly.
 const sourceIds=latest.current.arrangement?.units.map(unit=>unit.sourceId).join('|')??'';
 useEffect(()=>{
  for(const sourceId of sourceIds.split('|'))if(sourceId)void bank.source(sourceId).catch(()=>{});
 },[sourceIds,bank]);

 /** Play from a moment; `continue` keeps going from wherever the running piece is once the new one is ready. */
 const start=async(from:number|'continue')=>{
  const work=latest.current.arrangement;
  if(!work?.events.length)return notify('need-event','info');
  if(!audioSupported())return notify('no-audio');
  const mine=++token.current;setPreparing(true);if(from!=='continue')setPosition(from);
  try{
   const plan=planPlayback(work),total=pieceSeconds(work);
   const sounds=await Promise.all(plan.map(item=>bank.clip(item.sourceId,item.shape,item.clip,item.analysis)));
   // The background is its own layer: if it cannot be made, the child's sounds still play.
   const under=await music.buffer(work).catch(()=>{notify('background-failed');return null;});
   if(mine!==token.current)return;
   const voices:SequenceVoice[]=plan.map((item,index)=>({at:item.startSeconds,buffer:sounds[index]!}));
   if(under)voices.push({at:0,buffer:under,layer:'background'});
   const at=from==='continue'?player.elapsed()??positionRef.current:from;
   halt();
   await player.play(PIECE,voices,MIX_RULES.childGain,{from:at,length:total,layers:{background:latestGain.current},limiter:MIX_RULES.limiter});
   setClock(at);setEnded(false);
  }catch(reason){if(mine===token.current){const failure=soundFailure(reason);if(failure)notify(failure);}}
  finally{if(mine===token.current)setPreparing(false);}
 };
 /** Pause where the clock is (or cancel a play that is still preparing). */
 const pause=()=>{
  token.current++;setPreparing(false);
  if(player.activeKey()===PIECE)setPosition(player.elapsed()??positionRef.current);
  halt();
 };
 const total=layout?.totalSeconds??0;
 const togglePlay=()=>{
  if(player.activeKey()===PIECE||preparing)return pause();
  void start(positionRef.current>=total-END_SLACK?0:positionRef.current);
 };
 /** 从头听: always from 0 and playing. */
 const restart=()=>{setEnded(false);void start(0);};
 /** Jump to a moment (tap on the score or a sound): play from there. */
 const playFrom=(seconds:number)=>{setEnded(false);void start(Math.min(Math.max(0,seconds),total));};
 // Dragging the progress bar: pause while dragging, resume on release if it was playing.
 const scrub=useRef<{resume:boolean}|null>(null);
 const scrubTo=(seconds:number)=>{
  if(!scrub.current){scrub.current={resume:player.activeKey()===PIECE||preparing};token.current++;setPreparing(false);halt();}
  setEnded(false);setPosition(Math.min(Math.max(0,seconds),total));
 };
 const endScrub=()=>{const resume=scrub.current?.resume;scrub.current=null;if(resume)void start(positionRef.current);};
 /** A new length changes the whole piece: stop and go back to the start. */
 const reset=()=>{token.current++;setPreparing(false);halt();setPosition(0);setEnded(false);};

 // Background on / off and volume change live, without restarting.
 useEffect(()=>{player.setLayerGain('background',music.gain);},[music.gain,player]);
 // A different background (or rhythm) needs a new render: carry on from the same moment.
 const firstKey=useRef(true);
 useEffect(()=>{
  if(firstKey.current){firstKey.current=false;return;}
  if(player.activeKey()===PIECE)void start('continue');
 // Only when the background itself changes.
 },[music.key]);

 const now=playing?clock:position;
 const sounding=useMemo(()=>layout&&(playing||position>0)?soundingAt(layout.items,now):new Set<string>(),[layout,playing,position,now]);
 return {playing,preparing,ended,now,total,sounding,togglePlay,restart,playFrom,scrubTo,endScrub,pause,reset};
}
