import {useCallback,useEffect,useMemo,useReducer,useRef,useState} from 'react';
import type {Arrangement,SourceClip,SpanSeconds} from '@wanwu-v2/contracts/arrangement';
import {DEFAULT_COMPOSE_SETTINGS} from '@wanwu-v2/contracts/work';
import type {ComposeSettings,Inspiration} from '@wanwu-v2/contracts/work';
import type {Instrument} from '../../../shared/background/instruments';
import type {BackgroundLibrary} from '../../../shared/background/library';
import {useBackgroundLayer} from '../../../shared/background/useBackgroundLayer';
import type {InspirationCatalog} from '../../../shared/inspiration/catalog';
import type {TeachingMusicService} from '../../../shared/inspiration/teachingMusic';
import {useInspirationCatalog} from '../../../shared/inspiration/useInspirationCatalog';
import type {SoundUnitDraft} from '@wanwu-v2/contracts/sound';
import {newId} from '../../../shared/creation/ids';
import {services} from '../../../app/services';
import type {LibraryScope,SoundWorldRepository} from '../services/soundWorldRepository';
import type {MoodInterpreter} from '../services/moodInterpreter';
import {eventOf,initialSoundWorld,nudge,placedClip,rowEndSpot,soundWorldReducer,spanHolds,unitOf} from './soundWorldState';
import type {NoticeKey} from './soundWorldState';
import {useFieldSound} from './useFieldSound';
import {useMood} from './useMood';

export type FinishResult={status:'unavailable'}|{status:'opened'};
/** A spot in the field in business coordinates (never pixels). Only `at` affects what is heard. */
export type FieldSpot={at:number;row:number};

/** 万物声场: place the work's sounds along time, edit their excerpts, pick a mood and a textbook song, then go on to
 *  万物成曲. What the field sounds like lives in useFieldSound (with the local background from useBackgroundLayer, the
 *  same layer 万物成曲 plays) and the mood in useMood; this hook owns the arrangement and the shared settings. */
