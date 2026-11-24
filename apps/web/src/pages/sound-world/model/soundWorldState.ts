// Pure state for 万物声场: what is selected, where every occurrence sits, which excerpt it plays, and the mood.
// Positions are business coordinates (0–1 along time + a layout row); the layout turns them into pixels.
// Only left → right changes what is heard. The page may move a sound to another row to keep it readable, but it never
// moves a sound in time — when the child picks a moment, that moment stays.
import {ARRANGEMENT_MAX_EVENTS,ARRANGEMENT_MAX_UNITS,DEFAULT_ROWS,MAX_ROWS,MIN_CLIP_MS,SPAN_CHOICES,isValidMood} from '@wanwu-v2/contracts/arrangement';
import type {Arrangement,MoodChoice,PlacedEvent,SourceClip,SpanSeconds} from '@wanwu-v2/contracts/arrangement';
import {SOUND_SOURCE_MAX_MS} from '@wanwu-v2/contracts/sound';
import type {SoundAnalysis,SoundUnitDraft} from '@wanwu-v2/contracts/sound';
import {defaultClipFor} from '@wanwu-v2/sound-rules/shaping';
import {MARKER_HALF,coverageEnd,fitSpan,freeRow,rowIsFree,spanHolds,unitOf,withSpan} from '../../../shared/creation/arrangementTiming.ts';
// Timing and row tidying live in shared/creation (万物成曲 reads the same); re-exported for this page's modules.
export {MARKER_HALF,clipSeconds,freeRow,heardSeconds,longestSound,minSpan,planPlayback,resettleRows,rowIsFree,spanHolds,unitOf} from '../../../shared/creation/arrangementTiming.ts';
export type {PlannedEvent} from '../../../shared/creation/arrangementTiming.ts';

export type Selection={kind:'unit';unitId:string}|{kind:'event';eventId:string}|null;
export type NoticeKey='pick-first'|'mood-model-off'|'events-full'|'units-full'|'rows-full'|'row-crowded'|'need-event'|'compose-unavailable'|'load-failed'|'no-audio'|'missing-audio'|'background-failed';
export type WorldNotice={tone:'info'|'error';key:NoticeKey}|null;
/** `span-fitted`: a sound got longer than the field, so the field grew to hold it; `span-blocked`: a length too short
 *  for the longest sound was asked for and refused. */
export type LastAction='placed'|'moved'|'copied'|'span'|'span-fitted'|'span-blocked'|'removed'|'cleared'|'row-added'|'clipped'
 /** Choices the frog explains (the row and the mood picker carry no small text): mood, background switch, 课本灵感. */
 |'mood'|'background-on'|'background-off'|'inspiration'|null;
export type SoundWorldState={
 arrangement:Arrangement|null;
 selection:Selection;
 notice:WorldNotice;
 lastAction:LastAction;
 /** 摆好了 was pressed but 万物成曲 is not open yet; cleared by the next edit. */
 blocked:boolean;
};
export type SoundWorldAction=
 |{type:'loaded';arrangement:Arrangement}
 |{type:'select-unit';unitId:string}
 |{type:'select-event';eventId:string}
 |{type:'deselect'}
 |{type:'place';unitId:string;eventId:string;at:number;row:number;clip:SourceClip;now:Date}
 /** `exact` keeps the requested row even if it overlaps (keyboard ↑↓); otherwise a free row near it is used. */
 |{type:'move';eventId:string;at:number;row:number;exact?:boolean;now:Date}
 |{type:'copy';eventId:string;newId:string;now:Date}
 |{type:'remove';eventId:string;now:Date}
 |{type:'clip';eventId:string;clip:SourceClip;now:Date}
 /** A source's real length became known: excerpts that reach past it are shortened (not counted as an edit). */
 |{type:'source-length';sourceId:string;durationMs:number}
 |{type:'add-unit';unit:SoundUnitDraft;now:Date}
 |{type:'add-row';now:Date}
 |{type:'remove-row';now:Date}
 |{type:'clear-events';now:Date}
 |{type:'mood';mood:MoodChoice|null;now:Date}
 |{type:'span';spanSeconds:SpanSeconds;now:Date}
 |{type:'blocked'}
 /** A shared setting changed outside the arrangement (background switch, 课本灵感): only what the frog says changes. */
 |{type:'said';lastAction:'background-on'|'background-off'|'inspiration'}
 |{type:'notice';notice:WorldNotice};

