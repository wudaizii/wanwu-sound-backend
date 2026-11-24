import {useCallback,useEffect,useMemo,useReducer,useRef,useState} from 'react';
import type {Arrangement,SpanSeconds} from '@wanwu-v2/contracts/arrangement';
import type {Inspiration} from '@wanwu-v2/contracts/work';
import {spanHolds} from '../../../shared/creation/arrangementTiming';
import type {InspirationCatalog} from '../../../shared/inspiration/catalog';
import type {TeachingMusicService} from '../../../shared/inspiration/teachingMusic';
import {useInspirationCatalog} from '../../../shared/inspiration/useInspirationCatalog';
import type {Instrument} from '../../../shared/background/instruments';
import type {BackgroundLibrary} from '../../../shared/background/library';
import {useBackgroundLayer} from '../../../shared/background/useBackgroundLayer';
import type {BackgroundGenerator} from '../../../shared/background/generator';
import {RULE_VERSIONS} from '@wanwu-v2/sound-rules/rules';
import {useAiBackground} from './useAiBackground';
import type {TextbookVariation} from '@wanwu-v2/contracts/textbook';
import {workSummary} from '@wanwu-v2/sound-rules/textbook-match';
import {suggestVariations} from '@wanwu-v2/sound-rules/textbook-variation';
import {services} from '../../../app/services';
import type {TalkPolisher} from '../../../shared/talk/polisher';
import type {ComposeRepository} from '../services/composeRepository';
import {composeReducer,initialCompose,isShelved,shelfEntry} from './composeState';
import type {ComposeNoticeKey} from './composeState';
import {scoreLayout} from './scoreLayout';
import {usePiecePlayback} from './usePiecePlayback';
import {useTalk} from './useTalk';

/** 万物成曲: listen to the work as a piece, set its length, inspiration and background, then put it on the shelf.
 *  The playback clock lives in usePiecePlayback and the background layer (shared with 万物声场) in useBackgroundLayer. */
