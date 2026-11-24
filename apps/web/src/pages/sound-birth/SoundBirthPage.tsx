import {useCallback,useEffect,useRef,useState} from 'react';
import {flowSteps} from '../../app/navigation';
import {FlowHeader} from '../../shared/ui/FlowHeader';
import {WorkHeaderActions} from '../../shared/ui/WorkHeaderActions';
import type {SoundDimension} from '@wanwu-v2/contracts/sound';
import type {EditingSound,FinishResult,FinishThen,FinishedSound} from './model/useSoundBirth';
import {birthCopy} from './config/copy';
import {remainingDimensions} from './model/soundBirthState';
import {useSoundBirth} from './model/useSoundBirth';
import {CurrentSoundBar} from './components/CurrentSoundBar';
import {LibraryDialog} from './components/LibraryDialog';
import {RecordDialog} from './components/RecordDialog';
import {ShapeEditor} from './components/ShapeEditor';
import {SoundCard} from './components/SoundCard';
import {SpiritStage} from './components/SpiritStage';
import {TrimDialog} from './components/TrimDialog';
import styles from './SoundBirthPage.module.css';

/** 声音诞生 (采集与转译 merged): bring in a sound with its provenance, set the five choices, compare with the original. */
export function SoundBirthPage({markerIndex,editing=null,onNavigate,onFinish,entryMotion=true}:{entryMotion?:boolean;markerIndex:number;
 /** The sound to go on editing (返回声音诞生); null starts a new sound. */
 editing?:EditingSound|null;onNavigate:(path:string)=>void;onFinish:(sound:FinishedSound,then:FinishThen)=>FinishResult}){
 // Keep the entry mode for this mount; finishing the crossfade must not restart the page entrance.
 const [animateEntry]=useState(entryMotion);
 // Hand-off to 万物声场 goes through the app, which adds the unit to the current work and opens the field.
 const birth=useSoundBirth(markerIndex,onFinish,undefined,editing);
 // The row being looked at: the character's right hand points at it (or at the panel title when there is none).
 const [active,setActive]=useState<SoundDimension|null>(null);
 const editor=useRef<HTMLElement>(null);
 const sourceId=birth.state.source?.id;
 useEffect(()=>{setActive(sourceId?remainingDimensions(birth.state.shape)[0]??null:null);
 // A new sound starts at its first unchosen row.
 },[sourceId]);
 const reach=useCallback(()=>{
  const root=editor.current;if(!root)return null;
  return (active&&root.querySelector(`[data-dimension="${active}"] [data-reach]`))||root.querySelector('[data-reach="title"]');
 },[active]);
 return <div className={styles.shell} data-entry-motion={animateEntry?'default':'still'}>
  <FlowHeader steps={flowSteps} current="birth" onNavigate={onNavigate} aside={<WorkHeaderActions onNavigate={onNavigate} onLibrary={()=>birth.dispatch({type:'dialog',dialog:'library'})}/>}/>
  <main className={styles.page}>
   {/* The title heads the right column; the card on the left starts level with the source bar, below it. */}
   <header className={styles.intro}><h1>{birthCopy.title}</h1><p>{birthCopy.subtitle}</p></header>
   {/* Left: the sound itself — its card, and the sound as a character standing under it. */}
   <div className={styles.left}>
    <SoundCard birth={birth}/>
    <SpiritStage birth={birth} reach={reach}/>
   </div>
   {/* Right: bring a sound in, then make it look like what you heard. */}
   <div className={styles.right}>
    <CurrentSoundBar birth={birth}/>
    <ShapeEditor ref={editor} birth={birth} onBack={()=>onNavigate('/')} active={active} onActive={setActive}/>
   </div>
  </main>
  {birth.state.dialog==='record'&&<RecordDialog birth={birth}/>}
  {birth.state.dialog==='library'&&<LibraryDialog birth={birth}/>}
  {birth.state.dialog==='trim'&&<TrimDialog birth={birth}/>}
 </div>;
}
