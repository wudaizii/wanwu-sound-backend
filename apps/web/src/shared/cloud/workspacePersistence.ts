import {parseWorkRecord,workEtag} from '@wanwu-v2/contracts/cloud';
import type {WorkContent,WorkRecord} from '@wanwu-v2/contracts/cloud';
import {AccountError} from '../account/accountClient';
import type {CloudWorkspace} from './cloudWorkspace';
import {workSession} from '../creation/workSession';
import {newId} from '../creation/ids';

export const checkedWork=(value:unknown)=>{const work=parseWorkRecord(value);if(!work)throw new AccountError('bad-response');return work;};
export function localContent(title:string):WorkContent{
 const arrangement=workSession.current();if(!arrangement)throw new Error('先做一个声音，或新建一份云端草稿。');
 return {id:arrangement.id,title,arrangement,settings:workSession.settings()};
}
function stable(value:unknown):unknown{
 if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)]));return value;
}
const comparable=(value:unknown)=>JSON.stringify(stable(value));
export const sameContent=(left:WorkContent,right:WorkContent)=>comparable(left.arrangement)===comparable(right.arrangement)&&comparable(left.settings)===comparable(right.settings)&&left.title===right.title;
export const requestContent=(value:WorkContent)=>({...value,arrangement:{...value.arrangement,units:value.arrangement.units.map(unit=>{
 const {analysis:_,...rest}=unit;return rest;
})}});

/** Refresh only technical facts; never replace choices/placements made while an upload was running. */
async function sourcesReady(workspace:CloudWorkspace,guard:()=>void){
 for(let attempt=0;attempt<13;attempt++){
  const before=localContent(workspace.state.title),epoch=workspace.media.epoch,views=await workspace.media.prepare(before.arrangement,message=>{guard();workspace.update({phase:'uploading',message});});guard();
  const current=localContent(workspace.state.title);
  if(current.id!==before.id)throw new AccountError('version-conflict');
  if(current.arrangement.units.some(unit=>!views.has(unit.sourceId)))continue;
  const arrangement={...current.arrangement,units:current.arrangement.units.map(unit=>({...unit,analysis:views.get(unit.sourceId)!.analysis!}))};
  const changed=comparable(current.arrangement.units)!==comparable(arrangement.units);
  workspace.suppress=true;try{workSession.save(arrangement);}finally{workspace.suppress=false;}
  if(changed||epoch!==workspace.media.epoch)workspace.update({epoch:workspace.state.epoch+1});
  return {...current,arrangement};
 }throw new Error('创作仍在持续变化，停止编辑后再保存。');
}
export async function attachCurrent(workspace:CloudWorkspace,guard:()=>void,fork=false){
 if(!workspace.state.accountId)throw new AccountError('needs-account');
 let local=workSession.current();
 if(!local){local={version:'arrangement-v1',id:newId('work'),units:[],events:[],rows:3,spanSeconds:30,mood:null,origin:'child',updatedAt:new Date().toISOString()};
  workspace.suppress=true;try{workSession.save(local);}finally{workspace.suppress=false;}}
 const content=await sourcesReady(workspace,guard);
 if(fork){content.id=newId('work');content.arrangement={...content.arrangement,id:content.id};}
 const response=await workspace.api.business('/api/v1/works','POST',requestContent(content));guard();
 workspace.record=checkedWork(response.data);
 const latest=localContent(workspace.state.title);if(latest.id!==local.id)throw new AccountError('version-conflict');
 workspace.suppress=true;try{workSession.save({...latest.arrangement,id:workspace.record.id});}finally{workspace.suppress=false;}
 const clean=sameContent(localContent(workspace.state.title),workspace.record);
 workspace.update({workId:workspace.record.id,title:workspace.record.title,phase:clean?'saved':'saving',message:clean?'草稿已云端保存。':'还有改动待保存…',epoch:workspace.state.epoch+1});
 if(!clean)workspace.schedule();
 await workspace.refreshDrafts();return workspace.record;
}
export async function flushCurrent(workspace:CloudWorkspace,guard:()=>void):Promise<WorkRecord>{
 const previous=workspace.record;if(!previous||previous.id!==workSession.current()?.id)throw new Error('请先确认将当前创作保存到账号。');
 const content=await sourcesReady(workspace,guard);let record=workspace.record!;
 workspace.update({phase:'saving',message:'正在保存草稿…'});
 if(comparable(content.arrangement)!==comparable(record.arrangement)){
  const response=await workspace.api.business(`/api/v1/works/${encodeURIComponent(record.id)}/arrangement`,'PUT',requestContent(content).arrangement,workEtag(record.id,record.revision));guard();
  workspace.record=record=checkedWork(response.data);
 }
 if(comparable(content.settings)!==comparable(record.settings)){
  const response=await workspace.api.business(`/api/v1/works/${encodeURIComponent(record.id)}/compose-settings`,'PUT',content.settings,workEtag(record.id,record.revision));guard();
  workspace.record=record=checkedWork(response.data);
 }
 if(content.title!==record.title){
  const response=await workspace.api.business(`/api/v1/works/${encodeURIComponent(record.id)}`,'PATCH',{title:content.title},workEtag(record.id,record.revision));guard();
  workspace.record=record=checkedWork(response.data);
 }
 const clean=sameContent(localContent(workspace.state.title),record);
 workspace.update({phase:clean?'saved':'saving',message:clean?'草稿已云端保存。':'还有改动待保存…'});
 if(!clean)workspace.schedule();return record;
}
