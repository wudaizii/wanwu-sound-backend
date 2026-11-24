import {eventsInOrder} from '@wanwu-v2/contracts/arrangement';
import type {Arrangement,PlacedEvent,SourceClip} from '@wanwu-v2/contracts/arrangement';
import type {ChosenShape,SoundAnalysis,SoundUnitDraft} from '@wanwu-v2/contracts/sound';
import {clipHeardSeconds} from '@wanwu-v2/sound-rules/shaping';

export function heardSeconds(unit:Pick<SoundUnitDraft,'shape'|'analysis'>,event:Pick<PlacedEvent,'clip'>){
 return clipHeardSeconds(unit.shape,unit.analysis??null,event.clip);
}
export function unitOf(arrangement:Arrangement|null,unitId:string){return arrangement?.units.find(unit=>unit.id===unitId)??null;}

export type PlannedEvent={eventId:string;unitId:string;sourceId:string;startSeconds:number;clip:SourceClip;shape:ChosenShape;analysis:SoundAnalysis|null};
export function planPlayback(arrangement:Arrangement):PlannedEvent[]{
 return eventsInOrder(arrangement.events).flatMap(event=>{
  const unit=unitOf(arrangement,event.unitId);
  return unit?[{eventId:event.id,unitId:unit.id,sourceId:unit.sourceId,startSeconds:event.at*arrangement.spanSeconds,clip:event.clip,shape:unit.shape,analysis:unit.analysis??null}]:[];
 });
}

export type TimedEvent={event:PlacedEvent;unit:SoundUnitDraft;start:number;seconds:number;end:number};
export function timedEvents(arrangement:Arrangement):TimedEvent[]{
 return eventsInOrder(arrangement.events).flatMap(event=>{
  const unit=unitOf(arrangement,event.unitId);if(!unit)return [];
  const start=event.at*arrangement.spanSeconds,seconds=heardSeconds(unit,event);
  return [{event,unit,start,seconds,end:start+seconds}];
 });
}
/** Preserve the last sound, including one starting at the right edge of a 45-second field. */
export function pieceSeconds(arrangement:Arrangement){
 const last=Math.max(0,...timedEvents(arrangement).map(item=>item.end));
 return Math.max(arrangement.spanSeconds,Math.ceil(last*10-1e-6)/10);
}
