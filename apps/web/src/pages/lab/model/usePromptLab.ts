import {useEffect,useMemo,useState} from 'react';
import type {Arrangement,MoodId} from '@wanwu-v2/contracts/arrangement';
import type {SoundDimension,SoundKind} from '@wanwu-v2/contracts/sound';
import type {TextbookTrack,TextbookVariation} from '@wanwu-v2/contracts/textbook';
import type {TaskId} from '@wanwu-v2/prompts/tasks';
import {services} from '../../../app/services';
import {presetMood} from '../../../shared/creation/moodCopy';
import {exampleReply,taskView} from './promptTasks';

/** 提示词台 state: the work of this visit (or the example), what the task depends on, and a pasted reply. */
export function usePromptLab(){
 const [arrangement,setArrangement]=useState<Arrangement|null>(null);
 const [tracks,setTracks]=useState<readonly TextbookTrack[]>([]);
 const [task,setTask]=useState<TaskId>('work-talk');
 const [mood,setMood]=useState<MoodId|null>(null);
 const [trackId,setTrackId]=useState<string|null>(null);
 const [variation,setVariation]=useState<TextbookVariation>('original');
 const [attempt,setAttempt]=useState(0);
 const [hint,setHint]=useState<{dimension:SoundDimension;value:string;kind:SoundKind|null}>({dimension:'pitch',value:'high',kind:'series'});
 const [moodText,setMoodText]=useState('有点想家');
 const [reply,setReply]=useState('');

 useEffect(()=>{
  let live=true;
  void Promise.all([services.composeRepository.load(),services.inspirationCatalog.list()]).then(([work,catalogue])=>{
   if(!live)return;
   setArrangement(work.arrangement);setTracks(catalogue.entries);setMood(presetMood(work.arrangement.mood));
   const settings=work.settings.inspiration;
   if(settings.kind==='textbook'){setTrackId(settings.entryId);setVariation(settings.variation??'original');}
  });
  return()=>{live=false;};
 },[]);

 const track=tracks.find(item=>item.id===trackId)??null;
 const view=useMemo(()=>taskView(task,{arrangement,tracks,mood,track,variation,attempt,hint,moodText}),[task,arrangement,tracks,mood,track,variation,attempt,hint,moodText]);
 const check=useMemo(()=>reply.trim()&&view.check?view.check(reply):null,[reply,view]);
 return {
  task,arrangement,tracks,mood,track,variation,attempt,hint,moodText,reply,view,check,
  pickTask:(next:TaskId)=>{setTask(next);setReply('');},
  setMood,setTrackId,setVariation,setAttempt,setHint,setMoodText,setReply,
  fillExample:()=>setReply(exampleReply(task)),
 };
}
export type PromptLab=ReturnType<typeof usePromptLab>;
