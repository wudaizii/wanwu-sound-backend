import {useState} from 'react';
import {SOUND_NAME_MAX} from '@wanwu-v2/contracts/sound';
import type {SoundSource} from '@wanwu-v2/contracts/sound';
import {birthCopy} from '../config/copy';
import type {useSoundBirth} from '../model/useSoundBirth';
import {Equalizer} from './Equalizer';
import {Glyph} from '../../../shared/ui/PaperIcon';
import {Waveform} from './Waveform';
import controls from './controls.module.css';
import styles from './SoundCard.module.css';
import {ui} from '../../../shared/ui/controls';

type Birth=ReturnType<typeof useSoundBirth>;
const day=(iso:string|null)=>iso?`${Number(iso.slice(5,7))}月${Number(iso.slice(8,10))}日`:null;

/**
 * 我的声卡: a paper card taped above the sound character — the card's name and where it came from, the waveform
 * (the original stays behind as a dotted line once there is a shaped version) and the two compare buttons.
 * A confirmed local sound can go back to editing its info; examples are already documented.
 */
export function SoundCard({birth}:{birth:Birth}){
 const {state}=birth,source=state.source;
 const big=!source||state.cardConfirmed;
 return <section className={`${ui.limeCard} ${styles.card}`} data-empty={!source||undefined} aria-labelledby="my-card-title">
  <span className={ui.tape} aria-hidden="true"/>
  <h2 id="my-card-title" className={styles.cardTitle}>{birthCopy.myCard}
   {source&&state.cardConfirmed&&source.kind!=='example'&&<button type="button" className={styles.cardEdit} onClick={()=>birth.dispatch({type:'card',confirmed:false})}><Glyph name="edit"/>{birthCopy.editCard}</button>}
  </h2>
  {source?<>
   <Identity birth={birth} source={source}/>
   <Waveform buffer={birth.wave.buffer} ghost={birth.wave.target==='current'?birth.wave.original:null} progress={birth.wave.progress}
    label={birth.wave.target==='current'?'现在的声音':'原声'} playing={birth.playing===birth.wave.target} onPlay={birth.playShown}/>
   <div className={styles.compare}>
    {(['current','original'] as const).map(target=>{const active=birth.playing===target;return <button key={target} type="button" aria-pressed={active}
     className={target==='current'?`${ui.pill} ${ui.go} ${controls.primary}`:`${ui.pill} ${ui.outline} ${controls.secondary}`} onClick={()=>birth.playCompare(target)}>
     {active?<Equalizer/>:<Glyph name="play"/>}{active?birthCopy.stopPlaying:target==='original'?birthCopy.original:birthCopy.current}</button>;})}
   </div>
   {big&&<p className={styles.cardFoot}>{birthCopy.keepOriginal}</p>}
  </>:<>
   <p className={styles.name} data-empty>{state.reading?birthCopy.reading:birthCopy.noSound}</p>
   {/* An empty, quiet wave: the character above says what to do. */}
   <div className={styles.cardEmpty} aria-hidden="true"><svg viewBox="0 0 320 64" preserveAspectRatio="none"><path d="M0 32Q20 26 40 32T80 32T120 32T160 32T200 32T240 32T280 32T320 32"/></svg></div>
  </>}
 </section>;
}

function Identity({birth,source}:{birth:Birth;source:SoundSource}){
 const {state}=birth,[editing,setEditing]=useState(false);
 const p=source.provenance;
 const meta=source.kind==='example'
  ?<>{birthCopy.sourceLabel.example} · {birthCopy.credit(p.recordedBy??'')} · <a href={p.provenanceUrl??'#'} target="_blank" rel="noopener">{birthCopy.license}</a></>
  :state.cardConfirmed?[p.recordedBy,p.place,day(p.recordedOn)].filter(Boolean).join(' · '):birthCopy.sourceLabel[source.kind];
 return <div className={styles.identity}>
  {editing?<input className={styles.nameInput} defaultValue={state.name} maxLength={SOUND_NAME_MAX} aria-label="声卡名字" autoFocus
    onBlur={event=>{birth.rename(event.currentTarget.value);setEditing(false);}}
    onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();if(event.key==='Escape'){event.currentTarget.value=state.name;event.currentTarget.blur();}}}/>
   :<h3 className={styles.name}>{state.name}<button type="button" className={styles.iconButton} aria-label={birthCopy.rename} onClick={()=>setEditing(true)}><Glyph name="edit"/></button></h3>}
  <p className={styles.sourceKind}>{meta}</p>
 </div>;
}
