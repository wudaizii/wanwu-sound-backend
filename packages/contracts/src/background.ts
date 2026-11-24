// AI background contract (background-request-v1): what the page sends when it asks the server for an AI background, and
// what comes back. The background chain is AI audio (Fun-Music) → AI notes (千问 writes a motif, the server develops and
// checks it) → local notes (rules in the browser) → only the child's sounds. The local step needs none of this.
//
// The brief is an anonymous structure summary: timing, mood, density and the textbook song's features. It never holds
// recordings, sound names, people, places or the textbook song itself — only its features; teaching music is referred to
// by the id of its upload, never its file name, audio or melody (the server has its features). The child's sounds and
// placement are never changed by any step; a background is a separate layer the child may switch back from.
import {MOODS} from './arrangement.ts';
import type {MoodId} from './arrangement';
import {DENSITIES,LEVELS,TEXTBOOK_MODES,TEXTBOOK_VARIATIONS} from './textbook.ts';
import type {Density,Level,Metre,TextbookTrack,TextbookVariation} from './textbook';

export const BACKGROUND_REQUEST_VERSION='background-request-v1' as const;

/** Which step of the chain made a background. `local-rules` is made in the browser; the other two by the server. */
export type BackgroundSource='audio-ai'|'notes-ai'|'local-rules';
export const BACKGROUND_SOURCES:readonly BackgroundSource[]=['audio-ai','notes-ai','local-rules'];
/** The steps the server may run, in the order they are tried. */
export type AiBackgroundStep=Exclude<BackgroundSource,'local-rules'>;
export const AI_BACKGROUND_STEPS:readonly AiBackgroundStep[]=['audio-ai','notes-ai'];

/** Versions of every rule file a piece was made with, so the server can mix it again the same way. */
export type RuleVersions={analysis:string;shaping:string;background:string;mix:string};

/** Only the textbook song's features — never its audio, score or melody. */
export type TextbookFeatures=Pick<TextbookTrack,'id'|'tempoBpm'|'meter'|'rhythmCell'|'onsetDensity'|'pitchRange'|'brightness'|'mode'|'repetition'|'mood'>;

export type BackgroundBrief={
 version:typeof BACKGROUND_REQUEST_VERSION;
 /** Lets the server cache per work; carries nothing about the child. */
 workId:string;
 /** The piece's real length; the background must not be longer. */
 seconds:number;
 /** When the child's sounds are heard (seconds): the background leaves room there. */
 sounding:{start:number;end:number}[];
 /** What the local rules chose, so every step starts from the same frame. */
 tempo:number;metre:Metre;mode:TextbookTrack['mode'];
 mood:MoodId|null;
 /** The arrangement in the same words as the textbook features. */
 arrangement:{density:Density;repetition:Level;register:Level};
 textbook:TextbookFeatures|null;
 /** Which shape of the song's feature to play (换几种样子); null without a textbook song. */
 variation:TextbookVariation|null;
 /**
  * Teaching music a teacher uploaded (POST /api/v1/teaching-music): the server analyses it and borrows its rhythm and feel,
  * never its melody. Only the upload's id; null without teaching music. A brief has a textbook song or teaching music,
  * never both (one inspiration at a time).
  */
 teachingMusic:{musicId:string}|null;
 /** Instrument ids the child chose (who should play the notes); [] = the original soft voice. */
 instruments:string[];
 rules:RuleVersions;
};

/** One note of an AI-notes background, already developed and checked by the server with the shared rules. */
export type BackgroundNoteData={at:number;length:number;midi:number;part:'chord'|'bass'|'melody'|'rhythm';accent:number};
export type BackgroundUnavailable='not-open'|'offline'|'quota'|'timeout'|'failed';
export type BackgroundResult=
 |{status:'ready';source:'audio-ai';audioUrl:string;durationMs:number;model:string;promptVersion:string}
 |{status:'ready';source:'notes-ai';notes:BackgroundNoteData[];model:string;promptVersion:string}
 |{status:'unavailable';reason:BackgroundUnavailable};
export const BACKGROUND_UNAVAILABLE:readonly BackgroundUnavailable[]=['not-open','offline','quota','timeout','failed'];

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const nonEmpty=(value:unknown):value is string=>typeof value==='string'&&value.length>0;
const PARTS=['chord','bass','melody','rhythm'];

export function isBackgroundBrief(value:unknown):value is BackgroundBrief{
 if(!value||typeof value!=='object')return false;
 const raw=value as Record<string,unknown>;
 if(raw.version!==BACKGROUND_REQUEST_VERSION||!nonEmpty(raw.workId)||!finite(raw.seconds)||raw.seconds<=0)return false;
 if(!Array.isArray(raw.sounding)||!raw.sounding.every(span=>span&&finite(span.start)&&finite(span.end)&&span.end>=span.start))return false;
 if(!finite(raw.tempo)||![2,3,4].includes(raw.metre as number)||!TEXTBOOK_MODES.includes(raw.mode as TextbookTrack['mode']))return false;
 if(raw.mood!==null&&!MOODS.includes(raw.mood as MoodId))return false;
 const arrangement=raw.arrangement as Record<string,unknown>|null;
 if(!arrangement||!DENSITIES.includes(arrangement.density as Density)||!LEVELS.includes(arrangement.repetition as Level)||!LEVELS.includes(arrangement.register as Level))return false;
 if(!Array.isArray(raw.instruments)||!raw.instruments.every(nonEmpty))return false;
 if(raw.variation!==null&&!TEXTBOOK_VARIATIONS.includes(raw.variation as TextbookVariation))return false;
 const teaching=raw.teachingMusic as Record<string,unknown>|null|undefined;
 if(teaching!==null&&(!teaching||typeof teaching!=='object'||!nonEmpty(teaching.musicId)||Object.keys(teaching).length!==1||raw.textbook!==null))return false;
 const rules=raw.rules as Record<string,unknown>|null;
 return !!rules&&['analysis','shaping','background','mix'].every(key=>nonEmpty(rules[key]));
}

/** Validates what the server sends back before the page plays it. */
export function parseBackgroundResult(value:unknown,seconds:number):BackgroundResult|null{
 if(!value||typeof value!=='object')return null;
 const raw=value as Record<string,unknown>;
 if(raw.status==='unavailable')return BACKGROUND_UNAVAILABLE.includes(raw.reason as BackgroundUnavailable)?raw as BackgroundResult:null;
 if(raw.status!=='ready'||!nonEmpty(raw.model)||!nonEmpty(raw.promptVersion))return null;
 if(raw.source==='audio-ai'){
  const url=raw.audioUrl;
  return nonEmpty(url)&&/^https:\/\//.test(url)&&finite(raw.durationMs)&&raw.durationMs>0&&raw.durationMs<=seconds*1000+500?raw as BackgroundResult:null;
 }
 if(raw.source==='notes-ai'){
  const notes=raw.notes;
  return Array.isArray(notes)&&notes.length>0&&notes.every(note=>note&&finite(note.at)&&note.at>=0&&finite(note.length)&&note.length>0&&note.at+note.length<=seconds+1e-6
   &&Number.isInteger(note.midi)&&PARTS.includes(note.part)&&finite(note.accent)&&note.accent>=0&&note.accent<=1)?raw as BackgroundResult:null;
 }
 return null;
}
