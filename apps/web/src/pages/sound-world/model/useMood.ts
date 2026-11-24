import {useRef,useState} from 'react';
import type {Dispatch} from 'react';
import type {MoodChoice,MoodId} from '@wanwu-v2/contracts/arrangement';
import {cleanMoodText,parseInterpretation} from '../services/moodInterpreter';
import type {MoodInterpreter} from '../services/moodInterpreter';
import type {NoticeKey,SoundWorldAction} from './soundWorldState';

/** 这首曲子的心情: presets always; the child's own words only while a model can understand them. */
export function useMood(moods:MoodInterpreter,dispatch:Dispatch<SoundWorldAction>,notify:(key:NoticeKey,tone?:'info'|'error')=>void){
 const moodRequest=useRef<AbortController|null>(null);
 const [interpreting,setInterpreting]=useState(false);
 const setMood=(mood:MoodChoice|null)=>{moodRequest.current?.abort();dispatch({type:'mood',mood,now:new Date()});};
 /** Returns false when the words could not be accepted (no model, empty text, or the model gave no usable answer). */
 const customMood=async(text:string)=>{
  const clean=cleanMoodText(text);
  if(!moods.available){notify('mood-model-off','info');return false;}
  if(!clean)return false;
  moodRequest.current?.abort();const controller=new AbortController();moodRequest.current=controller;
  setInterpreting(true);
  try{
   const result=parseInterpretation(await moods.interpret(clean,controller.signal));
   if(controller.signal.aborted||!result)return false;
   dispatch({type:'mood',mood:{kind:'custom',text:clean,nearest:result.nearest},now:new Date()});
   return true;
  }catch{return false;}
  finally{if(moodRequest.current===controller){moodRequest.current=null;setInterpreting(false);}}
 };
 return {setMood,customMood,interpreting,moodModelAvailable:moods.available,
  pickMood:(id:MoodId|null)=>setMood(id?{kind:'preset',id}:null)};
}
