import {useRef,useState} from 'react';
import type {ChosenShape,SoundSource} from '@wanwu-v2/contracts/sound';
import {planCard,shapeKey} from '@wanwu-v2/sound-rules/shaping';
import {renderShaped} from '../../../shared/audio/renderShaped';
import type {SequencePlayer} from '../../../shared/audio/SequencePlayer';
import {analysisOf,originalGainOf} from '../../../shared/audio/soundAnalysis';
import {birthCopy} from '../config/copy';
import type {Notify} from './localSource';

/** Which compare target the waveform shows; also the play keys for original / current. */
export type CompareTarget='original'|'current';

/** The shaped sound: render (cached per source + shape) and play it, and keep which version the waveform shows. */
export function useShapedPreview(player:SequencePlayer,playing:string|null,notify:Notify,
 current:()=>{source:SoundSource|null;buffer:AudioBuffer|null},sourceBuffer:AudioBuffer|null,shape:ChosenShape){
 const [shown,setShown]=useState<CompareTarget>('original');
 const [currentBuffer,setCurrentBuffer]=useState<AudioBuffer|null>(null);
 const renders=useRef(new Map<string,AudioBuffer>());
 const renderToken=useRef(0);

 /** Render (cached) and play. Rapid taps only play the most recent request. */
 const play=async(next:ChosenShape,key:string,show:boolean)=>{
  const {source,buffer}=current();
  if(!source||!buffer)return;
  const token=++renderToken.current,cacheKey=`${source.id}|${shapeKey(next)}`;
  let rendered=renders.current.get(cacheKey);
  try{
   if(!rendered){rendered=await renderShaped(buffer,planCard(next,analysisOf(buffer),source.id));renders.current.set(cacheKey,rendered);}
   if(token!==renderToken.current)return;
   if(show){setCurrentBuffer(rendered);setShown('current');}
   await player.playOne(key,rendered);
  }catch{if(token===renderToken.current)notify('editor',birthCopy.noAudio);}
 };
 const playCompare=(target:CompareTarget)=>{
  if(playing===target){player.stop();return;}
  if(!sourceBuffer)return;
  if(target==='original'){renderToken.current++;setShown('original');void player.playOne('original',sourceBuffer,originalGainOf(sourceBuffer));}
  else void play(shape,'current',true);
 };
 /** The waveform's own play button plays whichever version it is showing. */
 const playShown=()=>playCompare(shown==='current'&&currentBuffer?'current':'original');
 /** A new source starts from its original. */
 const reset=()=>{setShown('original');setCurrentBuffer(null);};
 return {shown,currentBuffer,play,playCompare,playShown,reset};
}
