import {useState} from 'react';
import type {CSSProperties,MouseEvent,PointerEvent,RefObject} from 'react';
import {MAX_ROWS,SPAN_CHOICES,eventsInOrder} from '@wanwu-v2/contracts/arrangement';
import {SoundMarker} from '../../../shared/markers/SoundMarker';
import {markerFor,markerNumber} from '../../../shared/markers/markers';
import {Glyph} from '../../../shared/ui/PaperIcon';
import {worldCopy} from '../config/copy';
import {secondsText} from '../model/clipEditing';
import {FIELD_INSET,spotPosition,timePosition} from '../model/fieldGeometry';
import {MARKER_HALF,canRemoveRow,eventOf,heardSeconds,minSpan,unitOf} from '../model/soundWorldState';
import type {DragState,useFieldDrag} from '../model/useFieldDrag';
import type {FieldSpot,SoundWorld} from '../model/useSoundWorld';
import {EventToolbar} from './EventToolbar';
import styles from './SoundField.module.css';

type Props={world:SoundWorld;area:RefObject<HTMLDivElement|null>;locate:(x:number,y:number)=>FieldSpot|null;drag:DragState;
 bind:ReturnType<typeof useFieldDrag>['bind'];onTrim:(eventId:string)=>void};

/** Tick spacing per field length, so the ruler always reads 0 … end in a few even steps. */
const tickStep=(span:number)=>span<=20?5:span<=30?10:15;

/**
 * The field: left → right is time (先响起 → 后响起) on a seconds ruler; each sound trails a tail as long as it is heard.
 * Rows only spread sounds out — three to start, more can be added. Tap empty space to place the selected sound (or
 * move the selected occurrence); tap a tail to 剪一剪 that occurrence.
 */
