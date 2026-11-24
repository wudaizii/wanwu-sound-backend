// Pure state for 万物成曲: the arrangement the score is derived from, the settings picked here (length, background
// layer, textbook inspiration) and whether what is on screen is already on the shelf. Playback time is not here — it
// comes from the audio clock in useCompose, so the playhead, progress bar and highlights all read one time.
import {SPAN_CHOICES} from '@wanwu-v2/contracts/arrangement';
import type {Arrangement,SpanSeconds} from '@wanwu-v2/contracts/arrangement';
import {DEFAULT_COMPOSE_SETTINGS,MAX_INSTRUMENTS,WORK_CONTRACT_VERSION,cleanWorkTitle} from '@wanwu-v2/contracts/work';
import type {TextbookVariation} from '@wanwu-v2/contracts/textbook';
import type {ComposeSettings,Inspiration,Rendering,SavedWork} from '@wanwu-v2/contracts/work';
import {fitSpan,spanHolds,withSpan} from '../../../shared/creation/arrangementTiming.ts';

export type ComposeNoticeKey='need-event'|'example-save'|'share-off'|'save-failed'|'load-failed'|'no-audio'|'missing-audio'|'background-failed';
export type ComposeNotice={tone:'info'|'error';key:ComposeNoticeKey}|null;
/** `span-blocked`: a length too short for the longest sound was asked for and refused. */
export type ComposeLastAction='span'|'span-blocked'|'inspiration'|'inspiration-none'|'saved'
 /** Background choices the squirrel explains (the card holds only controls). */
 |'background-on'|'background-off'|'background-volume'|'instrument'|'instrument-coming'
 /** The AI chip was tapped (it is shown only while an AI background is ready). */
 |'ai-background'
 /** An AI background just came back: the squirrel offers it (it is never switched on by itself). */
 |'ai-ready'
 /** A shape of the textbook song's feature was picked (换几种样子). */
 |'variation'|null;
export type ComposeState={
 arrangement:Arrangement|null;
 settings:ComposeSettings;
 /** The version of this work on the shelf (this visit), if any. */
 shelved:SavedWork|null;
 notice:ComposeNotice;
 lastAction:ComposeLastAction;
};
export type ComposeAction=
 |{type:'loaded';arrangement:Arrangement;settings:ComposeSettings;shelved:SavedWork|null}
 |{type:'span';spanSeconds:SpanSeconds;now:Date}
 |{type:'background-enabled';enabled:boolean}
 |{type:'background-volume';volume:number}
 /** Tap an instrument: add it, or take it away if it is already chosen. */
 |{type:'instrument';id:string}
 |{type:'inspiration';inspiration:Inspiration}
 /** 换几种样子: which shape of the chosen textbook song's feature the background plays. */
 |{type:'variation';variation:TextbookVariation}
 |{type:'saved';work:SavedWork}
 |{type:'notice';notice:ComposeNotice}
 /** Nothing changes but what the squirrel says (tapping the instruments that are not open yet). */
 |{type:'said';lastAction:'instrument-coming'|'ai-background'|'ai-ready'};

export const initialCompose:ComposeState={arrangement:null,settings:DEFAULT_COMPOSE_SETTINGS,shelved:null,notice:null,lastAction:null};

const sameSettings=(a:ComposeSettings,b:ComposeSettings)=>JSON.stringify(a)===JSON.stringify(b);
/** On the shelf and unchanged since: same arrangement version, same settings. */
export function isShelved(state:ComposeState){
 const {arrangement,shelved,settings}=state;
 return !!arrangement&&!!shelved&&shelved.arrangement.updatedAt===arrangement.updatedAt&&sameSettings(shelved.settings,settings);
}

export function composeReducer(state:ComposeState,action:ComposeAction):ComposeState{
 if(action.type==='loaded')return {...initialCompose,arrangement:fitSpan(action.arrangement),settings:action.settings,shelved:action.shelved};
 const work=state.arrangement;
 if(!work)return state;
 const background=state.settings.background;
 switch(action.type){
  case 'span':
   // Same field as 万物声场: positions stay, tails rescale, rows are re-tidied; switching makes the arrangement the child's.
   if(!SPAN_CHOICES.includes(action.spanSeconds)||action.spanSeconds===work.spanSeconds)return state;
   // One sound is never longer than the field: a length too short for the longest sound is refused.
   if(!spanHolds(work,action.spanSeconds))return {...state,notice:null,lastAction:'span-blocked'};
   return {...state,arrangement:{...withSpan(work,action.spanSeconds),origin:'child',updatedAt:action.now.toISOString()},notice:null,lastAction:'span'};
  case 'background-enabled':
   return {...state,settings:{...state.settings,background:{...background,enabled:action.enabled}},notice:null,lastAction:action.enabled?'background-on':'background-off'};
  case 'background-volume':{
   const volume=Math.round(Math.min(1,Math.max(0,action.volume))*100)/100;
   return volume===background.volume?state:{...state,settings:{...state.settings,background:{...background,volume}},notice:null,lastAction:'background-volume'};
  }
  case 'instrument':{
   // Tap to add, tap again to take away; none at all plays the background as generated. Adding one also turns the
   // layer on: the child chose to hear it.
   const has=background.instruments.includes(action.id);
   if(!has&&background.instruments.length>=MAX_INSTRUMENTS)return state;
   const instruments=has?background.instruments.filter(id=>id!==action.id):[...background.instruments,action.id];
   return {...state,settings:{...state.settings,background:{...background,instruments,enabled:has?background.enabled:true}},notice:null,lastAction:'instrument'};
  }
  case 'inspiration':
   return {...state,settings:{...state.settings,inspiration:action.inspiration},notice:null,lastAction:action.inspiration.kind==='none'?'inspiration-none':'inspiration'};
  case 'variation':{
   const inspiration=state.settings.inspiration;
   if(inspiration.kind!=='textbook')return state;
   return {...state,settings:{...state.settings,inspiration:{...inspiration,variation:action.variation}},notice:null,lastAction:'variation'};
  }
  case 'saved':return {...state,shelved:action.work,notice:null,lastAction:'saved'};
  case 'notice':return {...state,notice:action.notice};
  case 'said':return {...state,notice:null,lastAction:action.lastAction};
 }
}

/**
 * A shelf entry for the current state; null when the title is empty. The arrangement is stored as it is — never
 * altered — with how it was made (`rendering`: the background step the child kept and the rule versions).
 */
export function shelfEntry(state:ComposeState,title:string,now:Date,rendering:Rendering):SavedWork|null{
 const clean=cleanWorkTitle(title);
 if(!clean||!state.arrangement)return null;
 return {version:WORK_CONTRACT_VERSION,id:state.arrangement.id,title:clean,arrangement:state.arrangement,settings:state.settings,rendering,visibility:'private',share:null,savedAt:now.toISOString()};
}
