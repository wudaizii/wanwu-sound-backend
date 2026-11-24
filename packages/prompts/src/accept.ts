// Whether what an AI sent back may be shown. Shared by the server (before it answers) and the page (before it trusts the
// answer). The rules are the same for every text task:
// - the reply only rewords facts the program counted: one line per fact, same kind, same order, no new numbers;
// - sounds are named only by the tokens in the brief (「声音1」), which the page swaps back for the child's names;
// - every sentence passes the style check for its slot (length, child words, never-say words).
// A line that fails falls back to the corpus line for that fact; the rest of the reply may still be used.
import {MOODS} from '@wanwu-v2/contracts/arrangement';
import type {MoodId} from '@wanwu-v2/contracts/arrangement';
import {TEXTBOOK_TALK_PARTS,isSoundToken,isTextbookTalk,isWorkTalkReply,soundToken} from '@wanwu-v2/contracts/talk';
import type {Discovery,SoundToken,TextbookTalk,TextbookTalkBrief,WorkTalkBrief} from '@wanwu-v2/contracts/talk';
import {wordProblems} from './style.ts';
import type {Slot} from './style.ts';

// ----- names ↔ tokens -----
const NAME_FIELDS=['first','next','name','a','b','long','short'] as const;
/** Swaps the child's sound names for 「声音1」… (numbered by first mention); `names[i]` is the name behind token i+1. */
export function tokenizeFacts(facts:readonly Discovery[]):{facts:Discovery<SoundToken>[];names:string[]}{
 const names:string[]=[];
 const token=(name:string)=>{let index=names.indexOf(name);if(index<0){names.push(name);index=names.length-1;}return soundToken(index);};
 const tokenized=facts.map(fact=>{
  const copy:Record<string,unknown>={...fact};
  for(const field of NAME_FIELDS)if(typeof copy[field]==='string')copy[field]=token(copy[field] as string);
  return copy as Discovery<SoundToken>;
 });
 return {facts:tokenized,names};
}
const TOKEN=/声音([1-9]\d?)/g;
/** Puts the child's names back where the reply used tokens. */
export const restoreNames=(text:string,names:readonly string[])=>text.replace(TOKEN,(token,n:string)=>names[Number(n)-1]??token);
const tokensIn=(text:string)=>[...text.matchAll(TOKEN)].map(match=>match[0] as SoundToken);
/** Numbers a sentence states (token numbers are not counted). */
const numbersIn=(text:string)=>[...text.replace(TOKEN,'').matchAll(/\d+(?:\.\d+)?/g)].map(match=>Number(match[0]));
const factTokens=(fact:Discovery)=>Object.values(fact).filter(isSoundToken);
const factNumbers=(fact:Discovery)=>Object.values(fact).filter((value):value is number=>typeof value==='number');

/** Problems of one sentence: style for its slot, plus only the allowed tokens and numbers. */
export function lineProblems(text:string,slot:Slot,tokens:readonly string[],numbers:readonly number[]){
 const problems=wordProblems(text,slot);
 for(const token of tokensIn(text))if(!tokens.includes(token))problems.push(`提到了这条事实里没有的「${token}」`);
 for(const number of numbersIn(text))if(!numbers.includes(number))problems.push(`写了事实里没有的数字 ${number}`);
 return problems;
}

/**
 * `accepted`: every line and the try-this may be shown; `partly`: some fall back to the corpus (null);
 * `rejected`: nothing usable (wrong shape) — the page keeps the corpus. `notes` say why, for the lab and the server log.
 */
export type Acceptance<T>={status:'accepted'|'partly'|'rejected';value:T;notes:string[]};
const status=(parts:readonly unknown[]):Acceptance<unknown>['status']=>parts.every(part=>part!==null)?'accepted':parts.some(part=>part!==null)?'partly':'rejected';

