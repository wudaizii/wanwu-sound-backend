import test from 'node:test';
import assert from 'node:assert/strict';
import {ARRANGEMENT_CONTRACT_VERSION,DEFAULT_ROWS} from '@wanwu-v2/contracts/arrangement';
import type {Arrangement,PlacedEvent} from '@wanwu-v2/contracts/arrangement';
import {SOUND_CONTRACT_VERSION} from '@wanwu-v2/contracts/sound';
import type {SoundUnitDraft} from '@wanwu-v2/contracts/sound';
import {isTextbookTalkBrief,isWorkTalkBrief} from '@wanwu-v2/contracts/talk';
import type {TextbookTalkBrief,WorkTalkBrief} from '@wanwu-v2/contracts/talk';
import {backgroundPlan} from '@wanwu-v2/sound-rules/background';
import {backgroundInput} from '../src/shared/background/backgroundLayer.ts';
import {offlineTalkPolisher} from '../src/shared/talk/polisher.ts';
import type {TalkPolisher} from '../src/shared/talk/polisher.ts';
import {localTalk,mergeTalk,polishTalk} from '../src/shared/talk/talkView.ts';
import {exampleTracks} from '../src/mocks/exampleTracks.ts';
import {parseRoute,routeHref} from '../src/app/router.ts';

const now='2026-10-24T08:00:00.000Z';
const unit=(id:string,markerIndex:number,name:string):SoundUnitDraft=>({version:SOUND_CONTRACT_VERSION,id,sourceId:`recording:${id}`,name,maker:null,markerIndex,
 shape:{pitch:'mid',duration:'short',contour:'flat',intensity:'soft',pattern:'once'},input:'manual',createdAt:now});
const ev=(id:string,at:number,seconds:number,unitId:string):PlacedEvent=>({id,unitId,at,row:0,clip:{startMs:0,endMs:Math.round(seconds*1000)}});
/** Sound names a child might type: they must never leave the device. */
const piece:Arrangement={version:ARRANGEMENT_CONTRACT_VERSION,id:'work:talk',rows:DEFAULT_ROWS,spanSeconds:30,mood:{kind:'preset',id:'calm'},origin:'child',updatedAt:now,
 units:[unit('u1',0,'小林家的狗'),unit('u2',1,'王老师的铃')],
 events:[ev('a',0,2,'u1'),ev('b',.3,1,'u2'),ev('c',.6,2,'u1')]};
const lullaby=exampleTracks.find(track=>track.id==='tb:mock:lullaby')!;
const inspiration={kind:'textbook' as const,entryId:lullaby.id,variation:'lower' as const};
const plan=backgroundPlan(backgroundInput(piece,inspiration,exampleTracks));
const local=localTalk(piece,lullaby,inspiration,plan);

test('talk: the corpus speaks at once; the briefs carry numbered sounds, never the names a child typed',()=>{
 assert.deepEqual(local.facts.map(fact=>fact.kind),['opening','repeat','echo','rest','ending']);
 assert.equal(local.discoveries[1]!.line,'「小林家的狗」出现了 2 次，像在重复一句歌词。');
 assert.ok(local.tryThis);assert.ok(local.textbook);
 assert.ok(isWorkTalkBrief(local.work!.brief));assert.ok(isTextbookTalkBrief(local.textbook!.briefed.brief));
 const sent=JSON.stringify([local.work!.brief,local.textbook!.briefed.brief]);
 assert.ok(!sent.includes('小林')&&!sent.includes('王老师'),sent);
 assert.deepEqual(local.work!.names,['小林家的狗','王老师的铃']);
 assert.equal(local.work!.brief.mood,'calm');assert.equal(local.work!.brief.textbookTitle,'摇篮曲');
 const shown=mergeTalk(local,null,false);
 assert.deepEqual(shown.origin,{work:'local',textbook:'local'});assert.equal(shown.polishOpen,false);
 assert.deepEqual(shown.discoveries,local.discoveries);
});

