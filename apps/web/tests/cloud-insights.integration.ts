// Bundled with the frontend's ESM resolution before Node runs these concurrency checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as tick} from 'node:timers/promises';
import {DEFAULT_COMPOSE_SETTINGS} from '@wanwu-v2/contracts/work';
import {SOUND_CONTRACT_VERSION} from '@wanwu-v2/contracts/sound';
import {workEtag} from '@wanwu-v2/contracts/cloud';
import type {WorkRecord} from '@wanwu-v2/contracts/cloud';
import {WORK_TALK_BRIEF_VERSION} from '@wanwu-v2/contracts/talk';
import {parseAccountUsage,parseWorkFacts} from '@wanwu-v2/contracts/cloud-status';
import type {WorkFacts} from '@wanwu-v2/contracts/cloud-status';
import {CookieAccountClient,AccountError} from '../src/shared/account/accountClient.ts';
import type {ApiMethod,ApiResult} from '../src/shared/account/accountClient.ts';
import {CloudWorkspace} from '../src/shared/cloud/cloudWorkspace.ts';
import {cloudTalkPolisher} from '../src/shared/cloud/cloudTalk.ts';
import {workSession} from '../src/shared/creation/workSession.ts';
import {localTalk,mergeTalk} from '../src/shared/talk/talkView.ts';

const now='2026-11-24T00:00:00.000Z',id='work:insights';
const record:WorkRecord={id,title:'测试草稿',revision:1,state:'draft',savedRevision:null,updatedAt:now,
 arrangement:{version:'arrangement-v1',id,rows:3,spanSeconds:30,mood:null,origin:'child',updatedAt:now,
 units:[{version:SOUND_CONTRACT_VERSION,id:'unit:one',sourceId:'source:one',name:'只留本地的名字',maker:null,markerIndex:0,shape:{},input:'manual',createdAt:now}],
 events:[{id:'event:one',unitId:'unit:one',at:0,row:0,clip:{startMs:0,endMs:1000}}]},settings:DEFAULT_COMPOSE_SETTINGS};
const facts:WorkFacts={version:'wanwu-facts-v1',provenance:'server-work',workId:id,revision:1,rules:{mix:'mix-v3'},renderer:'test-renderer',inputDigest:'a'.repeat(64),fieldSeconds:30,seconds:30,cutSeconds:35,
 events:[{eventId:'event:one',token:'声音1',start:0,end:1,seconds:1,clip:{startMs:0,endMs:1000},chosen:{},measured:null}],background:{enabled:true,instruments:[],volume:0.5},
 talkBrief:{version:WORK_TALK_BRIEF_VERSION,seconds:30,mood:null,textbookTitle:null,facts:[{kind:'single',name:'声音1'}]}};
