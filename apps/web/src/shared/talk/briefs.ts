// The anonymous briefs for an AI rewording, built from the facts the page already shows. Sound names become numbered
// tokens (「声音1」); `names` keeps them on the device so the reply can be read back with the child's names.
import type {MoodId} from '@wanwu-v2/contracts/arrangement';
import {TEXTBOOK_TALK_BRIEF_VERSION,WORK_TALK_BRIEF_VERSION,soundToken} from '@wanwu-v2/contracts/talk';
import type {Discovery,MeetingKind,TextbookTalkBrief,WorkTalkBrief} from '@wanwu-v2/contracts/talk';
import type {TextbookTrack,TextbookVariation} from '@wanwu-v2/contracts/textbook';
import {tokenizeFacts} from '@wanwu-v2/prompts/accept';
import {rhythmWords,textbookTalk} from '@wanwu-v2/prompts/corpus';

export type Briefed<B>={brief:B;names:string[]};

export function workTalkBrief(facts:readonly Discovery[],seconds:number,mood:MoodId|null,textbookTitle:string|null):Briefed<WorkTalkBrief>|null{
 if(!facts.length)return null;
 const tokenized=tokenizeFacts(facts);
 return {brief:{version:WORK_TALK_BRIEF_VERSION,seconds,mood,textbookTitle,facts:tokenized.facts},names:tokenized.names};
}

export function textbookTalkBrief(track:Pick<TextbookTrack,'title'|'meter'|'rhythmCell'|'childLine'>,variation:TextbookVariation,meeting:MeetingKind,exampleName:string|null):Briefed<TextbookTalkBrief>{
 const example=exampleName===null?null:soundToken(0);
 return {
  brief:{version:TEXTBOOK_TALK_BRIEF_VERSION,title:track.title,metre:track.meter,rhythm:rhythmWords(track.rhythmCell),childLine:track.childLine,
   variation,meeting,example,local:textbookTalk(track,variation,meeting,example)},
  names:exampleName===null?[]:[exampleName],
 };
}
