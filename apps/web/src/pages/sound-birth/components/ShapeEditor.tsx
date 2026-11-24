import {useEffect,useRef} from 'react';
import type {Ref} from 'react';
import {SOUND_CHOICES,SOUND_DIMENSIONS} from '@wanwu-v2/contracts/sound';
import type {SoundDimension} from '@wanwu-v2/contracts/sound';
import {birthCopy} from '../config/copy';
import {dimensionCopy} from '../../../shared/creation/dimensionCopy';
import type {useSoundBirth} from '../model/useSoundBirth';
import {finishCheck,remainingDimensions} from '../model/soundBirthState';
import {Equalizer} from './Equalizer';
import {Glyph,PaperIcon} from '../../../shared/ui/PaperIcon';
import type {PaperTone} from '../../../shared/ui/PaperIcon';
import {ShapeGlyph} from './ShapeGlyph';
import styles from './ShapeEditor.module.css';
import {ui} from '../../../shared/ui/controls';

type Birth=ReturnType<typeof useSoundBirth>;
const label=(dimension:SoundDimension,value:string)=>(dimensionCopy[dimension].options as Record<string,string>)[value];
/** Each row's paper icon colour (palette + marker paper); options themselves are always green when chosen. */
const rowTone:Record<SoundDimension,PaperTone>={pitch:'lime',duration:'yellow',contour:'sky',intensity:'pink',pattern:'lilac'};
/** After a choice the next unchosen row comes forward, unless the child is already pointing at a row. */
const ADVANCE_MS=1500;

/**
 * 转译: all five dimensions laid out as rows, so every choice is one tap away. Choosing also plays the result.
 * One row at a time is "the row being looked at" (hover, focus, or the next one to choose); the character points at it.
 */
export function ShapeEditor({birth,onBack,active,onActive,ref}:{birth:Birth;onBack:()=>void;active:SoundDimension|null;onActive:(dimension:SoundDimension|null)=>void;ref?:Ref<HTMLElement>}){
 const {state}=birth,rows=useRef<HTMLDivElement>(null),advance=useRef(0);
 const done=SOUND_DIMENSIONS.length-remainingDimensions(state.shape).length;
 useEffect(()=>()=>clearTimeout(advance.current),[]);
 // Tapping the chosen option again takes it back; otherwise choose it. Every row is optional (unchosen = original).
 const tap=(dimension:SoundDimension,value:string)=>{
  clearTimeout(advance.current);onActive(dimension);
  if(state.shape[dimension]===value){birth.clear(dimension);return;}
  birth.choose(dimension,value);
  advance.current=window.setTimeout(()=>{
   if(rows.current?.querySelector('[data-dimension]:hover'))return;
   onActive(remainingDimensions({...state.shape,[dimension]:value})[0]??null);
  },ADVANCE_MS);
 };
 const ready=finishCheck(state).kind==='ready';
 return <section ref={ref} className={styles.editor} aria-labelledby="shape-title">
  <header className={styles.editorHead}>
   <div><h2 id="shape-title" data-reach="title">{birthCopy.shapeTitle}</h2><p>{state.cardPhoto?birthCopy.paperCardNote:birthCopy.optionHint}</p></div>
   <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={SOUND_DIMENSIONS.length} aria-valuenow={done} aria-label={birthCopy.progress(done,SOUND_DIMENSIONS.length)}>
    <span className={styles.pips} aria-hidden="true">{SOUND_DIMENSIONS.map((dimension,i)=><i key={dimension} data-on={i<done||undefined}/>)}</span>
    <b>{birthCopy.progress(done,SOUND_DIMENSIONS.length)}</b>
   </div>
  </header>
  <div ref={rows} className={styles.rows}>
   {SOUND_DIMENSIONS.map(dimension=>{
    const copy=dimensionCopy[dimension],chosen=state.shape[dimension];
    return <div key={dimension} className={styles.row} data-dimension={dimension} data-active={active===dimension||undefined}
     data-done={!!chosen||undefined}
     role="radiogroup" aria-labelledby={`row-${dimension}`}
     onPointerEnter={()=>{clearTimeout(advance.current);onActive(dimension);}} onFocus={()=>onActive(dimension)}>
     <span className={styles.rowLabel} data-reach>
      <PaperIcon name={dimension} tone={rowTone[dimension]} className={styles.rowIcon}/>
      <span><b id={`row-${dimension}`}>{copy.label}</b><small aria-hidden="true">{birthCopy.rowHints[dimension]}</small></span>
     </span>
     <div className={styles.tray} data-count={SOUND_CHOICES[dimension].length}>
      {SOUND_CHOICES[dimension].map(value=>{const checked=chosen===value,sounding=checked&&birth.playing==='current'&&birth.lastChosen===dimension;
       return <button key={value} type="button" role="radio" aria-checked={checked}
       className={styles.choice} data-playing={sounding||undefined} title={checked?birthCopy.tapToClear:undefined} onClick={()=>tap(dimension,value)}>
       <ShapeGlyph dimension={dimension} value={value}/><span>{label(dimension,value)}</span>
       {checked&&(sounding?<Equalizer/>:<Glyph name="check" className={styles.tick}/>)}
      </button>;})}
     </div>
    </div>;
   })}
  </div>
  <div className={styles.actions}>
   <button type="button" className={`${ui.pill} ${ui.back} ${styles.backButton}`} onClick={onBack}><Glyph name="back"/>{birthCopy.backEntry}</button>
   {/* 再做一个: keep this sound in the work and start the next one here; 做好了 then takes them all to the field. */}
   <button type="button" className={`${ui.pill} ${ui.outline} ${styles.another}`} onClick={birth.another}><Glyph name="plus"/>{birthCopy.another}</button>
   <button type="button" className={`${ui.pill} ${ui.forward} ${styles.finish}`} data-ready={ready&&!birth.blocked||undefined} aria-disabled={birth.blocked||undefined} onClick={birth.finish}>
    {birth.blocked?birthCopy.finishUnavailable:birthCopy.finish}<Glyph name="arrow"/>
   </button>
  </div>
 </section>;
}
