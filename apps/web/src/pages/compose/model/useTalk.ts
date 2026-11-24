import {useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import type {Inspiration} from '@wanwu-v2/contracts/work';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import type {BackgroundPlan} from '@wanwu-v2/sound-rules/background';
import type {TalkPolisher} from '../../../shared/talk/polisher';
import {localTalk,mergeTalk,polishTalk,talkKey} from '../../../shared/talk/talkView';
import type {Polished,TalkView} from '../../../shared/talk/talkView';
const idleSubscribe=()=>()=>{};

/**
 * 音乐小发现 and 课本讲解 for 万物成曲 (rules in shared/talk/talkView.ts). The corpus sentences show at once; when a model is
 * connected, an AI rewording is asked for in the background and only the lines that pass the checks replace them.
 */
export function useTalk(arrangement:Arrangement|null,track:TextbookTrack|null,inspiration:Inspiration,plan:BackgroundPlan|null,polisher:TalkPolisher):TalkView{
 useSyncExternalStore(polisher.subscribe??idleSubscribe,()=>`${polisher.revisionKey??'local'}:${polisher.open}`,()=>`${polisher.revisionKey??'local'}:${polisher.open}`);
 const basis=polisher.basis;
 const local=useMemo(()=>localTalk(arrangement,track,inspiration,plan,basis),[arrangement,track,inspiration,plan,basis]);
 const key=talkKey(local)+'|'+(polisher.revisionKey??'local');
 const [polished,setPolished]=useState<{key:string;value:Polished}|null>(null);
 useEffect(()=>{
  const controller=new AbortController();
  void polishTalk(local,polisher,controller.signal).then(value=>{if(value&&!controller.signal.aborted)setPolished({key,value});});
  return()=>controller.abort();
 // Only when what would be sent changes.
 },[key,polisher,polisher.open]);
 return useMemo(()=>mergeTalk(local,polished?.key===key?polished.value:null,polisher.open),[local,polished,key,polisher.open]);
}
