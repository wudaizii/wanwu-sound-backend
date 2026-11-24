import {useEffect,useState} from 'react';
import {readPerformanceHints,subscribeReducedMotion} from '../../../shared/platform/capabilities';
import {useDecodedImage} from '../../../shared/media/useDecodedImage';
import {titleAssets,titleMotion} from '../config/title';
import type {IntroState} from './introState';
import {deriveTitlePhase,canAnimateTitleDecorations} from './titleMotionState';
function readStaticMode(){const h=readPerformanceHints();return h.reduced||h.saveData||h.weak||h.lowDevice;}
export function useTitleMotion(opening:IntroState,cycle:number){
 const lettering=useDecodedImage(titleAssets.lettering.variants,titleMotion.decodeDeadlineMs);
 const doodles=useDecodedImage(titleAssets.doodles.variants,titleMotion.decodeDeadlineMs);
 const bubbles=useDecodedImage(titleAssets.bubbles.variants,titleMotion.decodeDeadlineMs);
 const [staticMode,setStaticMode]=useState(readStaticMode),[paused,setPaused]=useState(()=>document.hidden);
 const [completed,setCompleted]=useState<number|null>(null);
 useEffect(()=>subscribeReducedMotion(()=>{setStaticMode(readStaticMode());setCompleted(cycle);}),[cycle]);
 useEffect(()=>{
  const hidden=()=>{setPaused(document.hidden);if(document.hidden)setCompleted(cycle);};
  document.addEventListener('visibilitychange',hidden);return()=>document.removeEventListener('visibilitychange',hidden);
 },[cycle]);
 const phase=deriveTitlePhase({ready:lettering.ready,failed:lettering.failed,staticMode,completed:completed===cycle,opening});
 useEffect(()=>{if(phase!=='entering'||paused)return;const timer=setTimeout(()=>setCompleted(cycle),titleMotion.totalEnterMs);return()=>clearTimeout(timer);},[phase,paused,cycle]);
 return {lettering,doodles,bubbles,phase,ambient:canAnimateTitleDecorations(phase,staticMode,paused),paused};
}