const usage={reservedBytes:1024,pendingSources:0,pendingRenders:0,limits:{storageBytes:1024**3,pendingSources:5,pendingRenders:3,globalPending:50},accounting:'conservative-reservations'};
const result={workId:id,revision:1,inputDigest:facts.inputDigest,briefVersion:WORK_TALK_BRIEF_VERSION,reply:{lines:[{kind:'single',line:'「声音1」听起来很有意思。'}],tryThis:'再听一遍试试。'},model:'test-model',promptVersion:'work-talk-prompt-v1'};
const deferred=<T>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};};
class FakeApi extends CookieAccountClient{
 calls:{path:string;body:unknown;etag:string|undefined;signal:AbortSignal|undefined}[]=[];
 factsReply:()=>Promise<unknown>=async()=>structuredClone(facts);
 talkReply:()=>Promise<unknown>=async()=>structuredClone(result);
 usageReply:()=>Promise<unknown>=async()=>structuredClone(usage);
 override async business<T=unknown>(path:string,_method:ApiMethod='GET',body?:unknown,etag?:string,signal?:AbortSignal):Promise<ApiResult<T>>{
  this.calls.push({path,body,etag,signal});
  const data=path.includes('/facts?')?await this.factsReply():path.endsWith('/talk')?await this.talkReply():path==='/api/v1/account/usage'?await this.usageReply():path==='/api/v1/guest/status'?{language:true,music:false,audio:false}:{items:[],nextCursor:null};
  return {data:data as T,status:200,etag:path.includes('/facts?')?workEtag(id,1):null};
 }
}
async function settle(predicate:()=>boolean){for(let i=0;!predicate();i++){if(i>50)throw new Error('fixture did not settle');await tick();}}
async function setup(){
 workSession.reset(true);const api=new FakeApi(),workspace=new CloudWorkspace(api);
 workspace.setAccount({id:'account-a',username:'teacher',nickname:'老师',role:'teacher',status:'active'});
 await settle(()=>workspace.state.usagePhase==='ready'&&workspace.state.languageAvailable);
 assert.equal(workSession.restoreDraft(structuredClone(record.arrangement),structuredClone(record.settings),[]),true);
 workspace.record=structuredClone(record);workspace.update({title:record.title,workId:id,phase:'saved'});
 await settle(()=>workspace.state.factsPhase==='ready');return {api,workspace};
}
test('read contracts reject forged provenance, unsupported accounting, duplicate events and malformed timelines',()=>{
 assert.ok(parseAccountUsage(usage));assert.equal(parseAccountUsage({...usage,accounting:'oss-bill'}),null);
 assert.equal(parseAccountUsage({...usage,reservedBytes:-1}),null);assert.ok(parseWorkFacts(facts));
 for(const bad of [{...facts,provenance:'browser'},{...facts,revision:0},{...facts,events:[facts.events[0],facts.events[0]]},{...facts,events:[{...facts.events[0],end:2}]}])assert.equal(parseWorkFacts(bad),null);
});
test('saved facts use an explicit revision and ETag; corpus and AI use the server brief with names restored locally',async()=>{
 const {api,workspace:w}=await setup();try{
  assert.ok(api.calls.some(c=>c.path.endsWith('/facts?revision=1')));assert.equal(w.state.usage?.reservedBytes,1024);
  const polisher=cloudTalkPolisher(w);assert.equal(polisher.open,true);const basis=polisher.basis!;
  const local=localTalk(record.arrangement,null,{kind:'none'},null,basis);
  assert.equal(local.discoveries[0]?.line.includes('只留本地的名字'),true);
  const reply=await polisher.workTalk(basis.brief,new AbortController().signal);assert.deepEqual(reply,result.reply);
  const sent=api.calls.find(c=>c.path.endsWith('/talk'))!;
  assert.deepEqual(sent.body,{revision:1,inputDigest:facts.inputDigest});assert.equal(sent.etag,workEtag(id,1));assert.equal(JSON.stringify(sent).includes('只留本地的名字'),false);
  await polisher.workTalk(basis.brief,new AbortController().signal);assert.equal(api.calls.filter(c=>c.path.endsWith('/talk')).length,1);
 }finally{w.dispose();workSession.reset(true);}
});
test('editing immediately clears the facts binding and discards an already running AI result',async()=>{
 const {api,workspace:w}=await setup();try{
  const pending=deferred<unknown>();api.talkReply=()=>pending.promise;
  const p=w.insights.workTalk(new AbortController().signal);await tick();
  const changed={...record.arrangement,events:[{...record.arrangement.events[0]!,at:0.2}],updatedAt:now};workSession.save(changed);
  assert.equal(w.state.facts,null);assert.equal(cloudTalkPolisher(w).open,false);assert.equal(api.calls.find(c=>c.path.endsWith('/talk'))?.signal?.aborted,true);
  pending.resolve(result);assert.equal(await p,null);assert.equal(w.state.talkMessage,'');assert.equal(workSession.current()?.events[0]?.at,0.2);
 }finally{w.dispose();workSession.reset(true);}
});
test('a late facts read cannot replace editing or authorize a new revision',async()=>{
 const {api,workspace:w}=await setup();try{
  const pending=deferred<unknown>();api.factsReply=()=>pending.promise;const p=w.insights.refreshFacts();await tick();
  workSession.save({...record.arrangement,spanSeconds:45});pending.resolve(facts);await p;
  assert.equal(w.state.facts,null);assert.equal(workSession.current()?.spanSeconds,45);assert.equal(w.insights.basis(),null);
 }finally{w.dispose();workSession.reset(true);}
});
test('switching account clears facts and usage and rejects old account responses',async()=>{
 const {api,workspace:w}=await setup();try{
  const pending=deferred<unknown>();api.usageReply=()=>pending.promise;
  await settle(()=>w.state.usagePhase!=='loading');const p=w.insights.refreshUsage();await tick();
  w.setAccount(null);assert.equal(w.state.facts,null);assert.equal(w.state.usage,null);
  pending.resolve(usage);await p;assert.equal(w.state.usage,null);assert.equal(w.state.accountId,null);assert.equal(w.insights.basis(),null);
 }finally{w.dispose();workSession.reset(true);}
});
test('another device revision produces a visible conflict without overwriting local work',async()=>{
 const {api,workspace:w}=await setup();try{
  api.factsReply=async()=>({...facts,revision:2});await w.insights.refreshFacts();
  assert.equal(w.state.phase,'conflict');assert.equal(w.state.facts,null);assert.equal(workSession.current()?.id,id);assert.equal(w.record?.revision,1);
 }finally{w.dispose();workSession.reset(true);}
});
test('malformed or wrong-version AI results stay local rather than appearing as AI success',async()=>{
 const {api,workspace:w}=await setup();try{
  api.talkReply=async()=>({...result,inputDigest:'b'.repeat(64)});
  assert.equal(await w.insights.workTalk(new AbortController().signal),null);
  const local=localTalk(record.arrangement,null,{kind:'none'},null);assert.equal(mergeTalk(local,null,false).origin.work,'local');
 }finally{w.dispose();workSession.reset(true);}
});
test('an aborted request waiting behind the Cookie lane never reaches the server',async()=>{
 const held=deferred<Response>(),calls:string[]=[];
 const api=new CookieAccountClient(async path=>{calls.push(path);return path.endsWith('/usage')?held.promise:new Response('{}',{headers:{'Content-Type':'application/json'}});});
 api.setBusinessAccount('a');const first=api.business('/api/v1/account/usage');await tick();
 const controller=new AbortController(),second=api.business('/api/v1/works/work%3Aa/facts?revision=1','GET',undefined,undefined,controller.signal);
 controller.abort();held.resolve(new Response('{}',{headers:{'Content-Type':'application/json'}}));await first;
 await assert.rejects(second,(e:unknown)=>e instanceof AccountError&&e.reason==='cancelled');assert.deepEqual(calls,['/api/v1/account/usage']);
});
test('a queued read from a previous account cannot invalidate the newly selected account',async()=>{
 const held=deferred<Response>(),calls:string[]=[];let invalidations=0;
 const api=new CookieAccountClient(async path=>{calls.push(path);return calls.length===1?held.promise:new Response('{}',{headers:{'Content-Type':'application/json'}});});
 api.onSessionInvalidation(()=>invalidations++);api.setBusinessAccount('account-a');
 const first=api.business('/api/v1/account/usage');await tick();
 const old=api.business('/api/v1/works/work%3Aa/facts?revision=1');
 api.setBusinessAccount('account-b');held.resolve(new Response('{}',{headers:{'Content-Type':'application/json'}}));await first;
 await assert.rejects(old,(e:unknown)=>e instanceof AccountError&&e.reason==='needs-account');await tick();
 assert.equal(invalidations,0);assert.equal(calls.length,1);
 await api.business('/api/v1/account/usage');assert.equal(calls.length,2);
});
