import {useCallback,useEffect,useMemo,useReducer,useRef,useState,useSyncExternalStore} from 'react';
import {SOUND_SOURCE_MAX_MS,SOUND_SOURCE_SLACK_MS,cleanSourceText,missingProvenance,normalizeSoundName} from '@wanwu-v2/contracts/sound';
import type {SoundDimension,SoundSource,SoundUnitDraft} from '@wanwu-v2/contracts/sound';
import {audioSupported} from '../../../shared/audio/audioContext';
import {unchangedBy} from '@wanwu-v2/sound-rules/shaping';
import {SequencePlayer} from '../../../shared/audio/SequencePlayer';
import {analysisOf} from '../../../shared/audio/soundAnalysis';
import {decodeAudio,loadAudio} from '../../../shared/audio/loadAudio';
import {EXAMPLE_TIMEOUT_MS,exampleSourceUrl} from '../../../shared/creation/exampleSounds';
import {FILE_MAX_BYTES,birthCopy} from '../config/copy';
import {sessionArchive} from '../../../shared/creation/sourceArchive';
import {exampleLibraryItem,libraryGroups} from '../services/soundLibrary';
import type {LibraryItem} from '../services/soundLibrary';
import type {SoundLibraryService} from '../../../shared/creation/soundLibrary';
import {services} from '../../../app/services';
import type {SoundHint,SoundHintProvider} from '../services/soundHints';
import {baseName,describeExcerpt,describeLocal} from './localSource';
import type {Notify} from './localSource';
import {editingSoundBirth,initialSoundBirth,soundBirthReducer} from './soundBirthState';
import {useFinish} from './useFinish';
import type {EditTarget,FinishResult,FinishThen,FinishedSound} from './useFinish';
import {TRIM_FILE_MAX_MS} from './trimEditing';
import {useLibraryItems} from './useLibraryItems';
import {useRecording} from './useRecording';
import {useShapedPreview} from './useShapedPreview';
import {useTrimUpload} from './useTrimUpload';

export type {FinishResult,FinishThen,FinishedSound} from './useFinish';
export type {CompareTarget} from './useShapedPreview';
export type {RecordPhase} from './useRecording';
export type ProvenanceField='label'|'recordedBy'|'recordedOn'|'place'|'group';
/** A sound already in the work, opened again from 万物声场 (返回声音诞生) to go on editing it. */
export type EditingSound={unit:SoundUnitDraft;source:SoundSource};

/** 声音诞生: bring a sound in (library, file, recording), shape it with the five choices, check its card, finish.
 *  Recording, trimming, library loading and the shaped preview live in their own hooks; this one ties them together. */
