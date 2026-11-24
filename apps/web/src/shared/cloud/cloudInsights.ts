import {parseAccountUsage,parseWorkFacts,parseBoundWorkTalk} from '@wanwu-v2/contracts/cloud-status';
import {workEtag} from '@wanwu-v2/contracts/cloud';
import {isSoundToken} from '@wanwu-v2/contracts/talk';
import type {WorkTalkBrief} from '@wanwu-v2/contracts/talk';
import {AccountError} from '../account/accountClient';
import {workSession} from '../creation/workSession';
import {localContent,sameContent} from './workspacePersistence';
import {cloudError} from './cloudTypes';
import type {CloudWorkspace} from './cloudWorkspace';
import {exactObject} from '@wanwu-v2/contracts/account';

export type CloudTalkBasis={brief:WorkTalkBrief;names:string[];binding:string};
/** Read-only server facts and usage. Failures never undo a successful save or replace local editing. */
export class CloudInsights{
 private epoch=0;private usageEpoch=0;private factsRequest:AbortController|null=null;private aiRequest:AbortController|null=null;
 private requested='';private capabilityAt=0;private factsKey='';private cachedTalk:{binding:string;reply:unknown}|null=null;
 constructor(readonly workspace:CloudWorkspace){}
 reset(){this.epoch++;this.usageEpoch++;this.requested='';this.capabilityAt=0;this.cachedTalk=null;this.factsRequest?.abort();this.aiRequest?.abort();}
 invalidate(){this.epoch++;this.requested='';this.cachedTalk=null;this.factsRequest?.abort();this.aiRequest?.abort();this.workspace.update({facts:null,factsPhase:'stale',factsMessage:'作品有新改动，等待云端同步。',talkMessage:''});}
 private current(){
  const {workspace:w}=this,record=w.record;
  if(!w.state.accountId||!record||w.state.phase!=='saved'||workSession.current()?.id!==record.id)return null;
  return sameContent(localContent(w.state.title),record)?{account:w.state.accountId,id:record.id,revision:record.revision,epoch:this.epoch}:null;
 }
 private matches(target:NonNullable<ReturnType<CloudInsights['current']>>){const now=this.current();return !!now&&Object.keys(target).every(k=>now[k as keyof typeof now]===target[k as keyof typeof target]);}
 get key(){const t=this.current(),f=this.workspace.state.facts;return t&&f?`${t.account}:${t.id}:${t.revision}:${t.epoch}:${f.inputDigest}`:`unbound:${this.epoch}`;}
 saved(){const t=this.current();if(!t)return;const key=`${t.account}:${t.id}:${t.revision}:${t.epoch}`;if(key===this.requested)return;this.requested=key;void this.refreshFacts();void this.refreshUsage();}
 async refreshUsage(force=false){
  const w=this.workspace,account=w.state.accountId;if(!account||w.state.usagePhase==='loading')return;const epoch=++this.usageEpoch;
  w.update({usage:null,usagePhase:'loading',usageMessage:''});
  try{
   const response=await w.api.business('/api/v1/account/usage');
   if(w.state.accountId!==account||epoch!==this.usageEpoch)return;
   const usage=parseAccountUsage(response.data);if(!usage)throw new AccountError('bad-response');
   w.update({usage,usagePhase:'ready'});
  }catch(error){if(w.state.accountId===account&&epoch===this.usageEpoch)w.update({usage:null,usagePhase:'error',usageMessage:cloudError(error)});}
  if(w.state.accountId!==account||epoch!==this.usageEpoch||(!force&&Date.now()-this.capabilityAt<60_000))return;
  this.capabilityAt=Date.now();
  try{
   const response=await w.api.business('/api/v1/guest/status');const body=response.data as Record<string,unknown>|null;
   if(w.state.accountId===account&&epoch===this.usageEpoch)w.update({languageAvailable:response.status===200&&exactObject(body,['language','music','audio'])&&body.language===true});
  }catch{if(w.state.accountId===account&&epoch===this.usageEpoch)w.update({languageAvailable:false});}
 }
 async refreshFacts(){
  const w=this.workspace,target=this.current();if(!target)return;
  const key=`${target.account}:${target.id}:${target.revision}:${target.epoch}`;
  if(w.state.factsPhase==='loading'&&this.factsKey===key&&!this.factsRequest?.signal.aborted)return;
  this.factsKey=key;
  this.factsRequest?.abort();const controller=this.factsRequest=new AbortController();
  w.update({facts:null,factsPhase:'loading',factsMessage:'正在核对已同步的作品…'});
  try{
   const response=await w.api.business(`/api/v1/works/${encodeURIComponent(target.id)}/facts?revision=${target.revision}`,'GET',undefined,undefined,controller.signal);
   if(controller.signal.aborted||!this.matches(target))return;
   const facts=parseWorkFacts(response.data);if(!facts)throw new AccountError('bad-response');
   if(facts.workId!==target.id||facts.revision!==target.revision||response.etag!==workEtag(target.id,target.revision))throw new AccountError('version-conflict');
   w.update({facts,factsPhase:'ready',factsMessage:`云端版本 ${facts.revision}：${facts.events.length} 处声音，成品时长 ${facts.seconds} 秒。`});
  }catch(error){
   if(controller.signal.aborted||!this.matches(target))return;
   const conflict=error instanceof AccountError&&error.reason==='version-conflict';
   w.update({facts:null,factsPhase:'error',factsMessage:cloudError(error),...(conflict?{phase:'conflict' as const,conflictId:target.id,message:cloudError(error)}:{})});
  }
 }
 basis():CloudTalkBasis|null{
  const w=this.workspace,f=w.state.facts,target=this.current();
  if(!target||w.state.factsPhase!=='ready'||!f?.talkBrief||f.workId!==target.id||f.revision!==target.revision)return null;
  const names:string[]=[];
  for(const event of f.events){
   const placement=w.record!.arrangement.events.find(item=>item.id===event.eventId),unit=w.record!.arrangement.units.find(item=>item.id===placement?.unitId);
   if(!unit)return null;const index=Number(event.token.slice(2))-1;if(names[index]&&names[index]!==unit.name)return null;names[index]=unit.name;
  }
  if(!names.length||Array.from({length:names.length},(_,i)=>names[i]).some(name=>!name))return null;
  for(const fact of f.talkBrief.facts)for(const value of Object.values(fact))if(isSoundToken(value)&&!names[Number(value.slice(2))-1])return null;
  return {brief:f.talkBrief,names,binding:this.key};
 }
 async workTalk(signal:AbortSignal){
  const w=this.workspace,basis=this.basis(),facts=w.state.facts;if(!basis||!facts||!w.state.languageAvailable||signal.aborted)return null;
  if(this.cachedTalk?.binding===basis.binding)return this.cachedTalk.reply;
  this.aiRequest?.abort();const controller=this.aiRequest=new AbortController(),stop=()=>controller.abort();signal.addEventListener('abort',stop,{once:true});
  try{
   const response=await w.api.business(`/api/v1/works/${encodeURIComponent(facts.workId)}/talk`,'POST',
    {revision:facts.revision,inputDigest:facts.inputDigest},workEtag(facts.workId,facts.revision),controller.signal);
   if(controller.signal.aborted||signal.aborted||this.basis()?.binding!==basis.binding)return null;
   const result=parseBoundWorkTalk(response.data);
   if(!result||result.workId!==facts.workId||result.revision!==facts.revision||result.inputDigest!==facts.inputDigest)throw new AccountError('bad-response');
   this.cachedTalk={binding:basis.binding,reply:result.reply};w.update({talkMessage:`讲解对应云端版本 ${result.revision}。`});return result.reply;
  }catch(error){
   if(!controller.signal.aborted&&!signal.aborted&&this.basis()?.binding===basis.binding)w.update({talkMessage:cloudError(error)});
   return null;
  }finally{signal.removeEventListener('abort',stop);}
 }
}
