// 做好了 / 再做一个: hand the sound over to the work (through the app), or walk the child to the first thing still
// missing. 做好了 opens 万物声场; 再做一个 keeps the sound in the work and empties the page for the next one.
import {useRef} from 'react';
import type {Dispatch,RefObject} from 'react';
import type {SoundAnalysis,SoundSource,SoundUnitDraft} from '@wanwu-v2/contracts/sound';
import {newId} from '../../../shared/creation/ids';
import {birthCopy} from '../config/copy';
import type {Notify} from './localSource';
import {finishCheck,toSoundUnitDraft} from './soundBirthState';
import type {SoundBirthAction,SoundBirthState} from './soundBirthState';

export type FinishThen='world'|'another';
/** `kept`: the sound is in the work (`count` sounds now). `full`: the work holds as many sounds as it may. `empty`: 做好了
 *  with no sound on the page and none in the work yet. */
export type FinishResult={status:'unavailable'}|{status:'opened'}|{status:'kept';nextMarkerIndex:number;count:number}|{status:'full'}|{status:'empty'};
/** The sound to hand over, or null to go on to 万物声场 with the sounds already kept. */
export type FinishedSound={draft:SoundUnitDraft;source:SoundSource}|null;
/** The sound opened again from 万物声场 (返回声音诞生): while the child keeps its source, finishing updates it. */
export type EditTarget={unitId:string;sourceId:string;markerIndex:number}|null;

type Options={
 state:SoundBirthState;dispatch:Dispatch<SoundBirthAction>;notify:Notify;
 /** 声音体检 of the current source, when its audio is here. */
 analysis:()=>SoundAnalysis|null;
 editTarget:RefObject<EditTarget>;
 onFinish:(sound:FinishedSound,then:FinishThen)=>FinishResult;
 /** Stop playback before the sound leaves the page. */
 stop:()=>void;
 /** The page's own leftovers to clear before the next sound (hint, preview, photo…). */
 clearPage:()=>void;
 /** The field cannot open (the button then says so). */
 block:()=>void;
};

export function useFinish({state,dispatch,notify,analysis,editTarget,onFinish,stop,clearPage,block}:Options){
 /** The source whose silence the child was already told about (a second press goes on). */
 const silentWarned=useRef<string|null>(null);
 return (then:FinishThen)=>{
  const check=finishCheck(state);
  switch(check.kind){
   case 'no-source':{
    if(then==='world'&&onFinish(null,then).status==='opened')return;
    return notify('bar',birthCopy.needSound,'info');
   }
   case 'missing-provenance':return notify('info',birthCopy.needProvenance,'info');
   case 'ready':{
    // A silent sound may still be used, but only after the child has heard the warning once.
    if(analysis()?.silent&&silentWarned.current!==state.source?.id){silentWarned.current=state.source?.id??null;return notify('bar',birthCopy.silentFinish,'info');}
    if(!state.cardConfirmed)dispatch({type:'card',confirmed:true});
    const target=editTarget.current,id=target&&state.source?.id===target.sourceId?target.unitId:newId('unit');
    const draft=toSoundUnitDraft(state,id,new Date(),analysis()??undefined);if(!draft||!state.source)return;
    stop();
    const result=onFinish({draft,source:state.source},then);
    if(result.status==='kept'){
     // Nothing of the last sound carries over: the next one starts empty, with its own number.
     editTarget.current=null;silentWarned.current=null;clearPage();
     dispatch({type:'next',markerIndex:result.nextMarkerIndex,notice:{tone:'done',area:'editor',text:birthCopy.kept(draft.name,result.count)}});
    }else if(result.status==='full')notify('editor',birthCopy.workFull,'info');
    else if(result.status==='unavailable'){block();notify('editor',birthCopy.worldUnavailable,'info');}
   }
  }
 };
}
