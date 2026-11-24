// 作品讲解 and 课本讲解润色: the model rewords sentences the program already wrote from counted facts. It never adds a
// fact; a line that does not pass falls back to the corpus line (see ../accept.ts).
import {MOODS} from '@wanwu-v2/contracts/arrangement';
import {DISCOVERY_KINDS,MEETING_KINDS,isTextbookTalk,isWorkTalkReply} from '@wanwu-v2/contracts/talk';
import type {TextbookTalkBrief,WorkTalkBrief} from '@wanwu-v2/contracts/talk';
import {TEXTBOOK_VARIATIONS} from '@wanwu-v2/contracts/textbook';
import workTalkFile from '../../prompts/work-talk.v1.json' with {type:'json'};
import textbookTalkFile from '../../prompts/textbook-talk.v1.json' with {type:'json'};
import {acceptTextbookTalk,acceptWorkTalk} from '../accept.ts';
import {discoveryText,discoveryValues,metreNames} from '../corpus.ts';
import {fill} from '../fill.ts';
import {STYLE} from '../style.ts';
import {buildPrompt,exampleJson,loadPrompt,word} from './files.ts';
import type {PromptFile} from './files.ts';
import {readReply} from './reply.ts';

const shapeOnly=(ok:boolean,what:string)=>ok?[]:[what];

export const WORK_TALK_PROMPT=loadPrompt(workTalkFile as PromptFile,{
 task:'work-talk',model:'language',
 placeholders:['seconds','mood','textbook','facts','discoveryMax','tryThisMax','example'],
 templates:{factLine:['n','kind','values','local'],'words.noTextbook':[]},
 tables:{'words.mood':['none',...MOODS]},
 example:value=>shapeOnly(isWorkTalkReply(value),'要有 lines（kind 只能是 '+DISCOVERY_KINDS.join(' / ')+'）和 tryThis'),
});

export function buildWorkTalk(brief:WorkTalkBrief){
 const file=WORK_TALK_PROMPT;
 const facts=brief.facts.map((fact,i)=>fill(file.factLine as string,{
  n:i+1,kind:fact.kind,
  values:Object.entries(discoveryValues(fact)).map(([key,value])=>`${key}=${value}`).join('，')||'无',
  local:discoveryText(fact).line,
 })).join('\n');
 return buildPrompt(file,{
  seconds:Math.round(brief.seconds),mood:word(file,'words.mood',brief.mood??'none'),
  textbook:brief.textbookTitle?`「${brief.textbookTitle}」`:word(file,'words','noTextbook'),
  facts,discoveryMax:STYLE.slots.discovery.maxChars,tryThisMax:STYLE.slots.tryThis.maxChars,example:exampleJson(file),
 });
}
export function readWorkTalk(text:string,brief:WorkTalkBrief){
 const read=readReply(text);
 return {repairs:read.repairs,acceptance:'problem' in read?{status:'rejected' as const,value:{lines:brief.facts.map(()=>null),tryThis:null},notes:[read.problem]}:acceptWorkTalk(read.value,brief)};
}

export const TEXTBOOK_TALK_PROMPT=loadPrompt(textbookTalkFile as PromptFile,{
 task:'textbook-talk',model:'language',
 placeholders:['title','metre','rhythm','childLine','variation','meeting','feature','shape','meetingLine','task','talkMax','example'],
 tables:{'words.variation':TEXTBOOK_VARIATIONS,'words.meeting':MEETING_KINDS},
 example:value=>shapeOnly(isTextbookTalk(value),'要有 feature、shape、meeting、task 四句'),
});

export function buildTextbookTalk(brief:TextbookTalkBrief){
 const file=TEXTBOOK_TALK_PROMPT;
 return buildPrompt(file,{
  title:brief.title,metre:metreNames()[brief.metre],rhythm:brief.rhythm,childLine:brief.childLine,
  variation:word(file,'words.variation',brief.variation),meeting:word(file,'words.meeting',brief.meeting),
  feature:brief.local.feature,shape:brief.local.shape,meetingLine:brief.local.meeting,task:brief.local.task,
  talkMax:STYLE.slots.talk.maxChars,example:exampleJson(file),
 });
}
export function readTextbookTalk(text:string,brief:TextbookTalkBrief){
 const read=readReply(text);
 return {repairs:read.repairs,acceptance:'problem' in read?{status:'rejected' as const,value:{feature:null,shape:null,meeting:null,task:null},notes:[read.problem]}:acceptTextbookTalk(read.value,brief)};
}
