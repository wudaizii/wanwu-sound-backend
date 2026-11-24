// 语料 (corpus/*.json): what the guides and the teacher panel say, written by people and filled in by the program with
// facts it counted. This is what children hear today, without a network, and what every AI task falls back to. The
// files are checked when loaded (coverage, placeholders, length, words), so a bad edit fails the tests, never a page.
import discoveriesFile from '../corpus/discoveries.v1.json' with {type:'json'};
import soundHintsFile from '../corpus/sound-hints.v1.json' with {type:'json'};
import textbookTalkFile from '../corpus/textbook-talk.v1.json' with {type:'json'};
import {SOUND_CHOICES,SOUND_DIMENSIONS,SOUND_KINDS} from '@wanwu-v2/contracts/sound';
import type {SoundDimension,SoundKind} from '@wanwu-v2/contracts/sound';
import {MEETING_KINDS} from '@wanwu-v2/contracts/talk';
import type {Discovery,MeetingKind,TextbookTalk} from '@wanwu-v2/contracts/talk';
import {TEXTBOOK_VARIATIONS} from '@wanwu-v2/contracts/textbook';
import type {Metre,TextbookTrack,TextbookVariation} from '@wanwu-v2/contracts/textbook';
import {fill,unknownPlaceholders} from './fill.ts';
import {wordProblems} from './style.ts';
import type {Slot} from './style.ts';

// ----- file shapes -----
export type HintEntry={lines:string[];byKind?:Partial<Record<SoundKind,string>>};
export type SoundHintsCorpus={version:string;hints:Record<SoundDimension,Record<string,HintEntry>>};
export type DiscoveryKey='opening'|'opening-alone'|'repeat'|'echo'|'together'|'long-short'|'rest'|'busier-first'|'busier-second'|'ending'|'ending-same'|'single';
export type DiscoveryText={line:string;idea:string;explain:string;ask:string;tryThis:string};
export type DiscoveriesCorpus={version:string;kinds:Record<DiscoveryKey,DiscoveryText>};
export type TextbookTalkCorpus={
 version:string;metres:Record<`${Metre}`,string>;rhythm:{short:string;beat:string;long:string};feature:string;
 shapes:Record<TextbookVariation,string>;meetings:Record<MeetingKind,{line:string;named?:string}>;tasks:Record<MeetingKind,string>;
};

/** The facts each discovery sentence may name. */
export const DISCOVERY_PLACEHOLDERS:Record<DiscoveryKey,readonly string[]>={
 opening:['first','next'],'opening-alone':['first'],repeat:['name','times'],echo:['a','b'],together:['a','b'],
 'long-short':['long','longSeconds','short','shortSeconds'],rest:['seconds'],'busier-first':[],'busier-second':[],
 ending:['name'],'ending-same':['name'],single:['name'],
};
const DISCOVERY_SLOTS:Record<keyof DiscoveryText,Slot>={line:'discovery',idea:'idea',explain:'explain',ask:'ask',tryThis:'tryThis'};

// ----- checks -----
function check(where:string,text:unknown,slot:Slot,allowed:readonly string[]){
 if(typeof text!=='string')return [`${where} 应该是一句话`];
 return [...unknownPlaceholders(where,text,allowed),...wordProblems(text,slot).map(problem=>`${where}：${problem}`)];
}

export function soundHintsProblems(file:SoundHintsCorpus){
 const problems:string[]=[];
 for(const dimension of SOUND_DIMENSIONS)for(const value of SOUND_CHOICES[dimension]){
  const where=`sound-hints.${dimension}.${value}`,entry=file.hints[dimension]?.[value];
  if(!entry||!Array.isArray(entry.lines)||!entry.lines.length){problems.push(`${where} 至少要有一句`);continue;}
  entry.lines.forEach((line,i)=>problems.push(...check(`${where}.lines[${i}]`,line,'hint',[])));
  for(const [kind,line] of Object.entries(entry.byKind??{})){
   if(!SOUND_KINDS.includes(kind as SoundKind))problems.push(`${where}.byKind.${kind} 不认识（只能是 ${SOUND_KINDS.join(' / ')}）`);
   problems.push(...check(`${where}.byKind.${kind}`,line,'hint',[]));
  }
 }
 return problems;
}

export function discoveriesProblems(file:DiscoveriesCorpus){
 const problems:string[]=[];
 for(const key of Object.keys(DISCOVERY_PLACEHOLDERS) as DiscoveryKey[]){
  const entry=file.kinds[key];
  if(!entry){problems.push(`discoveries.${key} 缺少`);continue;}
  for(const field of Object.keys(DISCOVERY_SLOTS) as (keyof DiscoveryText)[])
   problems.push(...check(`discoveries.${key}.${field}`,entry[field],DISCOVERY_SLOTS[field],field==='idea'||field==='explain'?[]:DISCOVERY_PLACEHOLDERS[key]));
 }
 for(const key of Object.keys(file.kinds))if(!(key in DISCOVERY_PLACEHOLDERS))problems.push(`discoveries.${key} 不认识（拼错了？）`);
 return problems;
}

