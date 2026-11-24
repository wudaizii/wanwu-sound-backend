import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DEFAULT_COMPOSE_SETTINGS} from '@wanwu-v2/contracts/work';
import {uploadRequest,workContent,parseWorkSummary,parsePage,parsePublishedWork,confirmed,CONFIRMATION_VERSION} from '@wanwu-v2/contracts/cloud';
import {SessionSourceArchive} from '../src/shared/creation/sourceArchive.ts';
import type {SoundSource} from '@wanwu-v2/contracts/sound';

const source:SoundSource={id:`file:${randomUUID()}`,kind:'local-file',label:'声音',durationMs:1000,mimeType:'audio/wav',provenance:{recordedBy:'小林',recordedOn:'2026-10-25',place:'校园',group:null,provenanceUrl:null}};
const input={source,bytes:1000,checksum:'a'.repeat(64)};
test('cloud upload contracts bound exact identity, provenance, MIME hints and real calendar dates',()=>{
 for(const mimeType of ['audio/wav','audio/webm;codecs=opus','video/mp4','application/octet-stream'])assert.ok(uploadRequest({...input,source:{...source,mimeType}}));
 for(const patch of [{bytes:20*1024*1024+1},{checksum:'no'},{ownerId:randomUUID()},{source:{...source,kind:'example'}},{source:{...source,mimeType:'text/html'}},
  {source:{...source,provenance:{...source.provenance,recordedOn:'2026-02-30'}}},{source:{...source,provenance:{...source.provenance,place:null}}}])assert.equal(uploadRequest({...input,...patch}),null);
 assert.equal(uploadRequest({...input,selection:{startMs:0,endMs:45_001}}),null);assert.ok(uploadRequest({...input,selection:{startMs:1000,endMs:2000}}));
});
test('work and publication projections reject management metadata and unconfirmed statements',()=>{
 const id=`work:${randomUUID()}`,value={id,title:'作品',arrangement:{version:'arrangement-v1',id,units:[],events:[],rows:3,spanSeconds:30,mood:null,origin:'child',updatedAt:new Date().toISOString()},settings:DEFAULT_COMPOSE_SETTINGS};
 assert.ok(workContent(value));assert.equal(workContent({...value,ownerId:'forged'}),null);
 const summary={id,title:'作品',revision:1,state:'draft',savedRevision:null,updatedAt:new Date().toISOString()};
 assert.ok(parseWorkSummary(summary));assert.ok(parsePage({items:[summary],nextCursor:null},parseWorkSummary));assert.equal(parsePage({items:[{...summary,ownerId:'forged'}],nextCursor:null},parseWorkSummary),null);
 const view={title:'作品',publishedAt:new Date().toISOString(),audio:{durationMs:1000,playback:{url:'https://example.invalid/audio',expiresAt:new Date(Date.now()+60_000).toISOString()}}};
 assert.ok(parsePublishedWork(view));assert.equal(parsePublishedWork({...view,rawSourceUrl:'https://example.invalid/private'}),null);
 assert.equal(confirmed({listened:true,suitableForChildren:true,statementVersion:CONFIRMATION_VERSION,confirmedBy:'forged'}),false);
});
test('guest originals remain local; newly captured account originals are hidden from other accounts without being deleted',()=>{
 const archive=new SessionSourceArchive(),buffer={} as AudioBuffer,guest=new Blob(['guest']),owned=new Blob(['owned']);
 archive.save(source,buffer,{blob:guest});archive.setAccount('alice');assert.equal(archive.original(source.id)?.blob,guest);
 const captured={...source,id:`recording:${randomUUID()}`};archive.save(captured,buffer,{blob:owned});
 archive.setAccount('bob');assert.equal(archive.original(captured.id),null);assert.equal(archive.buffer(captured.id),null);assert.equal(archive.original(source.id)?.blob,guest);
 archive.setAccount('alice');assert.equal(archive.original(captured.id)?.blob,owned);assert.throws(()=>archive.save(captured,buffer,{blob:new Blob(['replacement'])}));
});
