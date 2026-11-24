import {useEffect,useMemo,useRef,useState} from 'react';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import type {Inspiration} from '@wanwu-v2/contracts/work';
import {audioSupported} from '../audio/audioContext';
import {SequencePlayer} from '../audio/SequencePlayer';
import {Glyph,PaperIcon} from '../ui/PaperIcon';
import {WorkSheet,sheetStyles} from '../ui/WorkSheet';
import {trackRhythm} from './catalog';
import {inspirationCopy as copy} from './copy';
import type {InspirationMatch} from './matches';
import {renderRhythmPreview} from './rhythmPreview';
import {openingTab} from './tabs';
import type {InspirationTab} from './tabs';
import {teachingMusic} from './teachingMusic';
import type {LocalTeachingMusic,PickResult} from './teachingMusic';
import styles from './InspirationDialog.module.css';

export type {InspirationTab} from './tabs';

/**
 * One thing sounds at a time in the dialog: an example rhythm (rendered in the browser) or the picked teaching music
 * (a local file). Tapping what plays stops it; switching tabs or closing the dialog stops everything.
 */
function useListening(){
 const [playing,setPlaying]=useState<string|null>(null);
 const player=useMemo(()=>new SequencePlayer(key=>setPlaying(current=>key??(current?.startsWith('music:')?current:null))),[]);
 const audio=useRef<HTMLAudioElement|null>(null);
 const previews=useRef(new Map<string,Promise<AudioBuffer>>());
 const stop=()=>{player.stop();audio.current?.pause();setPlaying(null);};
 useEffect(()=>()=>{player.stop();audio.current?.pause();},[player]);
 const entry=async(item:TextbookTrack)=>{
  const key=`entry:${item.id}`;
  if(playing===key)return stop();
  stop();if(!audioSupported())return;
  let render=previews.current.get(item.id);
  if(!render){render=renderRhythmPreview(trackRhythm(item));previews.current.set(item.id,render);}
  setPlaying(key);
  try{await player.playOne(key,await render);}catch{setPlaying(null);}
 };
 const music=(item:LocalTeachingMusic)=>{
  const key=`music:${item.id}`;
  if(playing===key)return stop();
  stop();
  const element=audio.current??new Audio();audio.current=element;
  element.onended=()=>setPlaying(null);element.src=item.url;
  setPlaying(key);void element.play().catch(()=>setPlaying(null));
 };
 return {playing,entry,music,stop};
}

type Listening=ReturnType<typeof useListening>;

/** One song: tap the row to hear it (again to stop); 用这个 chooses it. `note` adds why it was found. */
function SongRow({entry,note,value,listening,onChange,onClose}:{entry:TextbookTrack;note?:string;value:Inspiration;listening:Listening;onChange:(next:Inspiration)=>void;onClose:()=>void}){
 const using=value.kind==='textbook'&&value.entryId===entry.id;
 const sounding=listening.playing===`entry:${entry.id}`;
 return <li data-using={using||undefined}>
  <button type="button" className={styles.entryPlay} aria-pressed={sounding} aria-label={`${sounding?copy.stopListen:copy.listen}「${entry.title}」`} onClick={()=>void listening.entry(entry)}>
   <span className={styles.playDot}><Glyph name={sounding?'stop':'play'}/></span>
   <span className={styles.entryText}><b>{entry.title}{!entry.source&&<em>{copy.example}</em>}</b><small>{copy.feel(entry)}</small>{note&&<small className={styles.why}>{note}</small>}</span>
  </button>
  <button type="button" className={styles.use} aria-pressed={using} onClick={()=>{onChange({kind:'textbook',entryId:entry.id});onClose();}}>{using?copy.using:copy.use}</button>
 </li>;
}

/**
 * 课本灵感: let the system find the songs most like the arrangement (local rules), pick a textbook song, or pick
 * teaching music on this device. Used in 万物声场 (before or while arranging) and 万物成曲. Picking teaching music keeps
 * it on this device; upload, analysis and generation are not open yet.
 */
