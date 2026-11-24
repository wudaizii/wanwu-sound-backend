// The two AI backgrounds. Both start from the same anonymous BackgroundBrief the local background uses.
// - background-audio (Fun-Music): the program turns the brief into a description; the model makes the audio freely. Only
//   the audio's length and format can be checked afterwards (parseBackgroundResult); the mix rules keep it under the child.
// - background-notes (千问): the model writes only an idea — one motif, four sections, a bass pulse. The server develops
//   it with the shared rules, fits it into the gaps between the child's sounds and checks every note.
import {MOODS} from '@wanwu-v2/contracts/arrangement';
import type {BackgroundBrief} from '@wanwu-v2/contracts/background';
import {DENSITIES,LEVELS,TEXTBOOK_MODES,TEXTBOOK_VARIATIONS} from '@wanwu-v2/contracts/textbook';
import type {Density} from '@wanwu-v2/contracts/textbook';
import audioFile from '../../prompts/background-audio.v1.json' with {type:'json'};
import notesFile from '../../prompts/background-notes.v1.json' with {type:'json'};
import type {Acceptance} from '../accept.ts';
import {fill} from '../fill.ts';
import {buildPrompt,exampleJson,loadPrompt,word} from './files.ts';
import type {PromptFile} from './files.ts';
import {readReply} from './reply.ts';

const METRES=['2','3','4'];
const merged=(brief:BackgroundBrief)=>{
 const spans=[...brief.sounding].sort((a,b)=>a.start-b.start),out:{start:number;end:number}[]=[];
 for(const span of spans){const last=out.at(-1);if(last&&span.start<=last.end)last.end=Math.max(last.end,span.end);else out.push({...span});}
 return out;
};
const rhythmOf=(brief:BackgroundBrief)=>brief.textbook?`[${brief.textbook.rhythmCell.join(', ')}]`:'';
/** The colour, as the local rules choose it: the child's mood, else the textbook song's mood, else none. */
export const colourOf=(brief:BackgroundBrief)=>brief.mood??brief.textbook?.mood??'none';

// ----- AI 生成背景（Fun-Music 描述词） -----
export const BACKGROUND_AUDIO_PROMPT=loadPrompt(audioFile as PromptFile,{
 task:'background-audio',model:'music',
 placeholders:['seconds','mood','tempo','metre','mode','energy','room','register','textbook'],
 templates:{room:['percent'],'words.textbook':['metre','rhythm','variation'],'words.noTextbook':[]},
 tables:{'words.metre':METRES,'words.mode':TEXTBOOK_MODES,'words.mood':['none',...MOODS],'words.energy':DENSITIES,'words.register':LEVELS,'words.variation':TEXTBOOK_VARIATIONS},
});

/** How much of the piece the child's sounds fill (0–100). */
export const soundingPercent=(brief:BackgroundBrief)=>Math.round(100*merged(brief).reduce((sum,span)=>sum+Math.min(span.end,brief.seconds)-Math.max(span.start,0),0)/brief.seconds);

export function buildBackgroundAudio(brief:BackgroundBrief){
 const file=BACKGROUND_AUDIO_PROMPT;
 const textbook=brief.textbook?fill(word(file,'words','textbook'),{metre:word(file,'words.metre',brief.metre),rhythm:rhythmOf(brief),variation:word(file,'words.variation',brief.variation??'original')})
  :word(file,'words','noTextbook');
 return buildPrompt(file,{
  seconds:Math.round(brief.seconds),mood:word(file,'words.mood',colourOf(brief)),tempo:Math.round(brief.tempo),
  metre:word(file,'words.metre',brief.metre),mode:word(file,'words.mode',brief.mode),
  energy:word(file,'words.energy',brief.arrangement.density),room:fill(file.room as string,{percent:soundingPercent(brief)}),
  register:word(file,'words.register',brief.arrangement.register),textbook,
 });
}

// ----- AI 写音符（千问写动机） -----
export type MusicIdea={motifDegrees:number[];motifBeats:number[];sections:{density:Density;register:'low'|'mid'|'high'}[];bassPulse:'none'|'slow'|'steady'};
const REGISTERS=['low','mid','high'] as const,PULSES=['none','slow','steady'] as const;

/**
 * Checks an idea and repairs what can be repaired without changing what the model meant: numbers rounded and clamped,
 * lists cut to the same length, a missing section filled in. Fewer than two notes is refused (the chain moves on).
 */