test('talk: nothing is sent while the polisher is closed; a slow or failing one counts as no answer',async()=>{
 assert.equal(await polishTalk(local,offlineTalkPolisher,new AbortController().signal),null);
 const slow:TalkPolisher={open:true,workTalk:()=>new Promise(()=>{}),textbookTalk:async()=>{throw new Error('500');}};
 assert.deepEqual(await polishTalk(local,slow,new AbortController().signal,20),{work:null,textbook:null});
});

test('talk: accepted AI lines replace corpus lines one by one, with the names put back; the rest stays corpus',async()=>{
 let asked:WorkTalkBrief|null=null,askedSong:TextbookTalkBrief|null=null;
 const polisher:TalkPolisher={open:true,
  async workTalk(brief){asked=brief;return {lines:[
   {kind:'opening',line:'「声音1」先来，「声音2」跟上。'},
   {kind:'repeat',line:'「声音1」响了 5 次。'},
   {kind:'echo',line:'「声音1」问，「声音2」答，像打电话。'},
  ],tryThis:'把「声音2」挪到最后，听听结尾变了没有。'};},
  async textbookTalk(brief){askedSong=brief;return {...brief.local,feature:'「摇篮曲」三拍子，一晃一晃的。'};},
 };
 const polished=await polishTalk(local,polisher,new AbortController().signal);
 assert.ok(asked&&askedSong);
 const shown=mergeTalk(local,polished,true);
 assert.equal(shown.discoveries[0]!.line,'「小林家的狗」先来，「王老师的铃」跟上。');
 assert.equal(shown.discoveries[1]!.line,local.discoveries[1]!.line,'5 is not a counted number: corpus line');
 assert.equal(shown.discoveries[2]!.line,'「小林家的狗」问，「王老师的铃」答，像打电话。');
 assert.equal(shown.discoveries[4]!.line,local.discoveries[4]!.line,'missing line: corpus line');
 assert.equal(shown.discoveries[0]!.explain,local.discoveries[0]!.explain,'the teacher explanation is always corpus');
 assert.equal(shown.tryThis,'把「王老师的铃」挪到最后，听听结尾变了没有。');
 assert.equal(shown.textbook!.feature,'「摇篮曲」三拍子，一晃一晃的。');
 assert.deepEqual(shown.origin,{work:'ai',textbook:'ai'});
});

test('the prompt lab has its own address next to the tuning lab',()=>{
 assert.deepEqual(parseRoute('/lab/prompts/'),{page:'lab-prompts'});
 assert.equal(routeHref({page:'lab-prompts'}),'/lab/prompts');
 assert.deepEqual(parseRoute('/lab/sound-rules'),{page:'lab'});
});

test('课本灵感 opens on the same page everywhere: teaching music, the chosen song, or 帮我找找 when there is something to compare',async()=>{
 const {openingTab}=await import('../src/shared/inspiration/tabs.ts');
 assert.equal(openingTab({kind:'teaching-music',musicId:'m',name:'歌',durationMs:1000},true),'upload');
 assert.equal(openingTab({kind:'textbook',entryId:'tb:mock:lullaby'},true),'examples');
 assert.equal(openingTab({kind:'none'},true),'match');
 assert.equal(openingTab({kind:'none'},false),'examples');
});

test('the sound library is one source: 声音诞生 and 万物声场 list the same examples',async()=>{
 const {bundledSoundLibrary}=await import('../src/shared/creation/soundLibrary.ts');
 const {mockSoundWorldRepository}=await import('../src/mocks/soundWorldRepository.ts');
 const {exampleLibraryItem}=await import('../src/pages/sound-birth/services/soundLibrary.ts');
 const {examples}=await bundledSoundLibrary.list();
 const world=await mockSoundWorldRepository.scope('example');
 assert.equal(world.status,'ready');
 if(world.status==='ready')assert.deepEqual(world.units.map(unit=>unit.sourceId),examples.map(example=>exampleLibraryItem(example).source.id));
 assert.ok(examples.length>=8);
});
