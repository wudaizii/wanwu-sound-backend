// 万物声场 arrangement contract: which sound units are in a work, where the child placed each occurrence, and the mood.
// Business coordinates only — never viewport pixels — so any layout (phone, desktop, 万物成曲's score) keeps the same
// order and event identity. The child's placement belongs to the child; no later step rewrites it.
//
// Left → right is the only thing that changes what is heard (先响起 → 后响起). Rows exist only so sounds placed
// close in time don't cover each other; moving a sound to another row never changes its sound.
import {SOUND_SOURCE_MAX_MS,parseSoundUnitDraft} from './sound.ts';
import type {SoundUnitDraft} from './sound';

export const ARRANGEMENT_CONTRACT_VERSION='arrangement-v1' as const;

/** The field starts with three rows; a child can add rows when it gets crowded. */
export const DEFAULT_ROWS=3;
export const MAX_ROWS=5;

/** Preset moods a child can pick for the piece. They describe the piece, never the child, and never move a sound. */
export type MoodId='happy'|'calm'|'lively'|'sad'|'angry'|'scared'|'curious';
export const MOODS:readonly MoodId[]=['happy','calm','lively','sad','angry','scared','curious'];
export const MOOD_TEXT_MAX=12;
/**
 * The child's mood choice. `custom` is the child's own words, accepted only while a model is connected to understand
 * them; `nearest` is the preset the model found closest (null if none) — the child's words are kept as written.
 */
export type MoodChoice={kind:'preset';id:MoodId}|{kind:'custom';text:string;nearest:MoodId|null};

/** How long the field lasts (the child can switch it; at most 45 s). 万物成曲 offers the same three; the field starts at 30 s. */
export const SPAN_CHOICES=[20,30,45] as const;
export type SpanSeconds=(typeof SPAN_CHOICES)[number];
export const DEFAULT_SPAN_SECONDS:SpanSeconds=30;

/**
 * The part of the original recording this occurrence uses, chosen by the child (节选). Milliseconds from the start of
 * the source. The original is never cut or rewritten — this is only a reference into it.
 */
export type SourceClip={startMs:number;endMs:number};
export const MIN_CLIP_MS=200;

/**
 * One occurrence of a sound unit in the field. `id` is the event identity; `unitId` is the sound's identity, so repeating
 * a sound adds events that share a unitId. `at` is 0–1 along 先响起 → 后响起 (× spanSeconds = start time).
 * `row` (0-based, top first) is layout only. `clip` is the excerpt this occurrence plays.
 */
export type PlacedEvent={id:string;unitId:string;at:number;row:number;clip:SourceClip};

/** `example` until the child changes anything; then it is the child's own arrangement. */
export type ArrangementOrigin='example'|'child';
export type Arrangement={
 version:typeof ARRANGEMENT_CONTRACT_VERSION;
 id:string;
 /** Snapshot of the sound units used in this work; markerIndex is unique within the work. */
 units:SoundUnitDraft[];
 events:PlacedEvent[];
 /** How many rows the field shows (DEFAULT_ROWS…MAX_ROWS). */
 rows:number;
 /** Seconds the 0–1 positions span. */
 spanSeconds:SpanSeconds;
 /** Null means 先不选. Used later by 万物成曲 (background, inspiration); it never alters the placement. */
 mood:MoodChoice|null;
 origin:ArrangementOrigin;
 updatedAt:string;
};

export const ARRANGEMENT_MAX_EVENTS=24;
export const ARRANGEMENT_MAX_UNITS=12;

/** Events in listening order (left to right; ties keep top → bottom), for playback, lists and the score. */
export function eventsInOrder(events:readonly PlacedEvent[]){
 return [...events].sort((a,b)=>a.at-b.at||a.row-b.row);
}

export function isValidMood(value:unknown):value is MoodChoice{
 if(!value||typeof value!=='object')return false;
 const mood=value as Record<string,unknown>;
 if(mood.kind==='preset')return MOODS.includes(mood.id as MoodId);
 if(mood.kind!=='custom'||typeof mood.text!=='string')return false;
 const length=[...mood.text.trim()].length;
 return length>0&&length<=MOOD_TEXT_MAX&&(mood.nearest===null||MOODS.includes(mood.nearest as MoodId));
}

export function isValidClip(clip:unknown):clip is SourceClip{
 if(!clip||typeof clip!=='object')return false;
 const {startMs,endMs}=clip as Record<string,unknown>;
 return Number.isInteger(startMs)&&Number.isInteger(endMs)&&(startMs as number)>=0
  &&(endMs as number)-(startMs as number)>=MIN_CLIP_MS&&(endMs as number)<=SOUND_SOURCE_MAX_MS;
}

/** Validates an incoming arrangement (future API or storage) before the UI trusts it. */
export function parseArrangement(value:unknown):Arrangement|null{
 if(!value||typeof value!=='object')return null;
 const raw=value as Record<string,unknown>;
 if(raw.version!==ARRANGEMENT_CONTRACT_VERSION||typeof raw.id!=='string'||!raw.id||typeof raw.updatedAt!=='string')return null;
 if(raw.origin!=='example'&&raw.origin!=='child')return null;
 if(raw.mood!==null&&!isValidMood(raw.mood))return null;
 if(!Number.isInteger(raw.rows)||(raw.rows as number)<DEFAULT_ROWS||(raw.rows as number)>MAX_ROWS)return null;
 if(!SPAN_CHOICES.includes(raw.spanSeconds as SpanSeconds))return null;
 if(!Array.isArray(raw.units)||!Array.isArray(raw.events))return null;
 if(raw.units.length>ARRANGEMENT_MAX_UNITS||raw.events.length>ARRANGEMENT_MAX_EVENTS)return null;
 const units:SoundUnitDraft[]=[];
 for(const item of raw.units){const unit=parseSoundUnitDraft(item);if(!unit)return null;units.push(unit);}
 if(new Set(units.map(unit=>unit.id)).size!==units.length)return null;
 if(new Set(units.map(unit=>unit.markerIndex)).size!==units.length)return null;
 const unitIds=new Set(units.map(unit=>unit.id)),eventIds=new Set<string>();
 for(const item of raw.events){
  if(!item||typeof item!=='object')return null;
  const event=item as Record<string,unknown>;
  if(typeof event.id!=='string'||!event.id||eventIds.has(event.id))return null;
  if(typeof event.unitId!=='string'||!unitIds.has(event.unitId))return null;
  if(typeof event.at!=='number'||!Number.isFinite(event.at)||event.at<0||event.at>1)return null;
  if(!Number.isInteger(event.row)||(event.row as number)<0||(event.row as number)>=(raw.rows as number))return null;
  if(!isValidClip(event.clip))return null;
  eventIds.add(event.id);
 }
 return raw as Arrangement;
}
