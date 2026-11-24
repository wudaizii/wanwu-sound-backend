// Mood-interpreter port. A child's own mood words (自己写) are accepted only while a model is connected to understand
// them; the model maps the words to the closest preset for 万物成曲, and the child's words are kept exactly as written.
// No model is connected yet, so the offline interpreter reports itself unavailable and the page says so plainly.
//
// Intended server endpoint (protocol v0.4; not implemented; the key stays on the server; open to visitors, limited per
// IP and device):
//   POST /api/v1/moods/interpret  ← {text}  → {nearest: MoodId|null}
import {MOOD_TEXT_MAX,MOODS} from '@wanwu-v2/contracts/arrangement';
import type {MoodId} from '@wanwu-v2/contracts/arrangement';

export type MoodInterpretation={nearest:MoodId|null};
export type MoodInterpreter={
 /** Whether custom words can be accepted right now. */
 available:boolean;
 interpret(text:string,signal?:AbortSignal):Promise<MoodInterpretation|null>;
};

export const offlineMoodInterpreter:MoodInterpreter={available:false,async interpret(){return null;}};

/** Trim and cap the child's words; empty means nothing to send. */
export function cleanMoodText(text:string){const clean=[...text.replace(/\s+/g,' ').trim()].slice(0,MOOD_TEXT_MAX).join('');return clean||null;}
/** Guards whatever a future model returns before the page trusts it. */
export function parseInterpretation(value:unknown):MoodInterpretation|null{
 if(!value||typeof value!=='object')return null;
 const nearest=(value as Record<string,unknown>).nearest;
 return nearest===null||MOODS.includes(nearest as MoodId)?{nearest:nearest as MoodId|null}:null;
}
