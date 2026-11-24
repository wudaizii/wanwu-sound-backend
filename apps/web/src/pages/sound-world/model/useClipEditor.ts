import {useEffect,useMemo,useRef,useState} from 'react';
import type {KeyboardEvent,PointerEvent} from 'react';
import type {SourceClip} from '@wanwu-v2/contracts/arrangement';
import {SOUND_SOURCE_MAX_MS} from '@wanwu-v2/contracts/sound';
import {computePeaks} from '../../../shared/audio/peaks';
import {dragEdge,dragWindow,keyEdge,tapAt} from './clipEditing';
import type {ClipEdge} from './clipEditing';
import {eventOf,heardSeconds,unitOf} from './soundWorldState';
import type {SoundWorld} from './useSoundWorld';

const PEAK_BINS=160;

/**
 * 剪一剪 for one placed occurrence: loads the whole recording, keeps a draft excerpt while the child drags, and only
 * writes it back on 用这一段. Previews play the draft exactly as the field would.
 */
export function useClipEditor(world:SoundWorld,eventId:string,onDone:()=>void){
 const work=world.state.arrangement,event=eventOf(work,eventId),unit=event&&unitOf(work,event.unitId);
 const [buffer,setBuffer]=useState<AudioBuffer|null>(null);
 const [failed,setFailed]=useState(false);
 const [draft,setDraft]=useState<SourceClip|null>(event?.clip??null);
 const wave=useRef<HTMLDivElement>(null);
 const drag=useRef<{kind:ClipEdge|'window';pointer:number;x:number;clip:SourceClip}|null>(null);

 useEffect(()=>{
  if(!unit)return;
  let live=true;
  world.loadSource(unit.sourceId).then(loaded=>{if(live)setBuffer(loaded);},()=>{if(live)setFailed(true);});
  return()=>{live=false;};
 // Load once per opened sound.
 },[unit?.sourceId]);
 // Stop any preview when the editor closes.
 useEffect(()=>()=>world.stopSound(),[]);

 // A source longer than the limit (a long library example placed straight into the field) offers its first 45 s.
 const totalMs=Math.min(SOUND_SOURCE_MAX_MS,buffer?Math.round(buffer.duration*1000):world.durations[unit?.sourceId??'']??0);
 const peaks=useMemo(()=>{
  if(!buffer)return [];
  const frames=Math.min(buffer.length,Math.round(SOUND_SOURCE_MAX_MS/1000*buffer.sampleRate));
  return computePeaks(Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i).subarray(0,frames)),PEAK_BINS);
 },[buffer]);
 const clip=draft&&totalMs?{startMs:Math.min(draft.startMs,totalMs),endMs:Math.min(draft.endMs,totalMs)}:draft;

 const msAt=(clientX:number)=>{
  const box=wave.current?.getBoundingClientRect();
  return box&&totalMs?Math.min(totalMs,Math.max(0,(clientX-box.left)/box.width*totalMs)):0;
 };
 const update=(next:SourceClip)=>{world.stopSound();setDraft(next);};
 const begin=(kind:ClipEdge|'window')=>(pointer:PointerEvent<HTMLElement>)=>{
  if(!clip||pointer.button!==0)return;
  pointer.stopPropagation();pointer.preventDefault();
  try{pointer.currentTarget.setPointerCapture(pointer.pointerId);}catch{/* pointer already gone */}
  drag.current={kind,pointer:pointer.pointerId,x:pointer.clientX,clip};
 };
 const move=(pointer:PointerEvent<HTMLElement>)=>{
  const current=drag.current;if(!current||current.pointer!==pointer.pointerId)return;
  if(current.kind==='window'){
   const box=wave.current?.getBoundingClientRect();if(!box)return;
   update(dragWindow(current.clip,(pointer.clientX-current.x)/box.width*totalMs,totalMs));
  }else update(dragEdge(current.clip,current.kind,msAt(pointer.clientX),totalMs));
 };
 const end=()=>{drag.current=null;};

 // Playhead over the waveform: the whole recording, or the draft part when it plays once straight through.
 let playheadMs:number|null=null;
 if(unit&&world.playing===`source:${unit.sourceId}`)playheadMs=world.elapsed*1000;
 else if(clip&&unit&&world.playing===`clip:${eventId}`&&(!unit.shape.pattern||unit.shape.pattern==='once'||unit.shape.pattern==='fade-in'))
  playheadMs=Math.min(clip.endMs,clip.startMs+world.elapsed*1000);

 return {
  unit,event,buffer,failed,peaks,totalMs,clip,playheadMs,wave,
  heard:clip&&unit?heardSeconds(unit,{clip}):0,
  changed:!!clip&&!!event&&(clip.startMs!==event.clip.startMs||clip.endMs!==event.clip.endMs),
  edgeProps:(edge:ClipEdge)=>({
   onPointerDown:begin(edge),onPointerMove:move,onPointerUp:end,onPointerCancel:end,
   onKeyDown:(key:KeyboardEvent<HTMLElement>)=>{
    if(!clip)return;
    const next=keyEdge(clip,edge,key.key,key.shiftKey,totalMs);
    if(next){key.preventDefault();update(next);}
   },
  }),
  windowProps:{onPointerDown:begin('window'),onPointerMove:move,onPointerUp:end,onPointerCancel:end},
  tapWave:(clientX:number)=>{if(clip&&!drag.current)update(tapAt(clip,msAt(clientX),totalMs));},
  useWhole:()=>{if(totalMs)update({startMs:0,endMs:totalMs});},
  listenClip:()=>{if(clip)world.previewClip(eventId,clip);},
  listenSource:()=>{if(unit)world.previewSource(unit.sourceId);},
  apply:()=>{if(clip&&event)world.setClip(event.id,clip);onDone();},
 };
}
