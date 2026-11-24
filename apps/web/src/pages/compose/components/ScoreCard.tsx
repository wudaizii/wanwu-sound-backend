import {useRef} from 'react';
import type {CSSProperties,MouseEvent,ReactNode} from 'react';
import {SoundMarker} from '../../../shared/markers/SoundMarker';
import {markerFor,markerNumber} from '../../../shared/markers/markers';
import {Glyph} from '../../../shared/ui/PaperIcon';
import {composeCopy} from '../config/copy';
import {SCORE_INSET,scorePosition,secondsAt,secondsLabel} from '../model/scoreLayout';
import type {Compose} from '../model/useCompose';
import {Transport} from './Transport';
import styles from './ScoreCard.module.css';
import {ui} from '../../../shared/ui/controls';

/** A sound short enough that its seconds go beside the name instead of on the tail (fraction of the piece). */
const SHORT_TAIL=.09;

/**
 * 声音曲谱: the field arrangement drawn as a score — same markers, same rows (rows only spread sounds out), time left →
 * right on the player's seconds. The playhead, the progress bar below and the "now sounding" glow read one time.
 * Tapping a sound or empty space plays from there.
 */
export function ScoreCard({compose,onBack,shelfLink}:{compose:Compose;onBack:()=>void;shelfLink:ReactNode}){
 const {layout,state}=compose;
 const area=useRef<HTMLDivElement>(null);
 if(!layout||!state.arrangement)return <section className={`${ui.limeCard} ${styles.scoreCard}`} aria-busy="true"><p className={styles.loading}>{composeCopy.loading}</p></section>;
 const {rows,items,totalSeconds,ticks,spanMark,spanSeconds}=layout;
 const seek=(event:MouseEvent<HTMLDivElement>)=>{
  if((event.target as HTMLElement).closest('[data-item]'))return;
  const box=area.current?.getBoundingClientRect();
  if(box&&items.length)compose.playFrom(secondsAt(box,event.clientX,totalSeconds));
 };
 const playhead=totalSeconds?compose.now/totalSeconds:0;
 return <section className={`${ui.limeCard} ${styles.scoreCard}`} aria-labelledby="score-title">
  <span className={ui.tape} aria-hidden="true"/>
  <div className={styles.scoreHead}>
   <h2 id="score-title">{composeCopy.scoreTitle}</h2>
   {state.arrangement.origin==='example'&&<span className={styles.exampleBadge}><Glyph name="sounds"/>{composeCopy.exampleBadge}</span>}
   <ul className={styles.legend} aria-label={composeCopy.legendLabel}>
    {layout.legend.map(unit=><li key={unit.id}><SoundMarker index={unit.markerIndex} label={null} className={styles.legendMarker}/><span>{markerNumber(unit.markerIndex)} · {unit.name}</span></li>)}
   </ul>
  </div>
  {/* Just saved: the squirrel says so; this slot offers the way to the shelf for a while instead of the listening prompt. */}
  {shelfLink?<p className={styles.shelfLink}>{shelfLink}</p>:<p className={styles.scoreHint}><Glyph name="sounds"/>{composeCopy.listenPrompt(compose.talk.facts)}</p>}
  <div className={styles.score} data-rows={rows} style={{'--rows':rows} as CSSProperties}>
   <div ref={area} className={styles.scoreField} onClick={seek} title={items.length?composeCopy.scoreSeek:undefined}>
    {Array.from({length:rows},(_,row)=><div key={row} className={styles.scoreLane} aria-hidden="true"/>)}
    {spanMark!==null&&<div className={styles.overrun} style={{left:scorePosition(spanMark)}} aria-hidden="true"><span>{composeCopy.spanMark(spanSeconds)}</span></div>}
    {!items.length&&<div className={styles.emptyScore}>
     <button type="button" onClick={onBack}><Glyph name="back"/>{composeCopy.emptyAction}</button>
    </div>}
    {/* Length tails under the markers: as long as each sound is heard, on the same seconds scale as the ruler. */}
    {items.map(item=>{
     const short=item.length<SHORT_TAIL;
     return <i key={item.eventId} className={styles.itemTail} data-marker={markerFor(item.unit.markerIndex).id} data-sounding={compose.sounding.has(item.eventId)||undefined}
      style={{left:scorePosition(item.left),top:`${(item.row+.5)/rows*100}%`,width:`${item.length*(1-2*SCORE_INSET)*100}%`}} aria-hidden="true">
      {!short&&<b>{composeCopy.seconds(secondsLabel(item.seconds))}</b>}
     </i>;
    })}
    <ol className={styles.items}>
     {items.map(item=>{
      const sounding=compose.sounding.has(item.eventId),short=item.length<SHORT_TAIL,seconds=secondsLabel(item.seconds);
      return <li key={item.eventId} className={styles.item} data-sounding={sounding||undefined} style={{left:scorePosition(item.left),top:`${(item.row+.5)/rows*100}%`}}>
       <button type="button" data-item className={styles.itemButton} aria-pressed={sounding}
        aria-label={composeCopy.itemLabel(markerNumber(item.unit.markerIndex),item.unit.name,secondsLabel(item.start),seconds)}
        onClick={()=>compose.playFrom(item.start)}>
        <SoundMarker index={item.unit.markerIndex} className={styles.itemMarker} face={sounding?'happy':'calm'}/>
        <span className={styles.itemName}>{item.unit.name}{short&&<small>{composeCopy.seconds(seconds)}</small>}</span>
       </button>
      </li>;
     })}
    </ol>
    <span className={styles.playhead} style={{left:scorePosition(playhead)}} data-moving={compose.playing||undefined} aria-hidden="true"/>
   </div>
   <div className={styles.scoreRuler} aria-hidden="true">
    <i/>
    {ticks.map(tick=><span key={tick.seconds} style={{left:scorePosition(tick.at)}}>{composeCopy.seconds(String(tick.seconds))}</span>)}
    {spanMark!==null&&<span data-end style={{left:scorePosition(1)}}>{composeCopy.seconds(String(Math.ceil(totalSeconds-1e-6)))}</span>}
   </div>
  </div>
  <Transport compose={compose}/>
 </section>;
}
