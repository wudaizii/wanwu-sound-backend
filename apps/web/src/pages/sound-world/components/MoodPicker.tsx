import {useEffect,useRef,useState} from 'react';
import {MOOD_TEXT_MAX,MOODS} from '@wanwu-v2/contracts/arrangement';
import type {MoodId} from '@wanwu-v2/contracts/arrangement';
import {WorkSheet,sheetStyles} from '../../../shared/ui/WorkSheet';
import {MoodFace} from '../../../shared/ui/MoodFace';
import {moodLabels} from '../../../shared/creation/moodCopy';
import {worldCopy} from '../config/copy';
import type {SoundWorld} from '../model/useSoundWorld';
import sheet from './sheet.module.css';
import styles from './MoodPicker.module.css';

/**
 * 这首曲子的心情: seven preset moods, 先不选, and 自己写 (the child's own words) — the last only while a model is connected
 * to understand them; until then it says so instead of pretending. Kept for 万物成曲; it never moves a sound.
 */
export function MoodPicker({world}:{world:SoundWorld}){
 const mood=world.state.arrangement?.mood??null;
 const [writing,setWriting]=useState(false);
 const custom=mood?.kind==='custom'?mood:null;
 const presetChecked=(id:MoodId|null)=>id===null?mood===null:mood?.kind==='preset'&&mood.id===id;
 const option=(key:string,checked:boolean,face:Parameters<typeof MoodFace>[0]['name'],label:string,onClick:()=>void,extra?:string)=>
  <button key={key} type="button" role="radio" aria-checked={checked} data-mood={key} className={styles.moodOption} disabled={!world.state.arrangement} onClick={onClick}>
   <MoodFace name={face} className={styles.moodFace}/><span>{label}</span>{extra&&<small>{extra}</small>}
  </button>;
 return <div className={styles.mood} role="radiogroup" aria-labelledby="mood-title">
  <span id="mood-title" className={styles.moodTitle}>{worldCopy.moodTitle}</span>
  <div className={styles.moodOptions}>
   {MOODS.map(id=>option(id,presetChecked(id),id,moodLabels[id],()=>world.pickMood(id)))}
   {option('unset',presetChecked(null),'unset',worldCopy.moodUnset,()=>world.pickMood(null))}
   {option('custom',!!custom,'custom',custom?custom.text:worldCopy.moodCustom,
    ()=>{if(world.moodModelAvailable)setWriting(true);else void world.customMood('');},
    world.moodModelAvailable?undefined:worldCopy.moodCustomOff)}
  </div>
  {writing&&<CustomMoodDialog world={world} initial={custom?.text??''} onClose={()=>setWriting(false)}/>}
 </div>;
}

const copy=worldCopy.customMood;

/** 自己写: the child's own words for the mood, sent to the connected model; kept exactly as written. */
function CustomMoodDialog({world,initial,onClose}:{world:SoundWorld;initial:string;onClose:()=>void}){
 const [text,setText]=useState(initial);
 const [failed,setFailed]=useState(false);
 const input=useRef<HTMLInputElement>(null);
 // The modal focuses its close button when it opens; move focus to the text box right after.
 useEffect(()=>{const frame=requestAnimationFrame(()=>input.current?.focus());return()=>cancelAnimationFrame(frame);},[]);
 const submit=async()=>{setFailed(false);if(await world.customMood(text))onClose();else setFailed(true);};
 return <WorkSheet title={copy.title} description={copy.description} onClose={onClose}>
  <form className={styles.customMood} onSubmit={event=>{event.preventDefault();void submit();}}>
   <input ref={input} value={text} maxLength={MOOD_TEXT_MAX} placeholder={copy.placeholder} aria-label={copy.title} onChange={event=>setText(event.target.value)}/>
   <p role="status" className={sheetStyles.note}>{world.interpreting?copy.working:failed?copy.failed:''}</p>
   <div className={sheet.clipActions}>
    <button type="button" className={sheet.clipCancel} onClick={onClose}>{copy.cancel}</button>
    <button type="submit" className={sheet.clipApply} disabled={!text.trim()||world.interpreting}>{copy.submit}</button>
   </div>
  </form>
 </WorkSheet>;
}