export function InspirationDialog({value,entries,matches,initialTab,teachingOpen=false,onChange,onClose}:{value:Inspiration;entries:readonly TextbookTrack[];matches:readonly InspirationMatch[];
 /** A tab the page asks for (a 帮我找找 button); otherwise the shared opening rule (./tabs.ts). */
 initialTab?:InspirationTab;
 /** Whether teaching music can be analysed (the server is connected); until then the tab says it is not open. */
 teachingOpen?:boolean;onChange:(next:Inspiration)=>void;onClose:()=>void}){
 const [tab,setTab]=useState<InspirationTab>(initialTab??openingTab(value,matches.length>0));
 const listening=useListening();
 const row=(entry:TextbookTrack,note?:string)=><SongRow key={entry.id} entry={entry} note={note} value={value} listening={listening} onChange={onChange} onClose={onClose}/>;
 return <WorkSheet title={copy.title} description={copy.description} className={styles.songSheet} onClose={onClose}>
  <div className={styles.tabs} role="tablist">
   {(['match','examples','upload'] as const).map(id=><button key={id} type="button" role="tab" aria-selected={tab===id} onClick={()=>{listening.stop();setTab(id);}}>
    <Glyph name={id==='match'?'bulb':id==='examples'?'book':'upload'}/>{copy.tabs[id]}
   </button>)}
  </div>
  <div className={styles.panel} role="tabpanel">
   {tab==='match'?<>
    <p className={styles.note}>{copy.matchNote}</p>
    {matches.length?<ul className={styles.entries}>{matches.map(match=>row(match.track,copy.reason(match.reason.field,match.reason.value)))}</ul>
     :<p className={styles.hint}>{copy.matchEmpty}</p>}
   </>:tab==='examples'?<>
    <p className={styles.note}><Glyph name="lock"/>{copy.catalogueNote}</p>
    <ul className={styles.entries}>{entries.map(entry=>row(entry))}</ul>
   </>:<TeachingMusicPanel value={value} open={teachingOpen} onChange={onChange} listening={listening}/>}
  </div>
  <div className={sheetStyles.actions}>
   <button type="button" className={sheetStyles.secondary} onClick={()=>{onChange({kind:'none'});onClose();}}>{copy.none}</button>
   <button type="button" className={sheetStyles.primary} onClick={onClose}>{copy.done}</button>
  </div>
 </WorkSheet>;
}

function TeachingMusicPanel({value,open,onChange,listening}:{value:Inspiration;open:boolean;onChange:(next:Inspiration)=>void;listening:Listening}){
 const current=value.kind==='teaching-music'?teachingMusic.get(value.musicId):null;
 const [music,setMusic]=useState<LocalTeachingMusic|null>(current);
 const [error,setError]=useState<Exclude<PickResult['status'],'picked'>|null>(null);
 const input=useRef<HTMLInputElement>(null);
 const pick=async(file:File|undefined)=>{
  if(!file)return;
  listening.stop();
  const result=await teachingMusic.pick(file);
  if(result.status!=='picked'){setError(result.status);return;}
  setError(null);setMusic(result.music);
  onChange({kind:'teaching-music',musicId:result.music.id,name:result.music.name,durationMs:result.music.durationMs});
 };
 const sounding=!!music&&listening.playing===`music:${music.id}`;
 return <div className={styles.upload}>
  <input ref={input} type="file" accept="audio/*" hidden onChange={event=>{void pick(event.target.files?.[0]);event.target.value='';}}/>
  {/* The whole row plays the teaching music (tap again to stop). */}
  {music?<button type="button" className={styles.music} aria-pressed={sounding} data-using={value.kind==='teaching-music'&&value.musicId===music.id||undefined}
   aria-label={`${sounding?copy.stopListen:copy.listen}「${music.name}」`} onClick={()=>listening.music(music)}>
   <span className={styles.musicIcon}><PaperIcon name="note" tone="lime"/></span>
   <span className={styles.entryText}><b>{music.name}</b><small>{copy.upload.picked(music.durationMs)}</small></span>
   <span className={styles.listen} aria-hidden="true"><Glyph name={sounding?'stop':'play'}/>{sounding?copy.upload.stop:copy.upload.listen}</span>
  </button>:<p className={styles.hint}>{copy.upload.hint}</p>}
  <button type="button" className={styles.pick} onClick={()=>input.current?.click()}><Glyph name="upload"/>{music?copy.upload.repick:copy.upload.pick}</button>
  {error&&<p className={styles.error} role="alert">{copy.upload.errors[error]}</p>}
  {!open&&<p className={styles.note}><Glyph name="lock"/>{copy.upload.off}</p>}
 </div>;
}
