// 课堂大屏: on an electronic blackboard the work pages (万物声场, 万物成曲) go full screen with larger type, larger sound
// markers and a stronger "now sounding" glow. The page that offers it sets `data-classroom` on <html> while it is open;
// the type tokens (styles/typography.css) and each component's own classroom rules read that. The choice is remembered
// on this device only (a convenience: it works the same when storage is blocked).
import {useEffect,useState} from 'react';

const KEY='wanwu:classroom';
const read=()=>{try{return localStorage.getItem(KEY)==='on';}catch{return false;}};
const write=(on:boolean)=>{try{if(on)localStorage.setItem(KEY,'on');else localStorage.removeItem(KEY);}catch{/* storage blocked: still works for this visit */}};

export function useClassroom(){
 const [on,setOn]=useState(read);
 useEffect(()=>{
  const root=document.documentElement;
  if(on)root.dataset.classroom='on';else delete root.dataset.classroom;
  return()=>{delete root.dataset.classroom;};
 },[on]);
 /** Turning it on also asks for full screen (a tap, so the browser allows it); turning it off leaves full screen. */
 const toggle=()=>{
  const next=!on;setOn(next);write(next);
  if(next&&!document.fullscreenElement)void document.documentElement.requestFullscreen?.().catch(()=>{});
  if(!next&&document.fullscreenElement)void document.exitFullscreen?.().catch(()=>{});
 };
 return {on,toggle};
}
export type Classroom=ReturnType<typeof useClassroom>;