/** 复制 puts the copy right after the original ends, with this small breath. */
export const COPY_GAP=.01;

export const initialSoundWorld:SoundWorldState={arrangement:null,selection:null,notice:null,lastAction:null,blocked:false};

export function clampAt(at:number){return Math.round(Math.min(1,Math.max(0,at))*200)/200;}
export function clampRow(row:number,rows:number){return Math.min(rows-1,Math.max(0,Math.round(row)));}

// ----- excerpts and lengths -----
/**
 * Excerpt for a newly placed sound: the whole sound without the silence around it (up to 45 s); the child picks a
 * part with 剪一剪 — 长短 changes how long each sound lasts, not which part is used. Before the audio is analysed: the
 * whole recording, fitted once it is decoded.
 */
export function placedClip(analysis:SoundAnalysis|null,sourceMs:number|null):SourceClip{
 return analysis?fitClip(defaultClipFor(analysis,MIN_CLIP_MS),analysis.durationMs):defaultClip(sourceMs);
}
export function defaultClip(sourceMs:number|null):SourceClip{
 return fitClip({startMs:0,endMs:SOUND_SOURCE_MAX_MS},sourceMs);
}
/** Keeps an excerpt inside the recording (and the 45 s limit) and at least MIN_CLIP_MS long. */
export function fitClip(clip:SourceClip,sourceMs:number|null):SourceClip{
 const total=Math.max(MIN_CLIP_MS,Math.min(SOUND_SOURCE_MAX_MS,Math.round(sourceMs??SOUND_SOURCE_MAX_MS)));
 const endMs=Math.min(total,Math.max(Math.round(clip.endMs),MIN_CLIP_MS));
 const startMs=Math.min(Math.max(0,Math.round(clip.startMs)),endMs-MIN_CLIP_MS);
 return {startMs,endMs};
}

// ----- rows: the only thing the page may change for the child -----
/** Where a sound goes when placed from a row button: right after the last sound in that row. */
export function rowEndSpot(arrangement:Arrangement,row:number){
 const ends=arrangement.events.filter(event=>event.row===row).map(event=>coverageEnd(arrangement,event));
 return ends.length?clampAt(Math.max(...ends)+MARKER_HALF):0;
}
/** Settle an occurrence: same time always; a free row if there is one, else stay and say it is crowded. */
function settle(arrangement:Arrangement,event:PlacedEvent,exact=false):{event:PlacedEvent;crowded:boolean}{
 if(exact)return {event,crowded:!rowIsFree(arrangement,event,event.row)};
 const row=freeRow(arrangement,event,event.row);
 return row===null?{event,crowded:true}:{event:{...event,row},crowded:false};
}
const crowdedNotice=(crowded:boolean):WorldNotice=>crowded?{tone:'info',key:'row-crowded'}:null;
export function placedCount(arrangement:Arrangement|null,unitId:string){return arrangement?.events.filter(event=>event.unitId===unitId).length??0;}
export function eventOf(arrangement:Arrangement|null,eventId:string){return arrangement?.events.find(event=>event.id===eventId)??null;}
export function nextMarkerIndex(arrangement:Arrangement){
 const used=new Set(arrangement.units.map(unit=>unit.markerIndex));
 let index=0;while(used.has(index))index++;
 return index;
}
/** An extra row can be taken away again only while it is the last one and empty. */
export function canRemoveRow(arrangement:Arrangement){
 return arrangement.rows>DEFAULT_ROWS&&!arrangement.events.some(event=>event.row===arrangement.rows-1);
}