export function useSoundBirth(markerIndex:number,onFinish:(sound:FinishedSound,then:FinishThen)=>FinishResult,hints:SoundHintProvider=services.soundHints,editing:EditingSound|null=null,
 sounds:SoundLibraryService=services.soundLibrary){
 const [state,dispatch]=useReducer(soundBirthReducer,null,()=>editing?editingSoundBirth(editing.unit,editing.source):initialSoundBirth(markerIndex));
 /** While the child keeps the same source, 做好了 updates the sound being edited; a new source makes a new sound. */
 const editTarget=useRef<EditTarget>(editing&&{unitId:editing.unit.id,sourceId:editing.source.id,markerIndex:editing.unit.markerIndex});
 const local=useSyncExternalStore(sessionArchive.subscribe,sessionArchive.list);
 // The library's examples come through the shared port (the same list 万物声场 offers).
 const [examples,setExamples]=useState<readonly LibraryItem[]>([]);
 useEffect(()=>{let live=true;void sounds.list().then(list=>{if(live)setExamples(list.examples.map(exampleLibraryItem));});return()=>{live=false;};},[sounds]);
 const [playing,setPlaying]=useState<string|null>(null);
 const [progress,setProgress]=useState(0);
 const [blocked,setBlocked]=useState(false);
 const [lastChosen,setLastChosen]=useState<SoundDimension|null>(null);
 const [hint,setHint]=useState<(SoundHint&{key:string})|null>(null);
 const hintRequest=useRef<AbortController|null>(null);
 const player=useMemo(()=>new SequencePlayer(setPlaying),[]);
 const buffers=useRef(new Map<string,AudioBuffer>());
 const photo=useRef<string|null>(null);
 const latest=useRef(state);latest.current=state;

 const notify=useCallback<Notify>((area,text,tone='error')=>dispatch({type:'notice',notice:{tone,area,text}}),[]);
 const bufferOf=(id:string)=>buffers.current.get(id)??sessionArchive.buffer(id);
 const sourceBuffer=state.source?bufferOf(state.source.id):null;

 const preview=useShapedPreview(player,playing,notify,()=>{const source=latest.current.source;return {source,buffer:source&&bufferOf(source.id)||null};},sourceBuffer??null,state.shape);
 const useSource=(source:SoundSource,buffer:AudioBuffer)=>{
  buffers.current.set(source.id,buffer);player.stop();preview.reset();setBlocked(false);
  const target=editTarget.current;
  dispatch({type:'source-ready',source,markerIndex:target?(source.id===target.sourceId?target.markerIndex:markerIndex):undefined});
  // Nothing to hear (声音体检 found no sound): tell the child right away; the recording itself is kept.
  if(analysisOf(buffer).silent)notify('bar',birthCopy.silent,'info');
 };
 const archiveAndUse=(source:SoundSource,buffer:AudioBuffer)=>{sessionArchive.save(source,buffer);useSource(source,buffer);};
 const recording=useRecording(player,playing,notify,take=>archiveAndUse(describeLocal('local-recording',birthCopy.defaultRecordingName,take.buffer,take.mimeType),take.buffer));
 const trimming=useTrimUpload(player,playing,({label,part,mimeType,range,from})=>
  archiveAndUse(from?describeExcerpt(from,range,part):describeLocal('local-file',label,part,mimeType),part));
 /** Longer than a source may be: the child picks the part to keep (the original is untouched). */
 const openTrim=(buffer:AudioBuffer,label:string,mimeType:string,from:SoundSource|null)=>{
  trimming.start(buffer,label,mimeType,from);
  dispatch({type:'reading',reading:false});dispatch({type:'notice',notice:null});dispatch({type:'dialog',dialog:'trim'});
 };
 const tooLong=(buffer:AudioBuffer)=>buffer.duration*1000>SOUND_SOURCE_MAX_MS+SOUND_SOURCE_SLACK_MS;
 const library=useLibraryItems(player,playing,notify,{get:bufferOf,set:(id,buffer)=>buffers.current.set(id,buffer)},
  (source,buffer)=>tooLong(buffer)?openTrim(buffer,source.label,source.mimeType,source):useSource(source,buffer));

 // Progress follows the audio clock only while something plays.
 useEffect(()=>{
  if(!playing){setProgress(0);return;}
  let frame=0;const tick=()=>{setProgress(player.progress()??0);frame=requestAnimationFrame(tick);};
  frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[playing,player]);

 // Editing a sound again: say so, and load its audio if this page does not hold it (a library example).
 useEffect(()=>{
  if(!editing)return;
  notify('editor',birthCopy.editing(editing.unit.name),'info');
  const {source}=editing;
  if(bufferOf(source.id))return;
  const url=source.kind==='example'?exampleSourceUrl(source.id):null;
  if(!url){notify('bar',birthCopy.editMissing);return;}
  const controller=new AbortController();
  dispatch({type:'reading',reading:true});
  void loadAudio(url,{signal:controller.signal,timeoutMs:EXAMPLE_TIMEOUT_MS})
   .then(buffer=>{buffers.current.set(source.id,buffer);dispatch({type:'reading',reading:false});})
   .catch(()=>{if(!controller.signal.aborted){dispatch({type:'reading',reading:false});notify('bar',birthCopy.editMissing);}});
  return()=>controller.abort();
 // Once, for the sound this page was opened with.
 },[]);

 // Leaving the page or hiding the tab stops sound; a running recording is stopped and kept for review.
 useEffect(()=>{
  const hidden=()=>{if(document.visibilityState!=='hidden')return;player.stop();if(recording.active())void recording.stop();};
  document.addEventListener('visibilitychange',hidden);
  return()=>{
   document.removeEventListener('visibilitychange',hidden);
   player.stop();
   if(photo.current)URL.revokeObjectURL(photo.current);
  };
 },[player]);

 const chooseFile=async(file:File)=>{
  if(!audioSupported())return notify('bar',birthCopy.noAudio);
  if(file.size>FILE_MAX_BYTES)return notify('bar',birthCopy.fileTooBig);
  if(file.type&&!file.type.startsWith('audio/')&&!file.type.startsWith('video/'))return notify('bar',birthCopy.fileUnreadable);
  dispatch({type:'reading',reading:true});
  try{
   const buffer=await decodeAudio(await file.arrayBuffer());
   const label=cleanSourceText(baseName(file.name))??birthCopy.defaultRecordingName,mimeType=file.type||'audio/*';
   if(buffer.duration*1000>TRIM_FILE_MAX_MS){dispatch({type:'reading',reading:false});return notify('bar',birthCopy.tooLong);}
   if(tooLong(buffer))return openTrim(buffer,label,mimeType,null);
   archiveAndUse(describeLocal('local-file',label,buffer,mimeType),buffer);
  }catch{dispatch({type:'reading',reading:false});notify('bar',birthCopy.fileUnreadable);}
 };
 const openRecord=()=>{recording.open();dispatch({type:'notice',notice:null});dispatch({type:'dialog',dialog:'record'});};
 const closeDialog=()=>{
  recording.cancel();trimming.cancel();
  if(playing==='take'||playing==='trim'||playing?.startsWith('item:'))player.stop();
  library.abort();dispatch({type:'dialog',dialog:null});
 };

 /** 声音体检 of the current source (cached per buffer). */
 const analysisNow=()=>{const source=latest.current.source,buffer=source&&bufferOf(source.id);return buffer?analysisOf(buffer):null;};
 const choose=(dimension:SoundDimension,value:string)=>{
  dispatch({type:'choose',dimension,value});setBlocked(false);setLastChosen(dimension);
  hintRequest.current?.abort();
  // When the sound is already like that, say so — otherwise the child may think the choice did nothing.
  const same=unchangedBy(dimension,value,analysisNow());
  if(same)setHint({text:birthCopy.unchanged(dimension,value,same),origin:'preset',key:`${dimension}:${value}:same`});
  // Otherwise ask the guide for an association; a newer choice cancels an older request.
  const controller=new AbortController();hintRequest.current=controller;
  if(!same)void hints.hint({dimension,value,shape:{...latest.current.shape,[dimension]:value},kind:analysisNow()?.kind??null},controller.signal)
   .then(result=>{if(result&&!controller.signal.aborted)setHint({...result,key:`${dimension}:${value}`});}).catch(()=>{});
  if(!latest.current.source)return notify('editor',birthCopy.noSoundYet,'info');
  void preview.play({...latest.current.shape,[dimension]:value},'current',true);
 };
 /** Take a choice back: that dimension returns to the original, and the result plays so the change can be heard. */
 const clear=(dimension:SoundDimension)=>{
  const was=latest.current.shape[dimension];
  dispatch({type:'clear',dimension});setBlocked(false);setLastChosen(dimension);
  hintRequest.current?.abort();
  setHint(was?{text:birthCopy.cleared(dimension,was),origin:'preset',key:`${dimension}:${was}:cleared`}:null);
  if(!latest.current.source)return;
  const shape={...latest.current.shape};delete shape[dimension];
  void preview.play(shape,'current',true);
 };
 const updateSource=(field:ProvenanceField,value:string)=>{
  const source=latest.current.source;if(!source||source.kind==='example')return;
  const clean=field==='recordedOn'?(/^\d{4}-\d{2}-\d{2}$/.test(value)?value:null):cleanSourceText(value);
  const next:SoundSource=field==='label'?{...source,label:clean??''}:{...source,provenance:{...source.provenance,[field]:clean}};
  sessionArchive.update(next);dispatch({type:'source-update',source:next});
 };
 const setCardPhoto=(file:File|null)=>{
  if(photo.current)URL.revokeObjectURL(photo.current);
  photo.current=file?URL.createObjectURL(file):null;
  dispatch({type:'card-photo',url:photo.current});
 };
 const finish=useFinish({state,dispatch,notify,analysis:analysisNow,editTarget,onFinish,stop:()=>player.stop(),block:()=>setBlocked(true),
  clearPage:()=>{
   hintRequest.current?.abort();setHint(null);setLastChosen(null);setBlocked(false);preview.reset();
   if(photo.current){URL.revokeObjectURL(photo.current);photo.current=null;}
  }});

 const {shown,currentBuffer}=preview,trim=trimming.trim;
 const displayBuffer=shown==='current'&&currentBuffer?currentBuffer:sourceBuffer;
 const showingCurrent=!!currentBuffer&&displayBuffer===currentBuffer;
 return {
  state,dispatch,playing,loadingId:library.loadingId,blocked,lastChosen,hint,local,groups:useMemo(()=>libraryGroups(examples,local),[examples,local]),
  wave:{buffer:displayBuffer,original:sourceBuffer??null,target:showingCurrent?'current' as const:'original' as const,progress:playing===(showingCurrent?'current':'original')?progress:0},
  record:{phase:recording.phase,ms:recording.ms,take:recording.take?.buffer??null,progress:playing==='take'?progress:0},
  trim:trim&&{buffer:trim.buffer,label:trim.label,range:trim.range,playing:playing==='trim',progress:playing==='trim'?progress:0},
  setTrimRange:trimming.setRange,listenTrim:trimming.listen,useTrim:trimming.use,
  suggestions:{recordedBy:sessionArchive.recent('recordedBy'),place:sessionArchive.recent('place'),group:sessionArchive.recent('group')},
  previewItem:library.preview,pickItem:library.pick,chooseFile,openRecord,startRecording:recording.start,stopRecording:recording.stop,
  listenTake:recording.listen,useTake:recording.use,closeDialog,
  playCompare:preview.playCompare,playShown:preview.playShown,choose,clear,updateSource,setCardPhoto,
  finish:()=>finish('world'),another:()=>finish('another'),
  /** A new name: the sound marker says it back. */
  rename:(name:string)=>{
   const before=latest.current.name;dispatch({type:'rename',name});
   const after=normalizeSoundName(name,latest.current.source?.label??'');
   if(after!==before)setHint({text:birthCopy.bubble.renamed(after),origin:'preset',key:`rename:${after}`});
  },
  confirmCard:()=>{
   if(latest.current.source&&missingProvenance(latest.current.source).length){notify('info',birthCopy.needProvenance,'info');return;}
   dispatch({type:'card',confirmed:true});
  },
 };
}
