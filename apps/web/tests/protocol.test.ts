// Protocol v0.4 shapes: uploaded sources and library entries, and a work's share status.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ARRANGEMENT_CONTRACT_VERSION} from '@wanwu-v2/contracts/arrangement';
import {SOUND_SOURCE_MAX_MS,SOUND_SOURCE_SLACK_MS,isSoundSource,parseSourceEntry} from '@wanwu-v2/contracts/sound';
import type {SoundSource} from '@wanwu-v2/contracts/sound';
import {DEFAULT_COMPOSE_SETTINGS,WORK_CONTRACT_VERSION,isWorkShare,parseSavedWork} from '@wanwu-v2/contracts/work';
import type {SavedWork} from '@wanwu-v2/contracts/work';
import {RULE_VERSIONS} from '@wanwu-v2/sound-rules/rules';
import {exampleSounds} from '../src/shared/creation/exampleSounds.ts';
import {WorkShelf} from '../src/mocks/workShelf.ts';

const uploaded:SoundSource={id:'recording:7f3a',kind:'uploaded',label:'后山的风',durationMs:12_000,mimeType:'audio/webm;codecs=opus',
 provenance:{recordedBy:'小林',recordedOn:'2026-10-20',place:'后山',group:'秋游',provenanceUrl:null}};

test('an uploaded source is a source; a recording may run past the limit only by the slack',()=>{
 assert.ok(isSoundSource(uploaded));
 assert.ok(isSoundSource({...uploaded,durationMs:SOUND_SOURCE_MAX_MS+SOUND_SOURCE_SLACK_MS}));
 assert.equal(isSoundSource({...uploaded,durationMs:SOUND_SOURCE_MAX_MS+SOUND_SOURCE_SLACK_MS+1}),false,'longer than 45 s');
 assert.ok(isSoundSource({...uploaded,kind:'example',durationMs:90_000}),'bundled examples are whole recordings');
 assert.equal(isSoundSource({...uploaded,kind:'cloud'}),false,'unknown kind');
 assert.equal(isSoundSource({...uploaded,mimeType:'video/mp4'}),false,'not audio');
 assert.equal(isSoundSource({...uploaded,provenance:{...uploaded.provenance,place:3}}),false,'provenance is text or null');
});

test('a library entry carries the source, a playable https or same-site url, and its 声音体检',()=>{
 const analysis=exampleSounds[0]!.analysis;
 const entry={source:uploaded,url:'https://cdn.example.org/sources/recording-7f3a.mp3',analysis};
 assert.deepEqual(parseSourceEntry(entry),entry);
 assert.ok(parseSourceEntry({...entry,url:'/media/sounds/library/bird.mp3'}));
 for(const url of ['http://cdn.example.org/a.mp3','//cdn.example.org/a.mp3','blob:abc',''])assert.equal(parseSourceEntry({...entry,url}),null,url);
 assert.equal(parseSourceEntry({...entry,analysis:{}}),null,'no analysis');
});

const work=(change:Partial<SavedWork>={}):SavedWork=>({version:WORK_CONTRACT_VERSION,id:'work:p1',title:'风的歌',
 arrangement:{version:ARRANGEMENT_CONTRACT_VERSION,id:'work:p1',units:[],events:[],rows:3,spanSeconds:30,mood:null,origin:'child',updatedAt:'2026-10-24T08:00:00.000Z'},
 settings:DEFAULT_COMPOSE_SETTINGS,rendering:{background:'local-rules',prompt:null,rules:{...RULE_VERSIONS}},
 visibility:'private',share:null,savedAt:'2026-10-24T08:00:00.000Z',...change});

test('a saved work says where its sharing stands; only an approved share has a link',()=>{
 assert.ok(parseSavedWork(work()));
 assert.ok(parseSavedWork(work({visibility:'class',share:{status:'pending-review',url:null}})));
 assert.ok(parseSavedWork(work({visibility:'class',share:{status:'approved',url:'https://example.org/w/p1'}})));
 assert.equal(isWorkShare({status:'approved',url:null}),false,'approved without a link');
 assert.equal(isWorkShare({status:'pending-review',url:'https://example.org/w/p1'}),false,'a link before review');
 assert.equal(isWorkShare({status:'approved',url:'http://example.org/w/p1'}),false,'https only');
 assert.equal(parseSavedWork({...work(),share:undefined}),null,'the field must be there');
});

test('the shelf keeps a share status as saved',()=>{
 const shelf=new WorkShelf(),shared=work({visibility:'class',share:{status:'pending-review',url:null}});
 assert.ok(shelf.put(shared));
 assert.deepEqual(shelf.rename('work:p1','  雨的歌 ')?.share,shared.share,'a new name keeps it');
});
