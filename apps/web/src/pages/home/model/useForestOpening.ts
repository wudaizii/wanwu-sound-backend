import {useCallback,useEffect,useRef,useState} from 'react';
import type {RefObject} from 'react';
import {readPerformanceHints,readSessionFlag,subscribeReducedMotion} from '../../../shared/platform/capabilities';
import {homeMotion} from '../config/scene';
import {ForestOpening} from './ForestOpening';
import {initialIntro} from './introState';
import styles from '../HomePage.module.css';
import {media} from '../../../styles/breakpoints';
function policy(){
 return {...readPerformanceHints(),
  seen:readSessionFlag(homeMotion.storageKey),
 };
}
export function useForestOpening(scene:RefObject<HTMLDivElement|null>,curtain:RefObject<HTMLDivElement|null>){
 const [state,setState]=useState(()=>initialIntro(policy()));
 const [attempt,setAttempt]=useState(0);
 const controller=useRef<ForestOpening|null>(null);
 useEffect(()=>{
  if(!scene.current||!curtain.current)return;
  const hints=policy();if(attempt>0){hints.seen=false;hints.lowDevice=false;hints.weak=false;}
  const opening=new ForestOpening(scene.current,curtain.current,hints,setState,{fore:styles.fore!,left:styles['fore-left']!,right:styles['fore-right']!});
  controller.current=opening;void opening.start(attempt>0);
  const hidden=()=>{if(document.hidden)opening.stop('HIDDEN');};
  const reduced=()=>{if(matchMedia(media['reduced-motion']).matches)opening.stop('REDUCED');};
  document.addEventListener('visibilitychange',hidden);const unsubscribe=subscribeReducedMotion(reduced);
  return()=>{opening.dispose();document.removeEventListener('visibilitychange',hidden);unsubscribe();};
 },[attempt,scene,curtain]);
 return {state,cycle:attempt,skip:useCallback(()=>controller.current?.stop(),[]),replay:useCallback(()=>setAttempt(n=>n+1),[])};
}
