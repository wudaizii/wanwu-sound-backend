import {useMemo,useRef} from 'react';
import type {KeyboardEvent,PointerEvent} from 'react';
import {computePeaks} from '../../../shared/audio/peaks';
import {WorkSheet,sheetStyles} from '../../../shared/ui/WorkSheet';
import {birthCopy} from '../config/copy';
import {dragTrimEdge,keyTrim,slideTrim,tapTrim,trimClock,trimSeconds} from '../model/trimEditing';
import type {TrimEdge,TrimRange} from '../model/trimEditing';
import type {useSoundBirth} from '../model/useSoundBirth';
import {Equalizer} from './Equalizer';
import {Glyph} from '../../../shared/ui/PaperIcon';
import controls from './controls.module.css';
import styles from './TrimDialog.module.css';
import {ui} from '../../../shared/ui/controls';

type Birth=ReturnType<typeof useSoundBirth>;
const copy=birthCopy.trimDialog;
const BINS=160;
const pct=(ms:number,total:number)=>`${total?ms/total*100:0}%`;

/** 这段声音有点长: pick the part of a too-long upload to keep (up to the source limit). The file itself stays as it is. */
export function TrimDialog({birth}:{birth:Birth}){
 const trim=birth.trim,wave=useRef<HTMLDivElement>(null);
 const drag=useRef<{kind:TrimEdge|'window';pointer:number;x:number;range:TrimRange}|null>(null);
 // The click that ends a drag must not count as a tap on the waveform.
 const dragged=useRef(false);
 const buffer=trim?.buffer;
 const peaks=useMemo(()=>buffer?computePeaks(Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i)),BINS):[],[buffer]);
 if(!trim)return null;
 const totalMs=Math.round(trim.buffer.duration*1000),{range}=trim;
 const msAt=(clientX:number)=>{const box=wave.current?.getBoundingClientRect();return box?Math.min(totalMs,Math.max(0,(clientX-box.left)/box.width*totalMs)):0;};
 const begin=(kind:TrimEdge|'window')=>(pointer:PointerEvent<HTMLElement>)=>{
  if(pointer.button!==0)return;
  pointer.stopPropagation();pointer.preventDefault();
  try{pointer.currentTarget.setPointerCapture(pointer.pointerId);}catch{/* pointer already gone */}
  drag.current={kind,pointer:pointer.pointerId,x:pointer.clientX,range};dragged.current=true;
 };
 const move=(pointer:PointerEvent<HTMLElement>)=>{
  const current=drag.current;if(!current||current.pointer!==pointer.pointerId)return;
  if(current.kind==='window'){
   const box=wave.current?.getBoundingClientRect();if(!box)return;
   birth.setTrimRange(slideTrim(current.range,(pointer.clientX-current.x)/box.width*totalMs,totalMs));
  }else birth.setTrimRange(dragTrimEdge(current.range,current.kind,msAt(pointer.clientX),totalMs));
 };
 const end=()=>{drag.current=null;};
 const keys=(target:TrimEdge)=>(key:KeyboardEvent<HTMLElement>)=>{
  const next=keyTrim(range,target,key.key,key.shiftKey,totalMs);
  if(next){key.preventDefault();key.stopPropagation();birth.setTrimRange(next);}
 };
 const handle=(edge:TrimEdge)=>({
  role:'slider',tabIndex:0,'aria-label':edge==='start'?copy.start:copy.end,
  'aria-valuemin':0,'aria-valuemax':Math.round(totalMs/100)/10,'aria-valuenow':Math.round((edge==='start'?range.startMs:range.endMs)/100)/10,
  'aria-valuetext':`${trimSeconds(edge==='start'?range.startMs:range.endMs)} 秒`,
  onPointerDown:begin(edge),onPointerMove:move,onPointerUp:end,onPointerCancel:end,onKeyDown:keys(edge),
 } as const);
 const playheadMs=trim.playing?range.startMs+trim.progress*(range.endMs-range.startMs):null;
 return <WorkSheet title={copy.title} description={copy.description} className={styles.trimSheet} onClose={birth.closeDialog}>
  <p className={styles.trimFile}>{trim.label} · {trimSeconds(totalMs)} 秒</p>
  <div ref={wave} className={styles.trimWave} onPointerDown={()=>{dragged.current=false;}} onClick={event=>{if(dragged.current){dragged.current=false;return;}birth.setTrimRange(tapTrim(range,msAt(event.clientX),totalMs));}}>
   <svg viewBox={`0 0 ${BINS} 100`} preserveAspectRatio="none" aria-hidden="true">
    {peaks.map((peak,i)=>{const h=Math.max(4,peak*92),at=(i+.5)/BINS*totalMs,inside=at>=range.startMs&&at<=range.endMs;
     return <rect key={i} x={i+.18} width={.64} y={50-h/2} height={h} rx={.3} className={inside?styles.trimBarIn:styles.trimBar}/>;})}
   </svg>
   <div className={styles.trimWindow} style={{left:pct(range.startMs,totalMs),width:pct(range.endMs-range.startMs,totalMs)}}
    onPointerDown={begin('window')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
    <span className={styles.trimHandle} data-edge="start" {...handle('start')}><i/></span>
    <span className={styles.trimHandle} data-edge="end" {...handle('end')}><i/></span>
   </div>
   {playheadMs!==null&&<span className={styles.trimPlayhead} style={{left:pct(playheadMs,totalMs)}} aria-hidden="true"/>}
  </div>
  <div className={styles.trimScale} aria-hidden="true"><span>0:00.0</span><span>{trimClock(totalMs)}</span></div>
  <p className={styles.trimReadout} aria-live="polite">{copy.picked(trimClock(range.startMs),trimClock(range.endMs),trimSeconds(range.endMs-range.startMs))}</p>
  <div className={styles.trimTools}>
   <button type="button" className={`${ui.pill} ${ui.outline} ${controls.secondary}`} aria-pressed={trim.playing} onClick={birth.listenTrim}>{trim.playing?<Equalizer/>:<Glyph name="play"/>}{trim.playing?copy.stop:copy.listen}</button>
  </div>
  <div className={sheetStyles.actions}>
   <button type="button" className={styles.trimCancel} onClick={birth.closeDialog}>{copy.cancel}</button>
   <button type="button" className={`${ui.pill} ${ui.go} ${controls.primary}`} onClick={birth.useTrim}><Glyph name="check"/>{copy.use}</button>
  </div>
 </WorkSheet>;
}
