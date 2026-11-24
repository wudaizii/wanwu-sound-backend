// Picking the part of a too-long upload to keep (声音诞生). Pure: drag either edge, slide the window, tap the
// waveform, or use the keyboard. Every result stays inside the file, at least TRIM_MIN_MS and at most the source limit.
import {SOUND_SOURCE_MAX_MS} from '@wanwu-v2/contracts/sound';

export type TrimRange={startMs:number;endMs:number};
export type TrimEdge='start'|'end';
export const TRIM_MIN_MS=1000;
/** Longer files are refused before trimming: decoding them would take too much memory on a phone. */
export const TRIM_FILE_MAX_MS=10*60_000;

const round=(ms:number)=>Math.round(ms);

/** The first part of the file, as long as allowed. */
export function initialTrim(totalMs:number):TrimRange{return {startMs:0,endMs:Math.min(totalMs,SOUND_SOURCE_MAX_MS)};}

/** Move one edge; the other edge stays, and the length stays within TRIM_MIN_MS … the source limit. */
export function dragTrimEdge(range:TrimRange,edge:TrimEdge,ms:number,totalMs:number):TrimRange{
 if(edge==='start'){
  const startMs=Math.min(Math.max(0,ms,range.endMs-SOUND_SOURCE_MAX_MS),range.endMs-TRIM_MIN_MS);
  return {startMs:round(startMs),endMs:range.endMs};
 }
 const endMs=Math.max(Math.min(totalMs,ms,range.startMs+SOUND_SOURCE_MAX_MS),range.startMs+TRIM_MIN_MS);
 return {startMs:range.startMs,endMs:round(endMs)};
}

/** Slide the kept part along the file, keeping its length. */
export function slideTrim(range:TrimRange,deltaMs:number,totalMs:number):TrimRange{
 const length=range.endMs-range.startMs;
 const startMs=round(Math.min(Math.max(0,range.startMs+deltaMs),Math.max(0,totalMs-length)));
 return {startMs,endMs:startMs+length};
}

/** A tap outside the kept part moves the whole part there (centred), so far-away moments are one tap away. */
export function tapTrim(range:TrimRange,ms:number,totalMs:number):TrimRange{
 if(ms>=range.startMs&&ms<=range.endMs)return range;
 const length=range.endMs-range.startMs;
 return slideTrim(range,ms-length/2-range.startMs,totalMs);
}

/** Keyboard on a handle: ←→ 0.5 s, Shift 5 s, Home / End to the limits; PageUp / PageDown slide the whole part 5 s. */
export function keyTrim(range:TrimRange,target:TrimEdge,key:string,shift:boolean,totalMs:number):TrimRange|null{
 const step=(shift?5000:500)*(key==='ArrowLeft'||key==='ArrowDown'?-1:1);
 const arrow=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key);
 if(key==='PageUp'||key==='PageDown')return slideTrim(range,key==='PageUp'?5000:-5000,totalMs);
 const current=target==='start'?range.startMs:range.endMs;
 if(arrow)return dragTrimEdge(range,target,current+step,totalMs);
 if(key==='Home')return dragTrimEdge(range,target,0,totalMs);
 if(key==='End')return dragTrimEdge(range,target,totalMs,totalMs);
 return null;
}

/** A position in the file, always m:ss.s (1:05.3, 0:12.4), so start and end read the same way. */
export function trimClock(ms:number){
 const tenths=Math.round(ms/100),minutes=Math.floor(tenths/600),seconds=(tenths%600)/10;
 return `${minutes}:${seconds.toFixed(1).padStart(4,'0')}`;
}
/** A length in seconds, one decimal: 36.9. */
export const trimSeconds=(ms:number)=>(Math.round(ms/100)/10).toFixed(1);
