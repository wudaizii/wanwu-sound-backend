// The small language tasks: 向导联想 (closed: the corpus answers), 心情“自己写”, and 课本歌曲的文字 (development time only).
import {MOODS} from '@wanwu-v2/contracts/arrangement';
import type {MoodId} from '@wanwu-v2/contracts/arrangement';
import {SOUND_CHOICES,SOUND_DIMENSIONS,SOUND_KINDS} from '@wanwu-v2/contracts/sound';
import type {SoundDimension,SoundKind} from '@wanwu-v2/contracts/sound';
import {BRIGHTNESSES,DENSITIES,LEVELS,TEXTBOOK_MODES} from '@wanwu-v2/contracts/textbook';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import soundHintFile from '../../prompts/sound-hint.v1.json' with {type:'json'};
import moodWordsFile from '../../prompts/mood-words.v1.json' with {type:'json'};
import textbookWordsFile from '../../prompts/textbook-words.v1.json' with {type:'json'};
import {acceptMood,acceptSoundHint,acceptTextbookWords} from '../accept.ts';
import type {Acceptance} from '../accept.ts';
import {hintLines,metreNames} from '../corpus.ts';
import {STYLE} from '../style.ts';
import {buildPrompt,exampleJson,loadPrompt,word} from './files.ts';
import type {PromptFile} from './files.ts';
import {readReply} from './reply.ts';

const examples=(accept:(value:unknown)=>Acceptance<unknown>)=>(value:unknown)=>accept(value).notes;
function read<T>(text:string,accept:(value:unknown)=>Acceptance<T>,none:T){
 const reply=readReply(text);
 return {repairs:reply.repairs,acceptance:'problem' in reply?{status:'rejected' as const,value:none,notes:[reply.problem]}:accept(reply.value)};
}

// ----- 向导联想 -----
export type SoundHintBrief={dimension:SoundDimension;value:string;kind:SoundKind|null};
export const SOUND_HINT_PROMPT=loadPrompt(soundHintFile as PromptFile,{
 task:'sound-hint',model:'language',placeholders:['option','dimension','kind','hintMax','examples','example'],
 tables:{
  'words.dimension':SOUND_DIMENSIONS,'words.kind':[...SOUND_KINDS,'unknown'],
  ...Object.fromEntries(SOUND_DIMENSIONS.map(dimension=>[`words.option.${dimension}`,SOUND_CHOICES[dimension] as readonly string[]])),
 },
 example:examples(acceptSoundHint),
});
export function buildSoundHint(brief:SoundHintBrief){
 const file=SOUND_HINT_PROMPT;
 return buildPrompt(file,{
  option:word(file,`words.option.${brief.dimension}`,brief.value),dimension:word(file,'words.dimension',brief.dimension),
  kind:word(file,'words.kind',brief.kind??'unknown'),hintMax:STYLE.slots.hint.maxChars,
  examples:hintLines(brief.dimension,brief.value,brief.kind).map(line=>`  ${line}`).join('\n'),example:exampleJson(file),
 });
}
export const readSoundHint=(text:string)=>read(text,acceptSoundHint,null);

// ----- 心情“自己写” -----
export type MoodWordsBrief={text:string};
export const MOOD_WORDS_PROMPT=loadPrompt(moodWordsFile as PromptFile,{
 task:'mood-words',model:'language',placeholders:['text','moods','example'],tables:{'words.mood':MOODS},example:examples(acceptMood),
});
export function buildMoodWords(brief:MoodWordsBrief){
 const file=MOOD_WORDS_PROMPT;
 return buildPrompt(file,{text:brief.text,moods:MOODS.map(mood=>`· ${mood}：${word(file,'words.mood',mood)}`).join('\n'),example:exampleJson(file)});
}
export const readMoodWords=(text:string)=>read(text,acceptMood,null);

// ----- 课本歌曲的文字（开发期，结果再由人耳核对） -----
export type TextbookWordsBrief=Pick<TextbookTrack,'tempoBpm'|'meter'|'rhythmCell'|'onsetDensity'|'pitchRange'|'brightness'|'mode'|'repetition'>;
export const TEXTBOOK_WORDS_PROMPT=loadPrompt(textbookWordsFile as PromptFile,{
 task:'textbook-words',model:'language',
 placeholders:['tempo','metre','rhythm','density','range','brightness','mode','repetition','moods','childLineMax','example'],
 tables:{'words.density':DENSITIES,'words.brightness':BRIGHTNESSES,'words.mode':TEXTBOOK_MODES,'words.level':LEVELS,'words.mood':MOODS},
 example:examples(acceptTextbookWords),
});
export function buildTextbookWords(brief:TextbookWordsBrief){
 const file=TEXTBOOK_WORDS_PROMPT;
 return buildPrompt(file,{
  tempo:brief.tempoBpm,metre:metreNames()[brief.meter],rhythm:`[${brief.rhythmCell.join(', ')}] 拍`,
  density:word(file,'words.density',brief.onsetDensity),range:`MIDI ${brief.pitchRange.low}–${brief.pitchRange.high}`,
  brightness:word(file,'words.brightness',brief.brightness),mode:word(file,'words.mode',brief.mode),repetition:word(file,'words.level',brief.repetition),
  moods:MOODS.map((mood:MoodId)=>`${mood}=${word(file,'words.mood',mood)}`).join('，'),childLineMax:STYLE.slots.childLine.maxChars,example:exampleJson(file),
 });
}
export const readTextbookWords=(text:string)=>read(text,acceptTextbookWords,null);
