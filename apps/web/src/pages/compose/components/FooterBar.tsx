import {useEffect,useState} from 'react';
import {Glyph,PaperIcon} from '../../../shared/ui/PaperIcon';
import {composeCopy} from '../config/copy';
import type {Compose} from '../model/useCompose';
import styles from './FooterBar.module.css';
import {ui} from '../../../shared/ui/controls';

/**
 * 音乐小发现 on the left — the bulb opens 这首音乐有什么特征: each feature of this piece with the music idea behind it
 * and a question for the class (for non-specialist teachers); 保存这首作品 · 回声场改一改 · 再来一首 on the right, on one centre line.
 */
export function FooterBar({compose,onSave,onBack,onAgain}:{compose:Compose;onSave:()=>void;onBack:()=>void;onAgain:()=>void}){
 const [index,setIndex]=useState(0);
 const [teaching,setTeaching]=useState(false);
 const {discoveries,tryThis,textbook}=compose.talk,discovery=discoveries.length?discoveries[index%discoveries.length]!:null;
 // Esc closes the panel (dialogs handle their own Esc).
 useEffect(()=>{
  if(!teaching)return;
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]'))setTeaching(false);};
  addEventListener('keydown',key);return()=>removeEventListener('keydown',key);
 },[teaching]);
 return <div className={styles.footer}>
  <section className={styles.discovery} aria-labelledby="discovery-title">
   <button type="button" className={styles.bulb} aria-expanded={teaching} aria-controls="teach-panel" disabled={!discoveries.length}
    aria-label={teaching?composeCopy.bulbClose:composeCopy.bulbOpen} title={teaching?composeCopy.bulbClose:composeCopy.bulbOpen} onClick={()=>setTeaching(open=>!open)}>
    <PaperIcon name="bulb" tone="yellow"/>
   </button>
   <div>
    <h3 id="discovery-title">{composeCopy.discoveryTitle}</h3>
    <p aria-live="polite">{discovery?discovery.line:composeCopy.notices['need-event']}</p>
   </div>
   {discoveries.length>1&&<button type="button" className={styles.discoveryNext} onClick={()=>setIndex(value=>value+1)}>{composeCopy.discoveryNext}</button>}
  </section>
  <div className={styles.footerActions}>
   <button type="button" className={`${ui.pill} ${ui.go} ${styles.saveButton}`} data-saved={compose.shelved||undefined} onClick={onSave}>
    <Glyph name={compose.shelved?'check':'save'}/>{compose.shelved?composeCopy.saved:composeCopy.save}
   </button>
   <button type="button" className={`${ui.pill} ${ui.back} ${styles.backButton}`} onClick={onBack}><Glyph name="back"/>{composeCopy.back}</button>
   <button type="button" className={`${ui.pill} ${ui.outline} ${styles.againButton}`} onClick={onAgain}><Glyph name="plus"/>{composeCopy.again}</button>
   <p className={styles.saveMeta}>
    <button type="button" onClick={onSave}>{composeCopy.saveSettings}<span aria-hidden="true">▾</span></button>
    <i aria-hidden="true"/><span><Glyph name="lock"/>{composeCopy.saveVisibility}</span>
   </p>
  </div>
  {teaching&&discoveries.length>0&&<section id="teach-panel" className={styles.teach} aria-labelledby="teach-title">
   <header>
    <h3 id="teach-title"><PaperIcon name="bulb" tone="yellow"/>{composeCopy.teachTitle}</h3>
    <button type="button" className={styles.teachPlay} onClick={compose.restart}><Glyph name="play"/>{composeCopy.teachPlay}</button>
    <button type="button" className={styles.teachClose} aria-label={composeCopy.bulbClose} onClick={()=>setTeaching(false)}><Glyph name="plus"/></button>
   </header>
   <p className={styles.teachLead}>{composeCopy.teachLead}</p>
   {/* Only this list scrolls (wheel, touch, or arrow keys once focused); the title row above stays in place. */}
   <ol tabIndex={0} aria-label={composeCopy.teachTitle}>
    {/* 课本讲解 first when a textbook song is chosen: feature → this shape → what happened → one thing to try. */}
    {textbook&&<li className={styles.talk}>
     <b>{composeCopy.talkTitle}</b>
     {(['feature','shape','meeting','task'] as const).map(part=><p key={part}><em>{composeCopy.talkParts[part]}</em>{textbook[part]}</p>)}
    </li>}
    {discoveries.map((text,i)=><li key={`${text.idea}-${i}`}>
     <b>{text.line}</b>
     <p><em>{composeCopy.teachIdea} · {text.idea}</em>{text.explain}</p>
     <p className={styles.teachAsk}><em>{composeCopy.teachAsk}</em>{text.ask}</p>
    </li>)}
    {/* One thing the class can do right away in 万物声场, then listen again. */}
    {tryThis&&<li className={styles.talk}>
     <b>{composeCopy.tryThisTitle}</b>
     <p><em>{composeCopy.tryThisLead}</em>{tryThis}</p>
    </li>}
   </ol>
  </section>}
 </div>;
}