export function SoundField({world,area,locate,drag,bind,onTrim}:Props){
 const {arrangement,selection}=world.state;
 const [hover,setHover]=useState<FieldSpot|null>(null);
 if(!arrangement)return <section className={styles.field} aria-busy="true"><p className={styles.fieldLoading}>{worldCopy.loading}</p></section>;
 const {rows,spanSeconds}=arrangement,rowIndexes=Array.from({length:rows},(_,row)=>row);
 /** The shortest length that holds every placed sound. */
 const needed=minSpan(arrangement);
 const selectedEvent=selection?.kind==='event'?eventOf(arrangement,selection.eventId):null;
 const selectedUnit=selection?.kind==='unit'?unitOf(arrangement,selection.unitId):null;
 const order=eventsInOrder(arrangement.events).map(event=>event.id);
 const ticks=Array.from({length:Math.floor(spanSeconds/tickStep(spanSeconds))+1},(_,i)=>i*tickStep(spanSeconds));
 const tap=(event:MouseEvent<HTMLDivElement>)=>{
  if((event.target as HTMLElement).closest('[data-event],[data-toolbar],[data-tail]'))return;
  const spot=locate(event.clientX,event.clientY);
  if(spot)world.tapField(spot);
 };
 // The dashed drop target appears only while a sound from the left is picked (or while dragging); once it is placed
 // the hint goes away. Touch has no hover, so there it relies on the tap itself.
 const track=(event:PointerEvent<HTMLDivElement>)=>{
  if(event.pointerType!=='mouse'||!selectedUnit||(event.target as HTMLElement).closest('[data-event],[data-toolbar],[data-tail]')){setHover(null);return;}
  setHover(locate(event.clientX,event.clientY));
 };
 const rowLabel=(row:number)=>{
  if(selectedUnit)return worldCopy.placeInRow(selectedUnit.name,row+1);
  if(selectedEvent)return worldCopy.moveToRow(row+1);
  return worldCopy.rowName(row+1);
 };
 const target=drag?.spot??(hover&&selectedUnit?hover:null);
 return <section className={styles.field} aria-labelledby="field-title" data-armed={!!selectedUnit||undefined} data-rows={rows}>
  <h2 id="field-title" className={styles.srOnly}>{worldCopy.fieldLabel}</h2>
  <div className={styles.fieldHead}>
   {/* Keep the original wrapping/space so removing the hint does not move tools or sound markers. */}
   <p className={styles.fieldHintSpace} aria-hidden="true">{worldCopy.fieldHintLayout}</p>
   {arrangement.origin==='example'&&<div className={styles.exampleBadge}>
    <span><Glyph name="sounds"/>{worldCopy.exampleBadge}</span>
    <button type="button" onClick={world.clearEvents}>{worldCopy.clearExample}</button>
   </div>}
   <div className={styles.span} role="radiogroup" aria-label={worldCopy.spanLabel}>
    <span aria-hidden="true">{worldCopy.spanLabel}</span>
    {/* Lengths shorter than the longest sound are greyed; tapping one lets the frog say which sound needs more room. */}
    {SPAN_CHOICES.map(seconds=>{const short=seconds<needed;
     return <button key={seconds} type="button" role="radio" aria-checked={spanSeconds===seconds} aria-disabled={short||undefined}
      title={short?worldCopy.spanTooShort(needed):undefined} onClick={()=>world.setSpan(seconds)}>{worldCopy.spanOption(seconds)}</button>;})}
   </div>
   <div className={styles.rowTools}>
    {canRemoveRow(arrangement)&&<button type="button" className={styles.rowTool} onClick={world.removeRow}>{worldCopy.removeRow}</button>}
    <button type="button" className={styles.rowTool} data-primary onClick={world.addRow} disabled={rows>=MAX_ROWS}><Glyph name="plus"/>{worldCopy.addRow}</button>
   </div>
  </div>
  <div className={styles.fieldGrid} style={{'--rows':rows} as CSSProperties}>
   <div className={styles.rowButtons}>
    {rowIndexes.map(row=><button key={row} type="button" className={styles.rowButton} aria-label={rowLabel(row)} onClick={()=>world.tapRow(row)}>
     {selectedUnit?<Glyph name="plus"/>:<span aria-hidden="true">{row+1}</span>}
    </button>)}
   </div>
   <div ref={area} className={styles.lanes} onClick={tap} onPointerMove={track} onPointerLeave={()=>setHover(null)}>
    {rowIndexes.map(row=><div key={row} className={styles.lane} aria-hidden="true"/>)}
    {target&&<span className={styles.dropTarget} style={spotPosition(target,rows)} aria-hidden="true"><Glyph name="plus"/></span>}
    {/* Length tails sit under the markers: a bar as long as the sound is heard, on the same seconds scale as the ruler. */}
    {arrangement.events.map(event=>{
     const unit=unitOf(arrangement,event.unitId);if(!unit)return null;
     const seconds=heardSeconds(unit,event),length=seconds/spanSeconds;
     const selected=selectedEvent?.id===event.id,dragging=drag?.item.kind==='event'&&drag.item.eventId===event.id;
     // The length reads on the tail when the tail clears the marker; a short sound shows it beside the name instead.
     // A sound that outlasts the field is cut off at the edge with a fade (it still plays in full).
     const onTail=length>MARKER_HALF*2.4,position=spotPosition(event,rows),overflow=event.at+length>1;
     return <button key={event.id} type="button" data-tail className={styles.tail} data-marker={markerFor(unit.markerIndex).id}
      data-selected={selected||undefined} data-sounding={world.sounding.has(event.id)||undefined} data-dragging={dragging||undefined} data-overflow={overflow||undefined}
      style={{...position,'--len':`${length*(1-2*FIELD_INSET)*100}%`,'--left':position.left} as CSSProperties}
      aria-label={worldCopy.tailLabel(unit.name,secondsText(seconds*1000))} onClick={()=>{world.selectEvent(event.id);onTrim(event.id);}}>
      <i className={styles.tailBar}/>
      {onTail&&<b className={styles.tailText}>{worldCopy.seconds(secondsText(seconds*1000))}</b>}
     </button>;
    })}
    {world.playhead!==null&&<span className={styles.playhead} style={{left:timePosition(world.playhead)}} aria-hidden="true"/>}
    <p id="field-keys" className={styles.srOnly}>{worldCopy.keyboardHint}</p>
    <ul className={styles.events} aria-label={worldCopy.placedList} aria-describedby="field-keys">
     {arrangement.events.map(event=>{
      const unit=unitOf(arrangement,event.unitId);if(!unit)return null;
      const selected=selectedEvent?.id===event.id,dragging=drag?.item.kind==='event'&&drag.item.eventId===event.id;
      const seconds=heardSeconds(unit,event),short=seconds/spanSeconds<=MARKER_HALF*2.4;
      return <li key={event.id} className={styles.placed} style={spotPosition(event,rows)} data-selected={selected||undefined}
       data-sounding={world.sounding.has(event.id)||undefined} data-dragging={dragging||undefined}>
       <button type="button" data-event className={styles.placedButton} aria-pressed={selected}
        aria-label={worldCopy.eventLabel(markerNumber(unit.markerIndex),unit.name,order.indexOf(event.id)+1,order.length,secondsText(seconds*1000))}
        {...bind({kind:'event',eventId:event.id})}
        onKeyDown={key=>{
         if(key.key==='Delete'||key.key==='Backspace'){key.preventDefault();world.remove(event.id);}
         else if(key.key==='Escape')world.deselect();
         else if(key.key.startsWith('Arrow')&&world.keyMove(event.id,key.key))key.preventDefault();
        }}>
        <SoundMarker index={unit.markerIndex} className={styles.placedMarker} face={world.sounding.has(event.id)?'happy':'calm'}/>
        <span className={styles.placedName}>{markerNumber(unit.markerIndex)} · {unit.name}{short&&<small>{worldCopy.seconds(secondsText(seconds*1000))}</small>}</span>
       </button>
      </li>;
     })}
    </ul>
    {selectedEvent&&!drag&&<EventToolbar world={world} event={selectedEvent} rows={rows} onTrim={()=>onTrim(selectedEvent.id)}/>}
   </div>
   <div className={styles.ruler} aria-hidden="true">
    <i/>
    {ticks.map(second=><span key={second} style={{left:timePosition(second/spanSeconds)}}>{worldCopy.seconds(String(second))}</span>)}
   </div>
  </div>
 </section>;
}