/** Any change by the child makes the arrangement theirs. */
const edit=(state:SoundWorldState,arrangement:Arrangement,now:Date,extra:Partial<SoundWorldState>={}):SoundWorldState=>
 ({...state,arrangement:{...arrangement,origin:'child',updatedAt:now.toISOString()},notice:null,blocked:false,...extra});
const replace=(work:Arrangement,next:PlacedEvent)=>work.events.map(event=>event.id===next.id?next:event);
/** One sound is never longer than the field: grow the field when an edit made a sound too long, and say so. */
const fitted=(next:Arrangement,action:LastAction):{arrangement:Arrangement;lastAction:LastAction}=>{
 const fit=fitSpan(next);
 return {arrangement:fit,lastAction:fit.spanSeconds!==next.spanSeconds?'span-fitted':action};
};

export function soundWorldReducer(state:SoundWorldState,action:SoundWorldAction):SoundWorldState{
 if(action.type==='loaded')return {...initialSoundWorld,arrangement:fitSpan(action.arrangement)};
 const work=state.arrangement;
 if(!work)return state;
 switch(action.type){
  case 'select-unit':{
   if(!unitOf(work,action.unitId))return state;
   const same=state.selection?.kind==='unit'&&state.selection.unitId===action.unitId;
   return {...state,selection:same?null:{kind:'unit',unitId:action.unitId},notice:null,lastAction:null};
  }
  case 'select-event':
   // Tapping a placed sound selects it (and plays it); tapping again keeps it selected. Empty space or Esc lets go.
   if(!eventOf(work,action.eventId))return state;
   if(state.selection?.kind==='event'&&state.selection.eventId===action.eventId)return state;
   return {...state,selection:{kind:'event',eventId:action.eventId},notice:null,lastAction:null};
  case 'deselect':return {...state,selection:null};
  case 'place':{
   if(!unitOf(work,action.unitId))return state;
   if(work.events.length>=ARRANGEMENT_MAX_EVENTS)return {...state,notice:{tone:'error',key:'events-full'}};
   const {event,crowded}=settle(work,{id:action.eventId,unitId:action.unitId,at:clampAt(action.at),row:clampRow(action.row,work.rows),clip:fitClip(action.clip,null)});
   // The new occurrence becomes the selection, so its toolbar (试听 / 剪一剪 / 再响一次 / 移除) is right there.
   const next=fitted({...work,events:[...work.events,event]},'placed');
   return edit(state,next.arrangement,action.now,
    {selection:{kind:'event',eventId:event.id},lastAction:next.lastAction,notice:next.lastAction==='span-fitted'?null:crowdedNotice(crowded)});
  }
  case 'move':{
   const current=eventOf(work,action.eventId);if(!current)return state;
   const {event,crowded}=settle(work,{...current,at:clampAt(action.at),row:clampRow(action.row,work.rows)},action.exact);
   if(event.at===current.at&&event.row===current.row)return {...state,selection:{kind:'event',eventId:current.id},notice:crowdedNotice(crowded)};
   return edit(state,{...work,events:replace(work,event)},action.now,{selection:{kind:'event',eventId:current.id},lastAction:'moved',notice:crowdedNotice(crowded)});
  }
  case 'copy':{
   const source=eventOf(work,action.eventId);if(!source)return state;
   if(work.events.length>=ARRANGEMENT_MAX_EVENTS)return {...state,notice:{tone:'error',key:'events-full'}};
   // Same sound identity (unitId) and excerpt, new event identity; it follows the original in the same row,
   // just far enough that the two markers and the original's tail stay apart.
   const after=clampAt(coverageEnd(work,source)+MARKER_HALF+COPY_GAP);
   const {event,crowded}=settle(work,{...source,id:action.newId,at:after});
   return edit(state,{...work,events:[...work.events,event]},action.now,
    {selection:{kind:'event',eventId:event.id},lastAction:'copied',notice:crowdedNotice(crowded)});
  }
  case 'remove':{
   if(!eventOf(work,action.eventId))return state;
   return edit(state,{...work,events:work.events.filter(event=>event.id!==action.eventId)},action.now,{selection:null,lastAction:'removed'});
  }
  case 'clip':{
   const current=eventOf(work,action.eventId);if(!current)return state;
   // A longer excerpt may now reach the next sound in its row: the edited sound moves to a free row, never in time.
   const {event,crowded}=settle(work,{...current,clip:fitClip(action.clip,null)});
   const next=fitted({...work,events:replace(work,event)},'clipped');
   return edit(state,next.arrangement,action.now,{selection:{kind:'event',eventId:event.id},lastAction:next.lastAction,notice:next.lastAction==='span-fitted'?null:crowdedNotice(crowded)});
  }
  case 'source-length':{
   const ids=new Set(work.units.filter(unit=>unit.sourceId===action.sourceId).map(unit=>unit.id));
   let changed=false;
   const events=work.events.map(event=>{
    if(!ids.has(event.unitId))return event;
    const clip=fitClip(event.clip,action.durationMs);
    if(clip.startMs===event.clip.startMs&&clip.endMs===event.clip.endMs)return event;
    changed=true;return {...event,clip};
   });
   return changed?{...state,arrangement:fitSpan({...work,events})}:state;
  }
  case 'add-unit':{
   if(work.units.some(unit=>unit.id===action.unit.id))return {...state,selection:{kind:'unit',unitId:action.unit.id}};
   if(work.units.length>=ARRANGEMENT_MAX_UNITS)return {...state,notice:{tone:'error',key:'units-full'}};
   const unit={...action.unit,markerIndex:nextMarkerIndex(work)};
   return edit(state,{...work,units:[...work.units,unit]},action.now,{selection:{kind:'unit',unitId:unit.id},lastAction:null});
  }
  case 'add-row':
   if(work.rows>=MAX_ROWS)return {...state,notice:{tone:'info',key:'rows-full'}};
   return edit(state,{...work,rows:work.rows+1},action.now,{lastAction:'row-added'});
  case 'remove-row':
   if(!canRemoveRow(work))return state;
   return edit(state,{...work,rows:work.rows-1},action.now,{lastAction:null});
  case 'clear-events':return edit(state,{...work,events:[]},action.now,{selection:null,lastAction:'cleared'});
  case 'mood':
   if(action.mood!==null&&!isValidMood(action.mood))return state;
   return edit(state,{...work,mood:action.mood},action.now,{lastAction:'mood'});
  case 'span':
   if(!SPAN_CHOICES.includes(action.spanSeconds)||action.spanSeconds===work.spanSeconds)return state;
   // Too short for the longest sound: refused, and the frog says which sound needs more room.
   if(!spanHolds(work,action.spanSeconds))return {...state,notice:null,lastAction:'span-blocked'};
   return edit(state,withSpan(work,action.spanSeconds),action.now,{lastAction:'span'});
  case 'blocked':return {...state,blocked:true,notice:{tone:'info',key:'compose-unavailable'}};
  case 'said':return {...state,notice:null,lastAction:action.lastAction};
  case 'notice':return {...state,notice:action.notice};
 }
}

/** Keyboard nudges for a selected occurrence: ←→ change order, ↑↓ change row (layout only). */
export function nudge(event:PlacedEvent,key:string,rows:number):{at:number;row:number;exact?:boolean}|null{
 switch(key){
  case 'ArrowLeft':return {at:clampAt(event.at-.02),row:event.row};
  case 'ArrowRight':return {at:clampAt(event.at+.02),row:event.row};
  case 'ArrowUp':return event.row>0?{at:event.at,row:event.row-1,exact:true}:null;
  case 'ArrowDown':return event.row<rows-1?{at:event.at,row:event.row+1,exact:true}:null;
  default:return null;
 }
}
