import type {AccountView} from '@wanwu-v2/contracts/account';
import type {WorkRecord,WorkSummary,RenderView} from '@wanwu-v2/contracts/cloud';
import {parseRenderView,parseShareView,parsePage,parseWorkSummary,workEtag} from '@wanwu-v2/contracts/cloud';
import type {SavedWork,ComposeSettings} from '@wanwu-v2/contracts/work';
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import type {SoundSource} from '@wanwu-v2/contracts/sound';
import {CONFIRMATION_VERSION} from '@wanwu-v2/contracts/cloud';
import {CookieAccountClient,AccountError} from '../account/accountClient';
import type {ApiResult} from '../account/accountClient';
import {workSession} from '../creation/workSession';
import {sessionArchive} from '../creation/sourceArchive';
import {CloudMedia} from './cloudMedia';
import {initialCloudState,cloudError} from './cloudTypes';
import type {CloudState} from './cloudTypes';
import {attachCurrent,flushCurrent,checkedWork,requestContent,localContent,sameContent} from './workspacePersistence';
import {setAuthorizedSourceLoader} from '../audio/authorizedSource';

type Parked={record:WorkRecord|null;arrangement:Arrangement;settings:ComposeSettings;title:string;sources:SoundSource[]};
export class CloudWorkspace{
 readonly api:CookieAccountClient;readonly media:CloudMedia;
 state:CloudState={...initialCloudState};record:WorkRecord|null=null;suppress=false;
 private listeners=new Set<()=>void>();private timer:ReturnType<typeof setTimeout>|undefined;
 private serial:Promise<unknown>=Promise.resolve();private generation=0;private parked=new Map<string,Parked>();
 private pendingFlush:Promise<WorkRecord>|null=null;
 constructor(api:CookieAccountClient){
  this.api=api;this.media=new CloudMedia(api);workSession.subscribe(()=>{if(!this.suppress)this.schedule();});
  setAuthorizedSourceLoader(id=>this.state.accountId?this.media.load(id).then(result=>result.buffer):null);
 }
 getSnapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 update(change:Partial<CloudState>){this.state={...this.state,...change};for(const listener of this.listeners)listener();}
 setAccount(account:AccountView|null){
  const id=account?.id??null;if(id===this.state.accountId)return;
  const generation=++this.generation;clearTimeout(this.timer);this.pendingFlush=null;
  const current=workSession.current(),previous=this.state.accountId;
  const privateReset=!!previous&&(!!this.record||sessionArchive.ownedBy(previous));
  if(previous&&privateReset&&current){
   this.parked.set(previous,{record:this.record,arrangement:current,settings:workSession.settings(),title:this.state.title,sources:[...new Set(current.units.map(unit=>unit.sourceId))].flatMap(id=>{const source=workSession.source(id);return source?[source]:[];})});
  }
  if(previous&&privateReset){this.suppress=true;try{workSession.reset(true);}finally{this.suppress=false;}}
  this.record=null;this.api.setBusinessAccount(id);this.media.setAccount(id);sessionArchive.setAccount(id);
  this.update({...initialCloudState,accountId:id,epoch:this.state.epoch+(privateReset?1:0),recoverable:!!id&&this.parked.has(id),
   message:previous?'上一账号作品已暂停在本页内存，重新登录原账号可恢复；请勿刷新。':id?'当前本地创作尚未导入账号，请主动确认云端保存。':initialCloudState.message});
  if(id)void this.refreshDrafts().catch(error=>{if(generation===this.generation)this.failure(error);});
 }
 private failure(error:unknown){const conflict=error instanceof AccountError&&error.reason==='version-conflict';this.update({phase:conflict?'conflict':'error',conflictId:conflict?this.record?.id??workSession.current()?.id??null:null,message:cloudError(error)});}
 async run<T>(action:(guard:()=>void)=>Promise<T>){
  const generation=this.generation,guard=()=>{if(generation!==this.generation||!this.state.accountId)throw new AccountError('needs-account');};
  const next=this.serial.then(async()=>{guard();this.update({busy:true});try{return await action(guard);}catch(error){if(generation===this.generation)this.failure(error);throw error;}
   finally{if(generation===this.generation)this.update({busy:false});}});
  this.serial=next.catch(()=>{});return next;
 }
 schedule(){
  if(!this.record||!this.state.accountId||this.state.phase==='conflict'||this.suppress)return;
  clearTimeout(this.timer);this.update({phase:'saving',message:'改动待保存…'});
  this.timer=setTimeout(()=>{void this.flush().catch(()=>{});},1000);
 }
 attach(fork=false){return this.run(guard=>attachCurrent(this,guard,fork));}
 flush(){clearTimeout(this.timer);if(this.pendingFlush)return this.pendingFlush;
  const pending=this.run(guard=>flushCurrent(this,guard)).finally(()=>{if(this.pendingFlush===pending)this.pendingFlush=null;});this.pendingFlush=pending;return pending;
 }
 async refreshDrafts(){
  if(!this.state.accountId)return;const generation=this.generation,items:WorkSummary[]=[];let cursor:string|null=null;
  do{const response:ApiResult=await this.api.business(`/api/v1/works?owner=me&state=draft${cursor?`&cursor=${cursor}`:''}`);
   const page:{items:WorkSummary[];nextCursor:string|null}|null=parsePage(response.data,parseWorkSummary);if(!page)throw new AccountError('bad-response');
   if(generation!==this.generation)return;items.push(...page.items);cursor=page.nextCursor;
  }while(cursor&&items.length<1000);this.update({drafts:items});
 }
 async open(id:string){return this.run(async guard=>{
  const response=await this.api.business(`/api/v1/works/${encodeURIComponent(id)}`);guard();const record=checkedWork(response.data);
  const sources=await this.media.prepare(record.arrangement,message=>{guard();this.update({phase:'uploading',message});});guard();
  this.suppress=true;try{workSession.restoreDraft(record.arrangement,record.settings,[...sources.values()].map(view=>view.source));}finally{this.suppress=false;}
  this.record=record;this.update({workId:id,title:record.title,phase:'saved',message:'已打开云端草稿。',epoch:this.state.epoch+1,dialog:null,render:null,share:null});
  if(record.savedRevision)await this.refreshRender(record.savedRevision);
 });}
 recover(){const id=this.state.accountId,parked=id&&this.parked.get(id);if(!id||!parked)return;
  this.record=parked.record;this.suppress=true;try{workSession.restoreDraft(parked.arrangement,parked.settings,parked.sources);}finally{this.suppress=false;}
  this.parked.delete(id);this.update({workId:this.record?.id??null,title:parked.title,recoverable:false,epoch:this.state.epoch+1,message:this.record?'本页暂存已恢复，正在检查云端修订。':'本页暂存已恢复，请主动确认云端保存。'});this.schedule();
 }
 async formal(work:SavedWork){return this.run(async guard=>{
  if(workSession.current()?.id!==work.id)throw new AccountError('version-conflict');
  this.update({title:work.title});if(!this.record||this.record.id!==work.id)await attachCurrent(this,guard);
  await flushCurrent(this,guard);const content=localContent(work.title),record=this.record!;
  const result=await this.api.business<{work:unknown;render:unknown}>(`/api/v1/works/${encodeURIComponent(record.id)}`,'PUT',requestContent(content),workEtag(record.id,record.revision));guard();
  this.record=checkedWork(result.data.work);const render=parseRenderView(result.data.render);if(!render)throw new AccountError('bad-response');
  const clean=sameContent(localContent(this.state.title),this.record);
  this.update({phase:clean?'saved':'saving',message:clean?'作品已保存到账号书架，成品音频正在后台生成。':'本次修订已保存到书架；之后的本地修改仍待同步。',render,title:this.record.title});if(!clean)this.schedule();await this.refreshDrafts();return this.record;
 });}
 async rename(title:string){return this.run(async guard=>{
  if(!this.record)throw new Error('请先保存云端草稿。');
  this.update({title});
  const response=await this.api.business(`/api/v1/works/${encodeURIComponent(this.record.id)}`,'PATCH',{title},workEtag(this.record.id,this.record.revision));guard();
  this.record=checkedWork(response.data);const clean=sameContent(localContent(this.state.title),this.record);
  this.update({title:this.record.title,phase:clean?'saved':'saving',message:'作品名称已保存。'});if(!clean)this.schedule();await this.refreshDrafts();
 });}
 async freshDraft(){return this.run(async guard=>{
  if(this.record)await flushCurrent(this,guard);
  this.suppress=true;try{workSession.reset();}finally{this.suppress=false;}
  this.record=null;this.update({workId:null,title:'未命名草稿'});return attachCurrent(this,guard);
 });}
 async refreshRender(revision?:number):Promise<RenderView|null>{
  const record=this.record;if(!record||!record.savedRevision)return null;const generation=this.generation;
  const response=await this.api.business(`/api/v1/works/${encodeURIComponent(record.id)}/render?revision=${revision??record.savedRevision}`);
  if(generation!==this.generation||this.record?.id!==record.id)return null;const render=parseRenderView(response.data);if(!render)throw new AccountError('bad-response');
  this.update({render});return render;
 }
 async retryRender(){const record=this.record;if(!record?.savedRevision)return;
  await this.api.business(`/api/v1/works/${encodeURIComponent(record.id)}/render`,'POST',{revision:record.savedRevision});await this.refreshRender();
 }
 async refreshShare(){const record=this.record;if(!record)return;const generation=this.generation;
  const response=await this.api.business(`/api/v1/works/${encodeURIComponent(record.id)}/share`);if(generation!==this.generation||this.record?.id!==record.id)return;
  const share=parseShareView(response.data);if(!share)throw new AccountError('bad-response');this.update({share});
 }
 publish(){return this.run(async guard=>{
  const record=this.record;if(!record?.savedRevision)throw new Error('请先正式保存作品，再试听并确认分享。');
  const response=await this.api.business(`/api/v1/works/${encodeURIComponent(record.id)}/share`,'POST',{workRevision:record.savedRevision,confirmation:{listened:true,suitableForChildren:true,statementVersion:CONFIRMATION_VERSION}});guard();
  const share=parseShareView(response.data);if(!share)throw new AccountError('bad-response');this.update({share});
 });}
 revoke(){return this.run(async guard=>{if(!this.record)return;await this.api.business(`/api/v1/works/${encodeURIComponent(this.record.id)}/share`,'DELETE');guard();await this.refreshShare();});}
}
