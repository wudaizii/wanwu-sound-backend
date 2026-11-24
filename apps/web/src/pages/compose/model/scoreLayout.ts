// The graphic score, derived from the 万物声场 arrangement only: left → right is time on the same seconds scale the
// player uses, each sound keeps its row from the field (rows only spread sounds out — they mean nothing for the sound),
// and a tail as long as the sound is heard. Nothing here is stored; change the arrangement and the score follows.
// Only this file and the score component know about positions; the playhead and progress bar read the same seconds.
import {SPAN_CHOICES} from '@wanwu-v2/contracts/arrangement';
import type {Arrangement,SpanSeconds} from '@wanwu-v2/contracts/arrangement';
import type {SoundUnitDraft} from '@wanwu-v2/contracts/sound';
import {pieceSeconds,timedEvents} from '../../../shared/creation/arrangementTiming.ts';

/** Time 0 and the end sit this far in from the score's edges, so a marker at either end stays fully visible. */
export const SCORE_INSET=.05;

export type ScoreItem={eventId:string;unit:SoundUnitDraft;row:number;start:number;seconds:number;end:number;
 /** Start and length as fractions of the whole piece (0–1). */
 left:number;length:number};
export type ScoreLayout={
 rows:number;spanSeconds:number;
 /** Real length of the piece: the chosen length, or longer when a sound outlasts it. */
 totalSeconds:number;
 items:ScoreItem[];
 /** Units in the score, by marker number, for the legend. */
 legend:SoundUnitDraft[];
 ticks:{seconds:number;at:number}[];
 /** Where the chosen length ends, when the piece runs past it (0–1); null otherwise. */
 spanMark:number|null;
};

/** Tick spacing per chosen length, the same steps as the field ruler. */
export const tickStep=(span:number)=>span<=20?5:span<=30?10:15;

export function scoreLayout(arrangement:Arrangement):ScoreLayout{
 const total=pieceSeconds(arrangement),span=arrangement.spanSeconds,step=tickStep(span);
 const items=timedEvents(arrangement).map(({event,unit,start,seconds,end})=>({eventId:event.id,unit,row:event.row,start,seconds,end,left:start/total,length:seconds/total}));
 const used=new Set(items.map(item=>item.unit.id));
 return {
  rows:arrangement.rows,spanSeconds:span,totalSeconds:total,items,
  legend:arrangement.units.filter(unit=>used.has(unit.id)).sort((a,b)=>a.markerIndex-b.markerIndex),
  ticks:Array.from({length:Math.floor(span/step)+1},(_,i)=>({seconds:i*step,at:i*step/total})),
  spanMark:total>span+1e-6?span/total:null,
 };
}

/** The three lengths with how long the piece would really last at each (a sound may run past the end). */
export function spanChoices(arrangement:Arrangement):{seconds:SpanSeconds;real:number}[]{
 return SPAN_CHOICES.map(seconds=>({seconds,real:pieceSeconds({...arrangement,spanSeconds:seconds})}));
}

/** Percent position of a 0–1 time fraction inside the score. */
export function scorePosition(fraction:number){return `${(SCORE_INSET+Math.min(1,Math.max(0,fraction))*(1-2*SCORE_INSET))*100}%`;}
/** Seconds under a pointer on the score (clamped to the piece). */
export function secondsAt(box:{left:number;width:number},x:number,totalSeconds:number){
 const fraction=((x-box.left)/box.width-SCORE_INSET)/(1-2*SCORE_INSET);
 return Math.min(totalSeconds,Math.max(0,fraction*totalSeconds));
}
/** Occurrences sounding at `seconds`: started, not yet ended. */
export function soundingAt(items:readonly ScoreItem[],seconds:number){
 return new Set(items.filter(item=>seconds>=item.start&&seconds<item.end).map(item=>item.eventId));
}
/** 00:15 style clock text; tenths are dropped (floored), so the clock never runs ahead of the sound. */
export function clockText(seconds:number){
 const whole=Math.max(0,Math.floor(seconds+1e-6));
 return `${String(Math.floor(whole/60)).padStart(2,'0')}:${String(whole%60).padStart(2,'0')}`;
}
/** Seconds as the score labels them: whole numbers plain, otherwise one decimal (3 / 3.2). */
export function secondsLabel(seconds:number){
 const tenth=Math.round(seconds*10)/10;
 return Number.isInteger(tenth)?String(tenth):tenth.toFixed(1);
}
