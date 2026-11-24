// 讲解契约 (talk-v1): what is said about a piece and a textbook song, and what an AI may send back for it.
//
// The facts are always counted by the program (音乐小发现 from the arrangement, 碰一碰 from the rules), so every
// sentence is true of this piece. The local corpus (@wanwu-v2/prompts/corpus) says them first, without a network; an AI
// may only reword them later. A brief never carries recordings, people, places or the sound names a child typed: sounds
// are written as numbered tokens (「声音1」) and the page puts the names back after checking the reply.
import {MOODS} from './arrangement.ts';
import type {MoodId} from './arrangement';
import {TEXTBOOK_VARIATIONS} from './textbook.ts';
import type {Metre,TextbookVariation} from './textbook';

export const TALK_CONTRACT_VERSION='talk-v1' as const;

/** One small observation counted from the arrangement. `N` is how a sound is named: its name on the page, a token in a brief. */
export type Discovery<N extends string=string>=
 |{kind:'opening';first:N;next:N|null}
 |{kind:'repeat';name:N;times:number}
 |{kind:'echo';a:N;b:N}
 |{kind:'together';a:N;b:N}
 |{kind:'long-short';long:N;longSeconds:number;short:N;shortSeconds:number}
 |{kind:'rest';seconds:number}
 |{kind:'busier';half:'first'|'second'}
 |{kind:'ending';name:N;same:boolean}
 |{kind:'single';name:N};
export type DiscoveryKind=Discovery['kind'];
export const DISCOVERY_KINDS:readonly DiscoveryKind[]=['opening','repeat','echo','together','long-short','rest','busier','ending','single'];

/** What happened when the textbook song's feature met the child's sounds (found by the background rules). */
export type MeetingKind='together'|'answer'|'fill'|'under';
export const MEETING_KINDS:readonly MeetingKind[]=['together','answer','fill','under'];

/** Who wrote what the page shows: the local corpus, or an AI rewording that passed every check. */
export type TalkOrigin='local'|'ai';

/** A sound in a brief: 「声音1」, 「声音2」… numbered in listening order. */
export type SoundToken=`声音${number}`;
export const soundToken=(index:number):SoundToken=>`声音${index+1}`;
export const isSoundToken=(value:unknown):value is SoundToken=>typeof value==='string'&&/^声音[1-9]\d?$/.test(value);

// ----- 作品讲解 / 音乐小发现 -----
export const WORK_TALK_BRIEF_VERSION='work-talk-brief-v1' as const;
export type WorkTalkBrief={
 version:typeof WORK_TALK_BRIEF_VERSION;
 /** The piece's length (seconds) and mood; the textbook song's title when one is chosen (titles name no one). */
 seconds:number;mood:MoodId|null;textbookTitle:string|null;
 facts:Discovery<SoundToken>[];
};
/** One child line per fact (same order, same kinds), and one thing to try right away. */
export type WorkTalkReply={lines:{kind:DiscoveryKind;line:string}[];tryThis:string};

// ----- 课本讲解 -----
export const TEXTBOOK_TALK_BRIEF_VERSION='textbook-talk-brief-v1' as const;
export type TextbookTalk={feature:string;shape:string;meeting:string;task:string};
export const TEXTBOOK_TALK_PARTS:readonly (keyof TextbookTalk)[]=['feature','shape','meeting','task'];
export type TextbookTalkBrief={
 version:typeof TEXTBOOK_TALK_BRIEF_VERSION;
 title:string;metre:Metre;rhythm:string;childLine:string;
 variation:TextbookVariation;meeting:MeetingKind;
 /** The child's sound that met the beat, as a token; null when none. */
 example:SoundToken|null;
 /** The four local sentences (with tokens): the AI rewords these, it does not start from nothing. */
 local:TextbookTalk;
};

const nonEmpty=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
const count=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0;

export function isDiscovery(value:unknown,name:(value:unknown)=>boolean=nonEmpty):value is Discovery{
 if(!value||typeof value!=='object')return false;
 const raw=value as Record<string,unknown>;
 switch(raw.kind){
  case 'opening':return name(raw.first)&&(raw.next===null||name(raw.next));
  case 'repeat':return name(raw.name)&&Number.isInteger(raw.times)&&(raw.times as number)>=2;
  case 'echo':case 'together':return name(raw.a)&&name(raw.b);
  case 'long-short':return name(raw.long)&&name(raw.short)&&count(raw.longSeconds)&&count(raw.shortSeconds);
  case 'rest':return count(raw.seconds);
  case 'busier':return raw.half==='first'||raw.half==='second';
  case 'ending':return name(raw.name)&&typeof raw.same==='boolean';
  case 'single':return name(raw.name);
  default:return false;
 }
}

export function isWorkTalkBrief(value:unknown):value is WorkTalkBrief{
 if(!value||typeof value!=='object')return false;
 const raw=value as Record<string,unknown>;
 return raw.version===WORK_TALK_BRIEF_VERSION&&count(raw.seconds)&&(raw.mood===null||MOODS.includes(raw.mood as MoodId))
  &&(raw.textbookTitle===null||nonEmpty(raw.textbookTitle))
  &&Array.isArray(raw.facts)&&raw.facts.length>0&&raw.facts.every(fact=>isDiscovery(fact,isSoundToken));
}

export function isTextbookTalkBrief(value:unknown):value is TextbookTalkBrief{
 if(!value||typeof value!=='object')return false;
 const raw=value as Record<string,unknown>,local=raw.local as Record<string,unknown>|null;
 return raw.version===TEXTBOOK_TALK_BRIEF_VERSION&&nonEmpty(raw.title)&&[2,3,4].includes(raw.metre as number)&&nonEmpty(raw.rhythm)&&nonEmpty(raw.childLine)
  &&TEXTBOOK_VARIATIONS.includes(raw.variation as TextbookVariation)&&MEETING_KINDS.includes(raw.meeting as MeetingKind)
  &&(raw.example===null||isSoundToken(raw.example))
  &&!!local&&typeof local==='object'&&TEXTBOOK_TALK_PARTS.every(part=>nonEmpty(local[part]));
}

/** The reply's shape only; whether its words may be shown is checked against the facts by @wanwu-v2/prompts/accept. */
export function isWorkTalkReply(value:unknown):value is WorkTalkReply{
 if(!value||typeof value!=='object')return false;
 const raw=value as Record<string,unknown>;
 return Array.isArray(raw.lines)&&raw.lines.every(item=>item&&typeof item==='object'&&DISCOVERY_KINDS.includes(item.kind)&&nonEmpty(item.line))&&nonEmpty(raw.tryThis);
}
export function isTextbookTalk(value:unknown):value is TextbookTalk{
 if(!value||typeof value!=='object')return false;
 const raw=value as Record<string,unknown>;
 return TEXTBOOK_TALK_PARTS.every(part=>nonEmpty(raw[part]));
}