export function textbookTalkProblems(file:TextbookTalkCorpus){
 const problems:string[]=[...check('textbook-talk.feature',file.feature,'talk',['title','metre','rhythm','childLine'])];
 for(const metre of ['2','3','4'] as const)if(!file.metres[metre])problems.push(`textbook-talk.metres.${metre} 缺少`);
 for(const beat of ['short','beat','long'] as const)if(!file.rhythm[beat])problems.push(`textbook-talk.rhythm.${beat} 缺少`);
 for(const variation of TEXTBOOK_VARIATIONS)problems.push(...check(`textbook-talk.shapes.${variation}`,file.shapes[variation],'talk',[]));
 for(const kind of MEETING_KINDS){
  const meeting=file.meetings[kind];
  problems.push(...check(`textbook-talk.meetings.${kind}.line`,meeting?.line,'talk',[]),...check(`textbook-talk.tasks.${kind}`,file.tasks[kind],'talk',[]));
  if(meeting?.named!==undefined)problems.push(...check(`textbook-talk.meetings.${kind}.named`,meeting.named,'talk',['name']));
 }
 return problems;
}

function load<T>(file:T,problems:string[]):T{
 if(problems.length)throw new Error(`语料文件有误：\n${problems.join('\n')}`);
 return file;
}
export const SOUND_HINTS=load(soundHintsFile as SoundHintsCorpus,soundHintsProblems(soundHintsFile as SoundHintsCorpus));
export const DISCOVERIES=load(discoveriesFile as DiscoveriesCorpus,discoveriesProblems(discoveriesFile as DiscoveriesCorpus));
export const TEXTBOOK_TALK=load(textbookTalkFile as TextbookTalkCorpus,textbookTalkProblems(textbookTalkFile as TextbookTalkCorpus));

// ----- 向导联想 -----
/** The lines the sound marker may say for a choice: the one for this kind of sound first, then the general ones. */
export function hintLines(dimension:SoundDimension,value:string,kind:SoundKind|null,corpus:SoundHintsCorpus=SOUND_HINTS){
 const entry=corpus.hints[dimension][value];
 if(!entry)return [];
 const special=kind?entry.byKind?.[kind]:undefined;
 return special?[special,...entry.lines]:[...entry.lines];
}
/** `turn` = how many times this choice was made before: a child tapping it again hears the next line. */
export function presetHint(dimension:SoundDimension,value:string,kind:SoundKind|null,turn=0,corpus:SoundHintsCorpus=SOUND_HINTS){
 const lines=hintLines(dimension,value,kind,corpus);
 return lines.length?lines[turn%lines.length]!:null;
}

// ----- 音乐小发现 -----
export function discoveryKey(fact:Discovery):DiscoveryKey{
 switch(fact.kind){
  case 'opening':return fact.next===null?'opening-alone':'opening';
  case 'busier':return fact.half==='first'?'busier-first':'busier-second';
  case 'ending':return fact.same?'ending-same':'ending';
  default:return fact.kind;
 }
}
/** The values a fact fills in (names on the page, tokens in a brief). */
export function discoveryValues(fact:Discovery):Record<string,string|number>{
 const {kind:_kind,...values}=fact as Record<string,unknown>;
 return Object.fromEntries(Object.entries(values).filter(([,value])=>typeof value==='string'||typeof value==='number')) as Record<string,string|number>;
}
export function discoveryText(fact:Discovery,corpus:DiscoveriesCorpus=DISCOVERIES):DiscoveryText{
 const entry=corpus.kinds[discoveryKey(fact)],values=discoveryValues(fact);
 return {line:fill(entry.line,values),idea:entry.idea,explain:entry.explain,ask:fill(entry.ask,values),tryThis:fill(entry.tryThis,values)};
}
/** One thing to try for the whole piece: the first fact that suggests a change (the opening only when nothing else does). */
export function localTryThis(facts:readonly Discovery[],corpus:DiscoveriesCorpus=DISCOVERIES){
 const pick=facts.find(fact=>fact.kind!=='opening'&&fact.kind!=='ending')??facts[0];
 return pick?discoveryText(pick,corpus).tryThis:null;
}

// ----- 课本讲解 -----
export const metreNames=(corpus:TextbookTalkCorpus=TEXTBOOK_TALK)=>({2:corpus.metres['2'],3:corpus.metres['3'],4:corpus.metres['4']}) satisfies Record<Metre,string>;
/** The rhythm cell as children can clap it: 嘀 = half a beat, 嗒 = one beat, 嗒— = longer (e.g. [2,1] → 嗒— 嗒). */
export function rhythmWords(cell:readonly number[],corpus:TextbookTalkCorpus=TEXTBOOK_TALK){
 return cell.map(beats=>beats<.75?corpus.rhythm.short:beats<1.5?corpus.rhythm.beat:corpus.rhythm.long).join(' ');
}
type SongCard=Pick<TextbookTrack,'title'|'meter'|'rhythmCell'|'childLine'>;
export function songFeature(track:SongCard,corpus:TextbookTalkCorpus=TEXTBOOK_TALK){
 return fill(corpus.feature,{title:track.title,metre:corpus.metres[`${track.meter}`],rhythm:rhythmWords(track.rhythmCell,corpus),childLine:track.childLine});
}
/** Four short sentences: the song's feature, the shape it took this time, what happened, one thing to try. */
export function textbookTalk(track:SongCard,variation:TextbookVariation,meeting:MeetingKind,exampleName:string|null,corpus:TextbookTalkCorpus=TEXTBOOK_TALK):TextbookTalk{
 const said=corpus.meetings[meeting];
 return {
  feature:songFeature(track,corpus),shape:corpus.shapes[variation],
  meeting:exampleName&&said.named?fill(said.named,{name:exampleName}):said.line,
  task:corpus.tasks[meeting],
 };
}

