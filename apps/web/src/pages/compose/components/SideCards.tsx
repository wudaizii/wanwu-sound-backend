import {useMemo} from 'react';
import type {CSSProperties} from 'react';
import {inspirationCopy} from '../../../shared/inspiration/copy';
import {variationNames} from '../../../shared/inspiration/talk';
import type {InspirationTab} from '../../../shared/inspiration/InspirationDialog';
import {Glyph,PaperIcon} from '../../../shared/ui/PaperIcon';
import type {PaperIconName,PaperTone} from '../../../shared/ui/PaperIcon';
import {composeCopy} from '../config/copy';
import {minSpan} from '../../../shared/creation/arrangementTiming';
import {secondsLabel,spanChoices} from '../model/scoreLayout';
import type {Compose} from '../model/useCompose';
import styles from './SideCards.module.css';

/** Card icon: a solid paper cut-out in a palette colour (no backing shape), as on 声音诞生. */
const Badge=({icon,tone}:{icon:PaperIconName;tone:PaperTone})=>
 <span className={styles.badge}><PaperIcon name={icon} tone={tone}/></span>;

/** 想听多久？ The same 20 / 30 / 45 s as the field; shows the real length when the last sound runs past it. */
export function SpanCard({compose}:{compose:Compose}){
 const arrangement=compose.state.arrangement;
 const choices=useMemo(()=>arrangement?spanChoices(arrangement):[],[arrangement]);
 const needed=useMemo(()=>arrangement?minSpan(arrangement):0,[arrangement]);
 return <section className={styles.card} aria-labelledby="span-title">
  <h3 id="span-title" className={styles.cardTitle}><Badge icon="clock" tone="sky"/>{composeCopy.spanTitle}</h3>
  <div className={styles.spanOptions} role="radiogroup" aria-labelledby="span-title">
   {choices.map(({seconds,real})=>{
    // Shorter than the longest sound: greyed, still tappable so the squirrel can say which sound needs more room.
    const longer=real>seconds+1e-6,short=seconds<needed;
    return <button key={seconds} type="button" role="radio" aria-checked={arrangement?.spanSeconds===seconds} aria-disabled={short||undefined} className={styles.spanOption} onClick={()=>compose.setSpan(seconds)}>
     <b>{composeCopy.seconds(String(seconds))}</b>
     <small data-longer={!short&&longer||undefined}>{short?composeCopy.spanTooShort:longer?composeCopy.spanReal(secondsLabel(Math.ceil(real-1e-6))):composeCopy.spanOptions[seconds]}</small>
    </button>;
   })}
  </div>
 </section>;
}

/** 课本灵感 (optional, also offered in 万物声场): lends rhythm and feel to the background only. 帮我找找 is local rules. */
export function InspirationCard({compose,onOpen}:{compose:Compose;onOpen:(tab:InspirationTab)=>void}){
 const {inspiration,background}=compose.state.settings;
 const lead=inspiration.kind==='none'?composeCopy.inspirationLead
  :inspirationCopy.summary(inspiration,compose.entries)+'。'+(inspiration.kind==='teaching-music'?composeCopy.inspirationTeachingWait:background.enabled?'':composeCopy.inspirationBackgroundOff);
 return <section className={`${styles.card} ${styles.fit}`} aria-labelledby="inspiration-title">
  <h3 id="inspiration-title" className={styles.cardTitle}><Badge icon="book" tone="pink"/>{composeCopy.inspirationTitle}<small>{composeCopy.inspirationOptional}</small></h3>
  <p className={styles.cardLead}>{lead}</p>
  {/* 换几种样子: as it is, or two shapes chosen for this arrangement; the squirrel says what each one does. */}
  {compose.variations.length>0&&<div className={styles.variationRow} role="radiogroup" aria-label={composeCopy.variationLabel}>
   {compose.variations.map(variation=><button key={variation} type="button" role="radio"
    aria-checked={(inspiration.kind==='textbook'?inspiration.variation??'original':'original')===variation} onClick={()=>compose.setVariation(variation)}>
    {variationNames[variation]}
   </button>)}
  </div>}
  <div className={styles.choiceRow} role="group" aria-labelledby="inspiration-title">
   <button type="button" aria-pressed={inspiration.kind==='none'} onClick={()=>compose.setInspiration({kind:'none'})}>{composeCopy.inspirationNone}</button>
   <button type="button" aria-pressed={inspiration.kind!=='none'} onClick={()=>onOpen(inspiration.kind==='teaching-music'?'upload':'examples')}>{composeCopy.inspirationTextbook}</button>
   <button type="button" aria-pressed={false} onClick={()=>onOpen('match')}>{composeCopy.inspirationSuggest}</button>
  </div>
 </section>;
}

/** 背景音乐: its own layer under the child's sounds — on / off, who plays it (any instruments, or none = as generated), how
 *  loud, and an AI chip once an AI background is ready. Only controls here: the squirrel says what each one did. */
export function BackgroundCard({compose}:{compose:Compose}){
 const {background}=compose.state.settings;
 const chosen=new Set(compose.chosen.map(item=>item.id));
 const aiReady=compose.ai.status==='ready';
 return <section className={styles.card} aria-labelledby="background-title" data-off={!background.enabled||undefined}>
  <div className={styles.cardTop}>
   <h3 id="background-title" className={styles.cardTitle}><Badge icon="note" tone="lime"/>{composeCopy.backgroundTitle}
    {/* Shown only once an AI background is ready: a tap switches between it and the first one (the child decides). */}
    {aiReady&&<button type="button" className={styles.sourceTag} aria-pressed={compose.usingAi}
     aria-label={composeCopy.aiLabel(compose.usingAi)} onClick={compose.tapAi}>{composeCopy.aiTag}</button>}
   </h3>
   <button type="button" role="switch" aria-checked={background.enabled} aria-label={composeCopy.backgroundToggle} className={styles.switch}
    onClick={()=>compose.setBackgroundEnabled(!background.enabled)}>
    <span>{background.enabled?composeCopy.backgroundOn:composeCopy.backgroundOff}</span><i/>
   </button>
  </div>
  <div className={styles.trackRow} role="group" aria-label={composeCopy.instrumentsLabel}>
   {compose.instruments.map(item=><button key={item.id} type="button" aria-pressed={chosen.has(item.id)} onClick={()=>compose.toggleInstrument(item.id)}>
    {chosen.has(item.id)&&<Glyph name="check"/>}{item.name}
   </button>)}
   {/* Instruments planned for later: one quiet chip; tapping it lets the squirrel say they are not open yet. */}
   {compose.comingInstruments.length>0&&<button type="button" className={styles.coming} aria-label={composeCopy.instrumentComing(compose.comingInstruments.join('、'))} onClick={compose.showComing}>
    <Glyph name="plus"/>{composeCopy.instrumentMore}
   </button>}
  </div>
  <label className={styles.volume}>
   <Glyph name="volume"/>
   <span className={styles.srOnly}>{composeCopy.volumeLabel}</span>
   <input type="range" min={0} max={1} step={.05} value={background.volume} disabled={!background.enabled}
    style={{'--fill':`${background.volume*100}%`} as CSSProperties} onChange={event=>compose.setBackgroundVolume(Number(event.target.value))}/>
  </label>
 </section>;
}
