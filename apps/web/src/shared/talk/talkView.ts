// 音乐小发现 and 课本讲解 as 万物成曲 shows them (and the prompt lab inspects them). Pure, so the merge rules are tested with fake polishers:
// 1. `localTalk`: facts counted by fixed rules, said with the corpus — what is shown at once, without a network;
// 2. `polishTalk`: asks the polisher (if open) with anonymous briefs and keeps only the lines that pass the checks;
// 3. `mergeTalk`: each accepted line replaces its corpus line, with the child's names put back.
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import type {Discovery,TalkOrigin,TextbookTalk} from '@wanwu-v2/contracts/talk';
import type {Inspiration} from '@wanwu-v2/contracts/work';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import {backgroundMeeting} from '@wanwu-v2/sound-rules/background';
import type {BackgroundPlan} from '@wanwu-v2/sound-rules/background';
import {acceptTextbookTalk,acceptWorkTalk,restoreNames} from '@wanwu-v2/prompts/accept';
import type {TextbookTalkLines,WorkTalkLines} from '@wanwu-v2/prompts/accept';
import {discoveryText,localTryThis} from '@wanwu-v2/prompts/corpus';
import type {DiscoveryText} from '@wanwu-v2/prompts/corpus';
import {timedEvents} from '../creation/arrangementTiming.ts';
import {presetMood} from '../creation/moodCopy.ts';
import {textbookTalk} from '../inspiration/talk.ts';
import {textbookTalkBrief,workTalkBrief} from './briefs.ts';
import {findDiscoveries} from './discoveries.ts';
import {TALK_TIMEOUT_MS} from './polisher.ts';
import type {TalkPolisher} from './polisher';

/** What the footer and the teacher panel say, and who wrote it (the corpus, or an AI rewording that passed every check). */
export type TalkView={
 /** The facts counted from the arrangement (the score's listening prompt reads them). */
 facts:Discovery[];
 discoveries:DiscoveryText[];tryThis:string|null;textbook:TextbookTalk|null;
 origin:{work:TalkOrigin;textbook:TalkOrigin};
 /** Whether an AI rewording can be asked for at all (false while no model is connected). */
 polishOpen:boolean;
};
export type LocalTalk=ReturnType<typeof localTalk>;
export type Polished={work:WorkTalkLines|null;textbook:TextbookTalkLines|null};

export function localTalk(arrangement:Arrangement|null,track:TextbookTrack|null,inspiration:Inspiration,plan:BackgroundPlan|null){
 const facts=arrangement?findDiscoveries(arrangement):[];
 const textbook=arrangement&&track&&inspiration.kind==='textbook'&&plan&&arrangement.events.length?(()=>{
  const timed=timedEvents(arrangement),meeting=backgroundMeeting(plan,timed.map(({start,end})=>({start,end})));
  const name=meeting.example===null?null:timed[meeting.example]?.unit.name??null,variation=inspiration.variation??'original';
  return {talk:textbookTalk(track,variation,meeting,name),briefed:textbookTalkBrief(track,variation,meeting.kind,name)};
 })():null;
 const work=arrangement?workTalkBrief(facts,arrangement.spanSeconds,presetMood(arrangement.mood),textbook?track!.title:null):null;
 return {facts,discoveries:facts.map(fact=>discoveryText(fact)),tryThis:localTryThis(facts),textbook,work};
}
/** What would be sent; a new key asks again. */
export const talkKey=(local:LocalTalk)=>JSON.stringify([local.work?.brief??null,local.textbook?.briefed.brief??null]);

/** Waits for one request at most `timeoutMs`; anything slow or broken counts as no answer. */
async function ask(request:(signal:AbortSignal)=>Promise<unknown>,signal:AbortSignal,timeoutMs:number){
 const attempt=new AbortController(),stop=()=>attempt.abort();
 signal.addEventListener('abort',stop);
 const timer=setTimeout(stop,timeoutMs);
 const gaveUp=new Promise<null>(resolve=>attempt.signal.addEventListener('abort',()=>resolve(null),{once:true}));
 try{return await Promise.race([request(attempt.signal),gaveUp]);}catch{return null;}
 finally{clearTimeout(timer);signal.removeEventListener('abort',stop);}
}

/** Asks for both rewordings at once; null when the polisher is closed or there is nothing to say. */
export async function polishTalk(local:LocalTalk,polisher:TalkPolisher,signal:AbortSignal,timeoutMs=TALK_TIMEOUT_MS):Promise<Polished|null>{
 const {work,textbook}=local;
 if(!polisher.open||(!work&&!textbook))return null;
 const [workReply,textbookReply]=await Promise.all([
  work?ask(inner=>polisher.workTalk(work.brief,inner),signal,timeoutMs):null,
  textbook?ask(inner=>polisher.textbookTalk(textbook.briefed.brief,inner),signal,timeoutMs):null,
 ]);
 return {
  work:work&&workReply?acceptWorkTalk(workReply,work.brief).value:null,
  textbook:textbook&&textbookReply?acceptTextbookTalk(textbookReply,textbook.briefed.brief).value:null,
 };
}

export function mergeTalk(local:LocalTalk,polished:Polished|null,polishOpen:boolean):TalkView{
 const names=local.work?.names??[],textbookNames=local.textbook?.briefed.names??[];
 const lines=polished?.work?.lines??[],aiTry=polished?.work?.tryThis??null,parts=polished?.textbook??null;
 const discoveries=local.discoveries.map((text,i)=>{const line=lines[i];return line?{...text,line:restoreNames(line,names)}:text;});
 const textbook=local.textbook&&{...local.textbook.talk};
 if(textbook&&parts)for(const part of ['feature','shape','meeting','task'] as const){const line=parts[part];if(line)textbook[part]=restoreNames(line,textbookNames);}
 return {
  facts:local.facts,discoveries,tryThis:aiTry?restoreNames(aiTry,names):local.tryThis,textbook,polishOpen,
  origin:{work:lines.some(Boolean)||aiTry?'ai':'local',textbook:parts&&Object.values(parts).some(Boolean)?'ai':'local'},
 };
}
