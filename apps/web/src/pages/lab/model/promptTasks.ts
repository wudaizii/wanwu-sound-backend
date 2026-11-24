// 提示词台: one AI task seen whole — the brief the program builds, what the page says without the model, the request as
// the server would send it, and how a pasted reply is read. Uses the same functions the page and the server use, so
// what is seen here is what happens there.
import {MOOD_TEXT_MAX} from '@wanwu-v2/contracts/arrangement';
import type {Arrangement,MoodId} from '@wanwu-v2/contracts/arrangement';
import type {SoundDimension,SoundKind} from '@wanwu-v2/contracts/sound';
import type {TextbookTrack,TextbookVariation} from '@wanwu-v2/contracts/textbook';
import type {Inspiration} from '@wanwu-v2/contracts/work';
import {hintLines} from '@wanwu-v2/prompts/corpus';
import {TASKS,buildBackgroundAudio,buildBackgroundNotes,buildMoodWords,buildSoundHint,buildTextbookTalk,buildTextbookWords,buildWorkTalk,
 readBackgroundNotes,readMoodWords,readSoundHint,readTextbookTalk,readTextbookWords,readWorkTalk} from '@wanwu-v2/prompts/tasks';
import type {BuiltPrompt,TaskId} from '@wanwu-v2/prompts/tasks';
import {backgroundPlan} from '@wanwu-v2/sound-rules/background';
import {backgroundBrief,backgroundInput} from '../../../shared/background/backgroundLayer';
import {backgroundCopy} from '../../../shared/background/copy';
import {moodLabels} from '../../../shared/creation/moodCopy';
import {localTalk,mergeTalk} from '../../../shared/talk/talkView';
import {promptCopy} from '../config/promptCopy';

export type PromptLabInput={
 arrangement:Arrangement|null;tracks:readonly TextbookTrack[];
 mood:MoodId|null;track:TextbookTrack|null;variation:TextbookVariation;attempt:number;
 hint:{dimension:SoundDimension;value:string;kind:SoundKind|null};moodText:string;
};
export type ReplyCheck={repairs:string[];status:'accepted'|'partly'|'rejected';notes:string[];shown:string[]};
export type TaskView={brief:unknown;local:string[];built:BuiltPrompt|null;note:string|null;check:((reply:string)=>ReplyCheck)|null};

const json=(value:unknown)=>JSON.stringify(value);
const TALK_PARTS=['feature','shape','meeting','task'] as const;

export function taskView(id:TaskId,input:PromptLabInput):TaskView{
 const {track,tracks}=input;
 const arrangement=input.arrangement&&{...input.arrangement,mood:input.mood?{kind:'preset' as const,id:input.mood}:null};
 const inspiration:Inspiration=track?{kind:'textbook',entryId:track.id,variation:input.variation}:{kind:'none'};
 const hasEvents=!!arrangement?.events.length;
 const plan=arrangement&&hasEvents?backgroundPlan(backgroundInput(arrangement,inspiration,tracks)):null;
 const empty=(note:string):TaskView=>({brief:null,local:[],built:null,note,check:null});
 switch(id){
  case 'work-talk':{
   const local=localTalk(arrangement,track,inspiration,plan),briefed=local.work;
   if(!briefed)return empty(promptCopy.notes.needEvents);
   return {brief:briefed.brief,built:buildWorkTalk(briefed.brief),note:null,
    local:[...local.discoveries.map(text=>text.line),`试一试：${local.tryThis}`],
    check:reply=>{const {repairs,acceptance}=readWorkTalk(reply,briefed.brief),shown=mergeTalk(local,{work:acceptance.value,textbook:null},true);
     return {repairs,status:acceptance.status,notes:acceptance.notes,shown:[...shown.discoveries.map(text=>text.line),`试一试：${shown.tryThis}`]};}};
  }
  case 'textbook-talk':{
   const local=localTalk(arrangement,track,inspiration,plan),song=local.textbook;
   if(!hasEvents)return empty(promptCopy.notes.needEvents);
   if(!song)return empty(promptCopy.notes.needSong);
   return {brief:song.briefed.brief,built:buildTextbookTalk(song.briefed.brief),note:null,local:TALK_PARTS.map(part=>song.talk[part]),
    check:reply=>{const {repairs,acceptance}=readTextbookTalk(reply,song.briefed.brief),shown=mergeTalk(local,{work:null,textbook:acceptance.value},true);
     return {repairs,status:acceptance.status,notes:acceptance.notes,shown:TALK_PARTS.map(part=>shown.textbook![part])};}};
  }
  case 'background-audio':case 'background-notes':{
   const brief=arrangement&&hasEvents?backgroundBrief(arrangement,inspiration,tracks,[]):null;
   if(!brief||!plan)return empty(promptCopy.notes.needEvents);
   const local=[`本地生成：${backgroundCopy.describe(plan,track?.title??null)}`];
   if(id==='background-audio')return {brief,local,built:buildBackgroundAudio(brief),note:promptCopy.notes.audio,check:null};
   return {brief,local,built:buildBackgroundNotes(brief,input.attempt),note:null,
    check:reply=>{const {repairs,acceptance}=readBackgroundNotes(reply);return {repairs,status:acceptance.status,notes:acceptance.notes,shown:acceptance.value?[json(acceptance.value)]:[]};}};
  }
  case 'sound-hint':{
   const brief=input.hint;
   return {brief,local:hintLines(brief.dimension,brief.value,brief.kind),built:buildSoundHint(brief),note:promptCopy.notes.hintClosed,
    check:reply=>{const {repairs,acceptance}=readSoundHint(reply);return {repairs,status:acceptance.status,notes:acceptance.notes,shown:acceptance.value?[acceptance.value]:[]};}};
  }
  case 'mood-words':{
   const text=[...input.moodText.replace(/\s+/g,' ').trim()].slice(0,MOOD_TEXT_MAX).join('');
   if(!text)return empty(promptCopy.moodText);
   return {brief:{text},local:[promptCopy.notes.moodOff],built:buildMoodWords({text}),note:null,
    check:reply=>{const {repairs,acceptance}=readMoodWords(reply),nearest=acceptance.value?.nearest;
     return {repairs,status:acceptance.status,notes:acceptance.notes,shown:acceptance.value?[`「${text}」→ ${nearest?moodLabels[nearest]:'都不像（null）'}`]:[]};}};
  }
  case 'textbook-words':{
   const card=track??tracks[0];
   if(!card)return empty(promptCopy.notes.needSong);
   const {tempoBpm,meter,rhythmCell,onsetDensity,pitchRange,brightness,mode,repetition}=card,brief={tempoBpm,meter,rhythmCell,onsetDensity,pitchRange,brightness,mode,repetition};
   return {brief,local:[`${card.extraction.words==='example'?promptCopy.notes.example:card.title}：${moodLabels[card.mood]} · ${card.childLine}`],built:buildTextbookWords(brief),note:null,
    check:reply=>{const {repairs,acceptance}=readTextbookWords(reply);return {repairs,status:acceptance.status,notes:acceptance.notes,shown:acceptance.value?[`${moodLabels[acceptance.value.mood]} · ${acceptance.value.childLine}`]:[]};}};
  }
 }
}

/** The example reply in the task's prompt file, to start from. */
export const exampleReply=(id:TaskId)=>TASKS[id].file.example===undefined?'':JSON.stringify(TASKS[id].file.example,null,1);