export function useSoundWorld(onFinish:(arrangement:Arrangement)=>FinishResult,repository:SoundWorldRepository=services.soundWorldRepository,moods:MoodInterpreter=services.moodInterpreter,inspirations:InspirationCatalog=services.inspirationCatalog,backgrounds:BackgroundLibrary=services.backgroundLibrary,teaching:TeachingMusicService=services.teachingMusic){
 const [state,dispatch]=useReducer(soundWorldReducer,initialSoundWorld);
 const latest=useRef(state);latest.current=state;
 const notify=useCallback((key:NoticeKey,tone:'info'|'error'='error')=>dispatch({type:'notice',notice:{tone,key}}),[]);
 // 课本灵感 and the background switch are kept with the work for 万物成曲; they never move a sound.
 const [settings,setSettingsState]=useState<ComposeSettings>(DEFAULT_COMPOSE_SETTINGS);
 const [instruments,setInstruments]=useState<readonly Instrument[]>([]);
 // 课本灵感: the same songs and 帮我找找 as 万物成曲 (shared/inspiration).
 const {entries,matches,teachingOpen}=useInspirationCatalog(state.arrangement,inspirations,teaching);
 const background=useBackgroundLayer(settings,instruments,entries);
 const sound=useFieldSound(latest,dispatch,notify,background);
 const mood=useMood(moods,dispatch,notify);
 const {stopAll,playOne,clipSound,player}=sound;

 useEffect(()=>{
  let live=true;
  void repository.load().then(arrangement=>{if(live)dispatch({type:'loaded',arrangement});});
  void Promise.all([repository.loadSettings(),backgrounds.list()]).then(([current,library])=>{
   if(live){setSettingsState(current);setInstruments(library.instruments);}
  });
  return()=>{live=false;};
 },[repository,backgrounds]);
 const saveSettings=(next:ComposeSettings)=>{setSettingsState(next);void repository.saveSettings(next);};
 /** A new song changes what the background borrows: a running full playback stops (like any edit). */
 const setInspiration=(next:Inspiration)=>{stopAll();saveSettings({...settings,inspiration:next});dispatch({type:'said',lastAction:'inspiration'});};
 /** 背景音乐 on / off — the same switch 万物成曲 has; the frog says what the background follows. */
 const setBackgroundEnabled=(enabled:boolean)=>{
  stopAll();saveSettings({...settings,background:{...settings.background,enabled}});
  dispatch({type:'said',lastAction:enabled?'background-on':'background-off'});
 };
 /** What the background is made of now (mood colour, borrowed rhythm), for the switch's line. */
 const backgroundPlan=useMemo(()=>state.arrangement?background.plan(state.arrangement):null,
 // The plan only changes with the arrangement and what the background borrows.
 [state.arrangement,background.key]);

 // The child's arrangement is kept through the repository on every change; an untouched example is not stored.
 useEffect(()=>{
  const arrangement=state.arrangement;
  if(arrangement?.origin==='child')void repository.save(arrangement);
 },[state.arrangement,repository]);

 // ----- placement -----
 const placeUnit=(unitId:string,spot:FieldSpot)=>{
  const unit=unitOf(latest.current.arrangement,unitId);if(!unit)return;
  stopAll();const eventId=newId('event');
  const clip=placedClip(unit.analysis??sound.bank.analysisNow(unit.sourceId),sound.durations[unit.sourceId]??null);
  dispatch({type:'place',unitId,eventId,at:spot.at,row:spot.row,clip,now:new Date()});
  // Feedback when a sound lands: exactly the excerpt it will play.
  void playOne(`event:${eventId}`,()=>clipSound(unit,clip),{toggle:false});
 };
 /** Moving never changes a sound, so it stays quiet. */
 const moveEvent=(eventId:string,spot:FieldSpot&{exact?:boolean})=>{
  if(!eventOf(latest.current.arrangement,eventId))return;
  stopAll();dispatch({type:'move',eventId,at:spot.at,row:spot.row,exact:spot.exact,now:new Date()});
 };
 /** 点空白处: place the picked sound there. With a placed sound selected, empty space just lets go of it. */
 const tapField=(spot:FieldSpot)=>{
  const selection=latest.current.selection;
  if(selection?.kind==='unit')placeUnit(selection.unitId,spot);
  else if(selection?.kind==='event')dispatch({type:'deselect'});
  else notify('pick-first','info');
 };
 /** 点这个声音就能播放: tapping a placed sound selects it and plays the part it uses (tap again while playing to stop). */
 const tapEvent=(eventId:string)=>{
  dispatch({type:'select-event',eventId});
  sound.previewEvent(eventId);
 };
 /** Row buttons (keyboard and big-target alternative): append to the row, or move the occurrence to that row. */
 const tapRow=(row:number)=>{
  const {selection,arrangement}=latest.current;
  if(!arrangement)return;
  if(selection?.kind==='unit')placeUnit(selection.unitId,{row,at:rowEndSpot(arrangement,row)});
  else if(selection?.kind==='event'){const event=eventOf(arrangement,selection.eventId);if(event)moveEvent(event.id,{row,at:event.at,exact:true});}
  else notify('pick-first','info');
 };
 /** 复制: the same sound and part again, right after the original; it can then be dragged anywhere. */
 const copy=(eventId:string)=>{
  if(!eventOf(latest.current.arrangement,eventId))return;
  stopAll();dispatch({type:'copy',eventId,newId:newId('event'),now:new Date()});
 };
 const remove=(eventId:string)=>{
  if(player.activeKey()===`event:${eventId}`)player.stop();
  stopAll();dispatch({type:'remove',eventId,now:new Date()});
 };
 const keyMove=(eventId:string,key:string)=>{
  const work=latest.current.arrangement,event=eventOf(work,eventId);if(!work||!event)return false;
  const next=nudge(event,key,work.rows);
  if(next)moveEvent(eventId,next);
  return !!next;
 };
 const setClip=(eventId:string,clip:SourceClip)=>{stopAll();dispatch({type:'clip',eventId,clip,now:new Date()});};

 const finish=async()=>{
  const work=latest.current.arrangement;if(!work)return;
  if(!work.events.length)return notify('need-event','info');
  stopAll();
  // The arrangement already lives in the repository (this visit); 万物成曲 opens once it is accepted.
  if(onFinish(work).status==='unavailable')dispatch({type:'blocked'});
 };

 const span=state.arrangement?.spanSeconds??30;
 return {
  state,playing:sound.playing,preparing:sound.preparing,sounding:sound.sounding,durations:sound.durations,elapsed:sound.elapsed,
  /** 0–1 along the field while the whole field plays, else null. Same clock as the audio. */
  playhead:sound.playing==='all'?Math.min(1,sound.elapsed/span):null,
  selectUnit:(unitId:string)=>dispatch({type:'select-unit',unitId}),
  selectEvent:(eventId:string)=>dispatch({type:'select-event',eventId}),
  deselect:()=>dispatch({type:'deselect'}),
  tapField,tapEvent,tapRow,placeUnit,moveEvent,copy,remove,keyMove,setClip,
  // A length too short for the longest sound is only explained, so it does not stop what is playing.
  setSpan:(spanSeconds:SpanSeconds)=>{const work=latest.current.arrangement;if(work&&spanHolds(work,spanSeconds))stopAll();dispatch({type:'span',spanSeconds,now:new Date()});},
  addRow:()=>dispatch({type:'add-row',now:new Date()}),
  removeRow:()=>dispatch({type:'remove-row',now:new Date()}),
  previewUnit:sound.previewUnit,previewEvent:sound.previewEvent,previewClip:sound.previewClip,previewSource:sound.previewSource,
  stopSound:sound.stopSound,playAll:sound.playAll,finish,
  loadSource:(sourceId:string)=>sound.bank.source(sourceId),
  // The mood colours the background, so a running full playback stops when it changes (like any edit).
  setMood:(next:Parameters<typeof mood.setMood>[0])=>{stopAll();mood.setMood(next);},
  customMood:(text:string)=>{stopAll();return mood.customMood(text);},
  interpreting:mood.interpreting,moodModelAvailable:mood.moodModelAvailable,
  pickMood:(id:Parameters<typeof mood.pickMood>[0])=>{stopAll();mood.pickMood(id);},
  addUnit:(unit:SoundUnitDraft)=>{stopAll();dispatch({type:'add-unit',unit,now:new Date()});},
  clearEvents:()=>{stopAll();dispatch({type:'clear-events',now:new Date()});},
  scope:(scope:LibraryScope)=>repository.scope(scope),
  inspiration:settings.inspiration,inspirationEntries:entries,setInspiration,matches,teachingOpen,
  backgroundEnabled:settings.background.enabled,backgroundTrack:background.track,backgroundPlan,setBackgroundEnabled,
 };
}
export type SoundWorld=ReturnType<typeof useSoundWorld>;