export function acceptMusicIdea(value:unknown):Acceptance<MusicIdea|null>{
 const raw=value&&typeof value==='object'?value as Record<string,unknown>:null;
 const notes:string[]=[];
 const numbers=(list:unknown)=>Array.isArray(list)?list.filter((item):item is number=>typeof item==='number'&&Number.isFinite(item)):[];
 if(!raw)return {status:'rejected',value:null,notes:['回复不是 JSON 对象']};
 let degrees=numbers(raw.motifDegrees),beats=numbers(raw.motifBeats);
 if(degrees.length!==beats.length){notes.push(`音级 ${degrees.length} 个、时值 ${beats.length} 个，按少的对齐`);const n=Math.min(degrees.length,beats.length);degrees=degrees.slice(0,n);beats=beats.slice(0,n);}
 if(degrees.length>6){notes.push('动机超过 6 个音，只留前 6 个');degrees=degrees.slice(0,6);beats=beats.slice(0,6);}
 if(degrees.length<2)return {status:'rejected',value:null,notes:[...notes,'动机少于 2 个音']};
 const clampedDegrees=degrees.map(degree=>Math.max(-7,Math.min(7,Math.round(degree))));
 const clampedBeats=beats.map(beat=>Math.max(.25,Math.min(4,Math.round(beat*4)/4)));
 if(clampedDegrees.some((degree,i)=>degree!==degrees[i]))notes.push('音级取整到 -7–7');
 if(clampedBeats.some((beat,i)=>beat!==beats[i]))notes.push('时值取到 0.25–4 拍、四分之一拍');
 const given=Array.isArray(raw.sections)?raw.sections:[];
 if(given.length!==4)notes.push(`段落应该是 4 段，回复有 ${given.length} 段，按 4 段补齐或截断`);
 const sections=[0,1,2,3].map(i=>{
  const section=given[i] as Record<string,unknown>|undefined;
  const density=DENSITIES.includes(section?.density as Density)?section!.density as Density:'medium';
  const register=REGISTERS.includes(section?.register as never)?section!.register as MusicIdea['sections'][number]['register']:'mid';
  if(section&&(density!==section.density||register!==section.register))notes.push(`第 ${i+1} 段的 density / register 不认识，改成 medium / mid`);
  return {density,register};
 });
 const bassPulse=PULSES.includes(raw.bassPulse as never)?raw.bassPulse as MusicIdea['bassPulse']:'slow';
 if(bassPulse!==raw.bassPulse)notes.push('bassPulse 不认识，改成 slow');
 const idea={motifDegrees:clampedDegrees,motifBeats:clampedBeats,sections,bassPulse};
 if(!idea.motifDegrees.some((degree,i)=>i>0&&Math.abs(degree-idea.motifDegrees[i-1]!)>=2))notes.push('提醒：动机没有跳进，可能听着平淡（仍可用）');
 return {status:notes.some(note=>!note.startsWith('提醒'))?'partly':'accepted',value:idea,notes};
}

export const BACKGROUND_NOTES_PROMPT=loadPrompt(notesFile as PromptFile,{
 task:'background-notes',model:'language',
 placeholders:['seconds','tempo','metre','mode','mood','moodHint','textbook','sections','retry','example'],
 templates:{sectionLine:['name','start','end','count'],retry:['attempt'],'words.textbook':['metre','rhythm','variation'],'words.noTextbook':[]},
 tables:{'words.section':['0','1','2','3'],'words.metre':METRES,'words.mode':TEXTBOOK_MODES,'words.mood':['none',...MOODS],'words.moodHint':['none',...MOODS],'words.variation':TEXTBOOK_VARIATIONS},
 example:value=>{const result=acceptMusicIdea(value);return result.status==='accepted'?[]:result.notes;},
});

/** The piece in four equal parts, and how many of the child's sounds start in each. */
export function sectionCounts(brief:BackgroundBrief){
 const part=brief.seconds/4;
 return [0,1,2,3].map(i=>({start:Math.round(i*part),end:Math.round((i+1)*part),count:brief.sounding.filter(span=>span.start>=i*part&&(span.start<(i+1)*part||i===3)).length}));
}

/** `attempt` counts from 0; asking again for the same piece says so, so the motif changes. */
export function buildBackgroundNotes(brief:BackgroundBrief,attempt=0){
 const file=BACKGROUND_NOTES_PROMPT;
 const sections=sectionCounts(brief).map((section,i)=>fill(file.sectionLine as string,{name:word(file,'words.section',i),...section})).join('\n');
 const textbook=brief.textbook?fill(word(file,'words','textbook'),{metre:word(file,'words.metre',brief.metre),rhythm:rhythmOf(brief),variation:word(file,'words.variation',brief.variation??'original')})
  :word(file,'words','noTextbook');
 return buildPrompt(file,{
  seconds:Math.round(brief.seconds),tempo:Math.round(brief.tempo),metre:word(file,'words.metre',brief.metre),mode:word(file,'words.mode',brief.mode),
  mood:word(file,'words.mood',colourOf(brief)),moodHint:word(file,'words.moodHint',colourOf(brief)),textbook,sections,
  retry:attempt>0?fill(file.retry as string,{attempt:attempt+1}):'',example:exampleJson(file),
 });
}
export function readBackgroundNotes(text:string){
 const read=readReply(text);
 return {repairs:read.repairs,acceptance:'problem' in read?{status:'rejected' as const,value:null,notes:[read.problem]}:acceptMusicIdea(read.value)};
}