// ----- 作品讲解 -----
export type WorkTalkLines={lines:(string|null)[];tryThis:string|null};
export function acceptWorkTalk(reply:unknown,brief:WorkTalkBrief):Acceptance<WorkTalkLines>{
 const none={lines:brief.facts.map(()=>null),tryThis:null};
 if(!isWorkTalkReply(reply))return {status:'rejected',value:none,notes:['回复的格式不对：要有 lines（每条 kind + line）和 tryThis']};
 const notes:string[]=[];
 if(reply.lines.length>brief.facts.length)notes.push(`多出的 ${reply.lines.length-brief.facts.length} 句已丢弃`);
 const lines=brief.facts.map((fact,i)=>{
  const item=reply.lines[i];
  if(!item){notes.push(`第 ${i+1} 条（${fact.kind}）没有写，用语料`);return null;}
  if(item.kind!==fact.kind){notes.push(`第 ${i+1} 条应该是 ${fact.kind}，回复写成了 ${item.kind}，用语料`);return null;}
  const problems=lineProblems(item.line,'discovery',factTokens(fact),factNumbers(fact));
  if(problems.length){notes.push(`第 ${i+1} 条（${fact.kind}）${problems.join('；')}，用语料`);return null;}
  return item.line.trim();
 });
 const allTokens=[...new Set(brief.facts.flatMap(factTokens))],allNumbers=brief.facts.flatMap(factNumbers);
 const tryProblems=lineProblems(reply.tryThis,'tryThis',allTokens,allNumbers);
 if(tryProblems.length)notes.push(`试一试：${tryProblems.join('；')}，用语料`);
 const value={lines,tryThis:tryProblems.length?null:reply.tryThis.trim()};
 return {status:status([...value.lines,value.tryThis]),value,notes};
}

// ----- 课本讲解润色 -----
export type TextbookTalkLines={[K in keyof TextbookTalk]:string|null};
export function acceptTextbookTalk(reply:unknown,brief:TextbookTalkBrief):Acceptance<TextbookTalkLines>{
 const none={feature:null,shape:null,meeting:null,task:null};
 if(!isTextbookTalk(reply))return {status:'rejected',value:none,notes:['回复的格式不对：要有 feature、shape、meeting、task 四句']};
 const notes:string[]=[],tokens=brief.example?[brief.example]:[];
 const value={...none} as TextbookTalkLines;
 for(const part of TEXTBOOK_TALK_PARTS){
  const text=reply[part],problems=lineProblems(text,'talk',tokens,numbersIn(brief.local[part]));
  if(part==='feature'&&!text.includes(brief.title))problems.push(`没有提到歌名「${brief.title}」`);
  if(problems.length)notes.push(`${part}：${problems.join('；')}，用本地的那句`);
  else value[part]=text.trim();
 }
 return {status:status(Object.values(value)),value,notes};
}

// ----- 向导联想（暂不开放） -----
export function acceptSoundHint(reply:unknown):Acceptance<string|null>{
 const text=reply&&typeof reply==='object'?(reply as Record<string,unknown>).text:undefined;
 if(typeof text!=='string')return {status:'rejected',value:null,notes:['回复的格式不对：要有 text']};
 const problems=lineProblems(text,'hint',[],[]);
 return problems.length?{status:'rejected',value:null,notes:problems}:{status:'accepted',value:text.trim(),notes:[]};
}

// ----- 心情“自己写” -----
/** Only one of the preset moods, or null when none is close; the child's own words are never changed. */
export function acceptMood(reply:unknown):Acceptance<{nearest:MoodId|null}|null>{
 const nearest=reply&&typeof reply==='object'?(reply as Record<string,unknown>).nearest:undefined;
 if(nearest===null||MOODS.includes(nearest as MoodId))return {status:'accepted',value:{nearest:nearest as MoodId|null},notes:[]};
 return {status:'rejected',value:null,notes:[`nearest 只能是 ${MOODS.join(' / ')} 或 null`]};
}

// ----- 课本歌曲的文字（开发期） -----
export function acceptTextbookWords(reply:unknown):Acceptance<{mood:MoodId;childLine:string}|null>{
 const raw=reply&&typeof reply==='object'?reply as Record<string,unknown>:{};
 const notes:string[]=[];
 if(!MOODS.includes(raw.mood as MoodId))notes.push(`mood 只能是 ${MOODS.join(' / ')}`);
 if(typeof raw.childLine!=='string')notes.push('要有 childLine');
 else notes.push(...lineProblems(raw.childLine.replace(/[。！]$/,''),'childLine',[],[]).map(problem=>`childLine ${problem}`));
 return notes.length?{status:'rejected',value:null,notes}:{status:'accepted',value:{mood:raw.mood as MoodId,childLine:(raw.childLine as string).trim().replace(/[。！]$/,'')},notes};
}