export function useCompose(repository:ComposeRepository=services.composeRepository,backgrounds:BackgroundLibrary=services.backgroundLibrary,inspirations:InspirationCatalog=services.inspirationCatalog,generator:BackgroundGenerator=services.backgroundGenerator,
 polisher:TalkPolisher=services.talkPolisher,teaching:TeachingMusicService=services.teachingMusic){
 const [state,dispatch]=useReducer(composeReducer,initialCompose);
 const [shelfCount,setShelfCount]=useState(0);
 const [instruments,setInstruments]=useState<readonly Instrument[]>([]);
 const [comingInstruments,setComing]=useState<readonly string[]>([]);
 const latest=useRef(state);latest.current=state;
 const notify=useCallback((key:ComposeNoticeKey,tone:'info'|'error'='error')=>dispatch({type:'notice',notice:{tone,key}}),[]);

 useEffect(()=>{
  let live=true;
  void Promise.all([repository.load(),backgrounds.list()]).then(([current,library])=>{
   if(!live)return;
   setInstruments(library.instruments);setComing(library.coming);setShelfCount(current.shelfCount);
   dispatch({type:'loaded',arrangement:current.arrangement,settings:current.settings,shelved:current.shelved});
  });
  return()=>{live=false;};
 },[repository,backgrounds]);

 // Length changes go back to the same work 万物声场 edits; an untouched example is not stored.
 useEffect(()=>{
  const arrangement=state.arrangement;
  if(arrangement?.origin==='child')void repository.saveArrangement(arrangement);
 },[state.arrangement,repository]);
 useEffect(()=>{if(latest.current.arrangement)void repository.saveSettings(state.settings);},[state.settings,repository]);

 // ----- derived: score, background, talk -----
 const layout=useMemo(()=>state.arrangement?scoreLayout(state.arrangement):null,[state.arrangement]);
 // 课本灵感: the same songs and 帮我找找 as 万物声场 (shared/inspiration).
 const {entries,matches,teachingOpen}=useInspirationCatalog(state.arrangement,inspirations,teaching);
 const music=useBackgroundLayer(state.settings,instruments,entries);
 /** 帮我找找: the textbook songs most like this arrangement (local rules). */
 /** What the background is made of right now (mood colour, borrowed rhythm), for the card. */
 const backgroundPlan=useMemo(()=>state.arrangement?music.plan(state.arrangement):null,
 // The plan only changes with the arrangement and what the background borrows.
 [state.arrangement,music.key]);
 // ----- 课本: the shapes offered for the chosen song -----
 const inspiration=state.settings.inspiration;
 const variations=useMemo(()=>{
  const summary=state.arrangement&&workSummary(state.arrangement);
  if(inspiration.kind!=='textbook'||!music.track)return [];
  const offered:TextbookVariation[]=['original',...(summary?suggestVariations(summary,music.track):[])];
  const chosen=inspiration.variation??'original';
  return offered.includes(chosen)?offered:[...offered,chosen];
 },[state.arrangement,inspiration,music.track]);
 /** 音乐小发现 and 课本讲解: corpus sentences at once, an AI rewording only where it passes the checks. */
 const talk=useTalk(state.arrangement,music.track,inspiration,backgroundPlan,polisher);
 /** AI background on top of the local one: asked in the background, used only when the child switches to it. */
 const ai=useAiBackground(state.arrangement,state.settings,entries,music,generator);
 // When an AI background comes back, the squirrel offers it; the child decides.
 useEffect(()=>{if(ai.state.status==='ready')dispatch({type:'said',lastAction:'ai-ready'});},[ai.state]);
 const played={gain:music.gain,key:`${music.key}|${ai.source}`,buffer:(arrangement:Arrangement)=>ai.buffer(arrangement)??music.buffer(arrangement)};
 const playback=usePiecePlayback(latest,notify,played,layout);

 // ----- settings -----
 /** A new length restarts the piece; a length too short for the longest sound is only explained (playback goes on). */
 const setSpan=(spanSeconds:SpanSeconds)=>{
  const work=latest.current.arrangement;
  if(work&&spanHolds(work,spanSeconds))playback.reset();
  dispatch({type:'span',spanSeconds,now:new Date()});
 };
 const setInspiration=(next:Inspiration)=>dispatch({type:'inspiration',inspiration:next});

 // ----- shelf and sharing -----
 /** Whether this piece can go on the shelf; says why not (empty, or the untouched example). */
 const canSave=()=>{
  const arrangement=latest.current.arrangement;
  if(!arrangement?.events.length){notify('need-event','info');return false;}
  if(arrangement.origin==='example'){notify('example-save','info');return false;}
  return true;
 };
 const saveWork=async(title:string)=>{
  const current=latest.current;
  if(!canSave())return false;
  const work=shelfEntry(current,title,new Date(),{background:ai.source,prompt:ai.prompt,rules:{...RULE_VERSIONS}});
  if(!work)return false;
  const result=await repository.saveWork(work);
  if(result.status==='failed'){notify('save-failed');return false;}
  if(!current.shelved)setShelfCount(count=>count+1);
  dispatch({type:'saved',work});
  return true;
 };
 const share=async()=>{const result=await repository.share(latest.current.arrangement?.id??'');if(result.status==='unavailable')notify('share-off','info');};
 const startNew=async()=>{playback.pause();await repository.startNew();};

 return {
  state,layout,instruments,comingInstruments,chosen:music.chosen,parts:music.parts,entries,entry:music.track,matches,teachingOpen,backgroundPlan,
  playing:playback.playing,preparing:playback.preparing,ended:playback.ended,
  /** The one playback time (seconds) the playhead, progress bar and highlights read. */
  now:playback.now,total:playback.total,sounding:playback.sounding,
  // On the shelf only if the background kept is the one saved, too.
  shelved:isShelved(state)&&state.shelved?.rendering.background===ai.source,shelfCount,
  ai:ai.state,aiSource:ai.source,usingAi:ai.using,
  togglePlay:playback.togglePlay,restart:playback.restart,playFrom:playback.playFrom,scrubTo:playback.scrubTo,endScrub:playback.endScrub,
  setSpan,setInspiration,variations,talk,
  /** A shape: the squirrel invites the child to press 播放 and find what changed. */
  setVariation:(variation:TextbookVariation)=>dispatch({type:'variation',variation}),
  setBackgroundEnabled:(enabled:boolean)=>dispatch({type:'background-enabled',enabled}),
  setBackgroundVolume:(volume:number)=>dispatch({type:'background-volume',volume}),
  toggleInstrument:(id:string)=>dispatch({type:'instrument',id}),
  showComing:()=>dispatch({type:'said',lastAction:'instrument-coming'}),
  /** The AI chip: switch between AI and local when an AI background is ready; otherwise the squirrel says why not. */
  tapAi:()=>{ai.toggle();dispatch({type:'said',lastAction:'ai-background'});},
  canSave,saveWork,share,startNew,
  clearNotice:()=>dispatch({type:'notice',notice:null}),
 };
}
export type Compose=ReturnType<typeof useCompose>;
