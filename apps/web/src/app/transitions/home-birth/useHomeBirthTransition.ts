import {useCallback,useEffect,useLayoutEffect,useReducer,useRef,useState} from 'react';
import {readPerformanceHints,subscribeReducedMotion} from '../../../shared/platform/capabilities';
import {homeBirthMotion} from './config';
import {transitionHomeBirth} from './transitionState';
import {media} from '../../../styles/breakpoints';

export function useHomeBirthTransition(page:string,onNavigate:()=>void){
 const [phase,dispatch]=useReducer(transitionHomeBirth,'idle');
 const [scrollOffset,setScrollOffset]=useState(0);
 const locked=useRef(false);
 // History/back or another route must release the outgoing page and all interaction locks.
 useLayoutEffect(()=>{
  if(page!=='sound-birth'&&phase!=='idle')dispatch('CANCEL');
  if(phase==='idle')locked.current=false;
 },[page,phase]);
 useEffect(()=>{
  if(phase==='idle')return;
  const timer=setTimeout(()=>dispatch(phase==='preparing'?'TIMEOUT':'FINISHED'),
   phase==='preparing'?homeBirthMotion.prepareLimitMs:homeBirthMotion.durationMs);
  return()=>clearTimeout(timer);
 },[phase]);
 useEffect(()=>subscribeReducedMotion(()=>{
  if(matchMedia(media['reduced-motion']).matches)dispatch('CANCEL');
 }),[]);
 const start=useCallback(()=>{
  if(locked.current||page!=='home')return;
  locked.current=true;
  const hints=readPerformanceHints();
  if(!hints.reduced&&!hints.saveData&&!hints.weak){
   setScrollOffset(window.scrollY);
   dispatch('START');
  }
  // Mount the real destination immediately, keeping the current home in front until it is ready.
  onNavigate();
 },[page,onNavigate]);
 const ready=useCallback(()=>dispatch('READY'),[]);
 return {phase,scrollOffset,start,ready};
}
