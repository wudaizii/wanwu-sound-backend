// Pure excerpt editing for 剪一剪: drag either edge, drag the whole window, or tap the waveform.
// Every result stays inside the recording and at least MIN_CLIP_MS long; the recording itself is never touched.
import {MIN_CLIP_MS} from '@wanwu-v2/contracts/arrangement';
import type {SourceClip} from '@wanwu-v2/contracts/arrangement';

export type ClipEdge='start'|'end';
const round=(ms:number)=>Math.round(ms);

export function dragEdge(clip:SourceClip,edge:ClipEdge,ms:number,totalMs:number):SourceClip{
 if(edge==='start')return {startMs:round(Math.min(Math.max(0,ms),clip.endMs-MIN_CLIP_MS)),endMs:clip.endMs};
 return {startMs:clip.startMs,endMs:round(Math.max(Math.min(totalMs,ms),clip.startMs+MIN_CLIP_MS))};
}

/** Slide the chosen part along the recording, keeping its length. */
export function dragWindow(clip:SourceClip,deltaMs:number,totalMs:number):SourceClip{
 const length=clip.endMs-clip.startMs;
 const startMs=round(Math.min(Math.max(0,clip.startMs+deltaMs),Math.max(0,totalMs-length)));
 return {startMs,endMs:startMs+length};
}

/** A tap outside the chosen part pulls the nearer edge to it; inside it does nothing. */
export function tapAt(clip:SourceClip,ms:number,totalMs:number):SourceClip{
 if(ms>=clip.startMs&&ms<=clip.endMs)return clip;
 return dragEdge(clip,ms<clip.startMs?'start':'end',ms,totalMs);
}

/** Keyboard on an edge handle: ←→ 0.1 s, Shift 1 s, Home / End to the limits. */
export function keyEdge(clip:SourceClip,edge:ClipEdge,key:string,shift:boolean,totalMs:number):SourceClip|null{
 const step=shift?1000:100,current=edge==='start'?clip.startMs:clip.endMs;
 switch(key){
  case 'ArrowLeft':case 'ArrowDown':return dragEdge(clip,edge,current-step,totalMs);
  case 'ArrowRight':case 'ArrowUp':return dragEdge(clip,edge,current+step,totalMs);
  case 'Home':return dragEdge(clip,edge,0,totalMs);
  case 'End':return dragEdge(clip,edge,totalMs,totalMs);
  default:return null;
 }
}

/** Child-facing seconds, one decimal: 2.6. */
export const secondsText=(ms:number)=>(Math.round(ms/100)/10).toFixed(1);
