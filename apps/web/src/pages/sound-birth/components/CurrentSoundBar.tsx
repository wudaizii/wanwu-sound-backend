import {useEffect,useRef,useState} from 'react';
import {SoundMarker} from '../../../shared/markers/SoundMarker';
import {markerNumber} from '../../../shared/markers/markers';
import {birthCopy} from '../config/copy';
import type {useSoundBirth} from '../model/useSoundBirth';
import {Equalizer} from './Equalizer';
import {PaperCard} from './PaperCard';
import {Glyph,PaperIcon} from '../../../shared/ui/PaperIcon';
import controls from './controls.module.css';
import styles from './CurrentSoundBar.module.css';

type Birth=ReturnType<typeof useSoundBirth>;

/** 采集: the current source with a quick listen, and every way to bring in another one — a paper tab on top of 声音的样子. */
export function CurrentSoundBar({birth}:{birth:Birth}){
 const {state}=birth,file=useRef<HTMLInputElement>(null);
 const listening=birth.playing==='original';
 // "Pick a sound first": the character says it, and 还没有选声音 lights up like a highlighter — again on every try.
 const askingForSound=!state.source&&state.notice?.area==='bar'&&state.notice.tone==='info';
 const [nudges,setNudges]=useState(0);
 useEffect(()=>{if(askingForSound)setNudges(count=>count+1);},[state.notice]);
 return <section className={styles.bar} aria-label={birthCopy.currentSound}>
  <div className={styles.barCurrent}>
   {state.source?<>
    <SoundMarker index={state.markerIndex} className={styles.barMarker} label={null}/>
    <span className={styles.barText}><small>{birthCopy.currentSound} · {markerNumber(state.markerIndex)}</small><b>{state.name}{state.source.kind==='example'&&<em>示例</em>}</b></span>
    <button type="button" className={styles.barListen} aria-pressed={listening} onClick={()=>birth.playCompare('original')}>{listening?<Equalizer/>:<Glyph name="play"/>}{listening?birthCopy.stopPlaying:birthCopy.listen}</button>
   </>:<span className={styles.barText}><small>{birthCopy.currentSound}</small><b key={nudges} data-attention={askingForSound||undefined}>{state.reading?birthCopy.reading:birthCopy.noSound}</b></span>}
  </div>
  <div className={styles.tiles}>
   <button type="button" className={controls.tileButton} onClick={birth.openRecord}><PaperIcon name="mic" tone="pink" className={controls.tile}/>{birthCopy.record}</button>
   <button type="button" className={controls.tileButton} onClick={()=>file.current?.click()} disabled={state.reading}><PaperIcon name="upload" tone="sky" className={controls.tile}/>{birthCopy.upload}</button>
   <button type="button" className={controls.tileButton} onClick={()=>birth.dispatch({type:'dialog',dialog:'library'})}><PaperIcon name="library" tone="yellow" className={controls.tile}/>{birthCopy.library}</button>
   <PaperCard photo={state.cardPhoto} onChange={birth.setCardPhoto}/>
  </div>
  <input ref={file} type="file" accept="audio/*" hidden onChange={event=>{const chosen=event.target.files?.[0];event.target.value='';if(chosen)void birth.chooseFile(chosen);}}/>
 </section>;
}
