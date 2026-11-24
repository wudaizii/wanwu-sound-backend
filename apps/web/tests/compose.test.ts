import test from 'node:test';
import assert from 'node:assert/strict';
import {ARRANGEMENT_CONTRACT_VERSION,DEFAULT_ROWS,DEFAULT_SPAN_SECONDS} from '@wanwu-v2/contracts/arrangement';
import type {Arrangement,PlacedEvent} from '@wanwu-v2/contracts/arrangement';
import {SOUND_CONTRACT_VERSION} from '@wanwu-v2/contracts/sound';
import type {SoundUnitDraft} from '@wanwu-v2/contracts/sound';
import {DEFAULT_COMPOSE_SETTINGS,MAX_INSTRUMENTS,WORK_CONTRACT_VERSION,cleanWorkTitle,isValidInspiration,parseComposeSettings,parseSavedWork} from '@wanwu-v2/contracts/work';
import {pieceSeconds,planPlayback,withSpan} from '../src/shared/creation/arrangementTiming.ts';
import {WorkSession} from '../src/shared/creation/workSession.ts';
import {WorkShelf} from '../src/mocks/workShelf.ts';
import {clockText,scoreLayout,scorePosition,secondsAt,soundingAt,spanChoices} from '../src/pages/compose/model/scoreLayout.ts';
import {composeReducer,initialCompose,isShelved,shelfEntry} from '../src/pages/compose/model/composeState.ts';
import type {ComposeState} from '../src/pages/compose/model/composeState.ts';
import {findDiscoveries} from '../src/shared/talk/discoveries.ts';
import {backgroundPlan} from '@wanwu-v2/sound-rules/background';
import {RULE_VERSIONS} from '@wanwu-v2/sound-rules/rules';
import {isBackgroundBrief,parseBackgroundResult} from '@wanwu-v2/contracts/background';
import {backgroundBrief,backgroundInput} from '../src/shared/background/backgroundLayer.ts';
import {offlineBackgroundGenerator,runBackgroundChain} from '../src/shared/background/generator.ts';
import type {BackgroundGenerator} from '../src/shared/background/generator.ts';
import {exampleTracks} from '../src/mocks/exampleTracks.ts';
import {inspirationMatches} from '../src/shared/inspiration/matches.ts';
import {rhythmWords,songFeature,textbookTalk} from '../src/shared/inspiration/talk.ts';
import {isTextbookTrack} from '@wanwu-v2/contracts/textbook';
import {parseRoute,routeHref} from '../src/app/router.ts';
import {previewNotes} from '../src/shared/inspiration/rhythmPreview.ts';

const now=new Date('2026-10-23T08:00:00.000Z');
const rendering={background:'local-rules' as const,prompt:null,rules:{...RULE_VERSIONS}};
const once={pitch:'mid',duration:'short',contour:'flat',intensity:'soft',pattern:'once'} as const;
const unit=(id:string,markerIndex:number,name=id):SoundUnitDraft=>({version:SOUND_CONTRACT_VERSION,id,sourceId:`recording:${id}`,name,maker:null,markerIndex,
 shape:{...once},input:'manual',createdAt:now.toISOString()});
/** Pattern once + pitch mid: heard length = excerpt length. */
const ev=(id:string,at:number,row:number,seconds:number,unitId='u1'):PlacedEvent=>({id,unitId,at,row,clip:{startMs:0,endMs:Math.round(seconds*1000)}});
const work=(over:Partial<Arrangement>={}):Arrangement=>({version:ARRANGEMENT_CONTRACT_VERSION,id:'work:1',units:[unit('u1',0,'蛙鸣'),unit('u2',1,'滴水')],
 events:[ev('a',0,0,3),ev('b',.5,1,2,'u2'),ev('c',.8,2,3)],rows:DEFAULT_ROWS,spanSeconds:DEFAULT_SPAN_SECONDS,mood:null,origin:'child',updatedAt:now.toISOString(),...over});
const loaded=(arrangement:Arrangement):ComposeState=>composeReducer(initialCompose,{type:'loaded',arrangement,settings:DEFAULT_COMPOSE_SETTINGS,shelved:null});

test('the score is derived from the field arrangement: same order, start times, rows and repeats as playback',()=>{
 const arrangement=work(),layout=scoreLayout(arrangement),plan=planPlayback(arrangement);
 assert.deepEqual(layout.items.map(item=>item.eventId),plan.map(item=>item.eventId));
 assert.deepEqual(layout.items.map(item=>item.start),plan.map(item=>item.startSeconds));
 assert.deepEqual(layout.items.map(item=>item.row),[0,1,2],'rows come from the field (layout only)');
 assert.equal(layout.items.filter(item=>item.unit.id==='u1').length,2,'repeats stay repeats, with one identity');
 assert.deepEqual(layout.legend.map(item=>item.markerIndex),[0,1]);
 assert.equal(layout.totalSeconds,30);assert.equal(layout.spanMark,null);
 assert.deepEqual(layout.ticks.map(tick=>tick.seconds),[0,10,20,30]);
});

test('a sound outlasting the chosen length makes the piece longer, marked — never cut',()=>{
 const arrangement=work({events:[ev('a',.9,0,6)]});
 assert.equal(pieceSeconds(arrangement),33);
 const layout=scoreLayout(arrangement);
 assert.equal(layout.totalSeconds,33);assert.equal(layout.spanMark,30/33);
 assert.deepEqual(spanChoices(arrangement).map(choice=>[choice.seconds,choice.real]),[[20,24],[30,33],[45,46.5]]);
});

test('playhead, progress bar and highlights share one time: positions invert, sounding follows start/end',()=>{
 const layout=scoreLayout(work()),box={left:100,width:1000};
 for(const seconds of [0,7.5,15,30]){
  const left=parseFloat(scorePosition(seconds/layout.totalSeconds))/100*box.width+box.left;
  assert.ok(Math.abs(secondsAt(box,left,layout.totalSeconds)-seconds)<1e-9);
 }
 assert.deepEqual([...soundingAt(layout.items,1)],['a']);
 assert.deepEqual([...soundingAt(layout.items,3)],[],'an end is exclusive');
 assert.deepEqual([...soundingAt(layout.items,16)],['b']);
 assert.equal(clockText(15.9),'00:15');assert.equal(clockText(75),'01:15');
});

test('switching length in 万物成曲 is the field’s switch: every sound keeps its position, only rows re-tidy',()=>{
 const crowded=work({events:[ev('a',0,0,8),ev('b',.3,0,2,'u2')],spanSeconds:45});
 const state=composeReducer(loaded({...crowded,origin:'example'}),{type:'span',spanSeconds:20,now});
 const next=state.arrangement!;
 assert.equal(next.spanSeconds,20);assert.equal(next.origin,'child');
 assert.deepEqual(next.events.map(event=>event.at),[0,.3]);
 assert.deepEqual(next,{...withSpan(crowded,20),origin:'child',updatedAt:now.toISOString()});
 assert.notEqual(next.events[0]!.row,next.events[1]!.row,'a longer tail moves the later sound to a free row');
});

test('background and textbook inspiration never touch the child’s sounds or placement',()=>{
 let state=loaded(work());
 const before=state.arrangement;
 state=composeReducer(state,{type:'background-enabled',enabled:false});
 state=composeReducer(state,{type:'background-volume',volume:1.4});
 state=composeReducer(state,{type:'instrument',id:'inst:local:xylophone'});
 state=composeReducer(state,{type:'inspiration',inspiration:{kind:'textbook',entryId:'tb:mock:march'}});
 assert.equal(state.arrangement,before);
 assert.deepEqual(state.settings,{background:{enabled:true,instruments:['inst:local:xylophone'],volume:1},inspiration:{kind:'textbook',entryId:'tb:mock:march'}});
 assert.ok(parseComposeSettings(state.settings));
 assert.equal(parseComposeSettings({...state.settings,background:{...state.settings.background,volume:2}}),null);
});

test('saving puts an exact snapshot on the shelf; any later change shows as not saved',()=>{
 let state=loaded(work());
 assert.equal(shelfEntry(state,'   ',now,rendering),null);
 const entry=shelfEntry(state,'  青蛙  下雨歌 ',now,rendering)!;
 assert.equal(entry.title,'青蛙 下雨歌');assert.equal(entry.visibility,'private');assert.equal(entry.arrangement,state.arrangement);
 assert.ok(parseSavedWork(entry));
 assert.equal(parseSavedWork({...entry,visibility:'everyone'}),null);
 assert.equal(parseSavedWork({...entry,id:'other'}),null,'the work id is the arrangement id');
 assert.deepEqual(entry.rendering,rendering,'it records the background kept and every rule version');
 assert.equal(parseSavedWork({...entry,rendering:{...rendering,background:'magic'}}),null);
 assert.equal(parseSavedWork({...entry,rendering:{background:'local-rules',prompt:null,rules:{...RULE_VERSIONS,mix:''}}}),null);
 assert.equal(parseSavedWork({...entry,rendering:{...rendering,background:'notes-ai'}}),null,'an AI background names its prompt version');
 assert.ok(parseSavedWork({...entry,rendering:{...rendering,background:'notes-ai',prompt:'background-notes-prompt-v1'}}));
 assert.equal(parseSavedWork({...entry,rendering:{...rendering,prompt:'background-notes-prompt-v1'}}),null,'the local background has no prompt');
 assert.equal(cleanWorkTitle('一二三四五六七八九十一二三四五六七'),'一二三四五六七八九十一二三四五六');
 state=composeReducer(state,{type:'saved',work:entry});
 assert.equal(isShelved(state),true);
 assert.equal(isShelved(composeReducer(state,{type:'background-enabled',enabled:false})),false);
 assert.equal(isShelved(composeReducer(state,{type:'span',spanSeconds:45,now:new Date('2026-10-23T09:00:00.000Z')})),false);
});

test('the shelf keeps this visit’s works newest first and replaces a re-saved one; the session reopens and resets',()=>{
 const shelf=new WorkShelf(),first=shelfEntry(loaded(work()),'一',now,rendering)!,second=shelfEntry(loaded(work({id:'work:2'})),'二',now,rendering)!;
 assert.equal(shelf.put(first),true);assert.equal(shelf.put(second),true);
 assert.deepEqual(shelf.list().map(item=>item.title),['二','一']);
 shelf.put({...first,title:'一改'});
 assert.deepEqual(shelf.list().map(item=>item.title),['一改','二']);
 assert.equal(shelf.put({...first,title:''}),false);
 const session=new WorkSession();
 session.open({...second,settings:{...DEFAULT_COMPOSE_SETTINGS,inspiration:{kind:'textbook',entryId:'tb:mock:train'}}});
 assert.equal(session.current()!.id,'work:2');assert.equal(session.settings().inspiration.kind,'textbook');
 assert.equal(session.saveSettings({...DEFAULT_COMPOSE_SETTINGS,background:{enabled:true,instruments:[''],volume:.5}}),false);
 session.reset();
 assert.equal(session.current(),null);assert.deepEqual(session.settings(),DEFAULT_COMPOSE_SETTINGS);
});

test('音乐小发现 states only facts counted from the arrangement',()=>{
 const found=findDiscoveries(work({events:[ev('a',0,0,3),ev('b',.05,1,2,'u2'),ev('c',.8,2,3)]}));
 assert.deepEqual(found[0],{kind:'opening',first:'蛙鸣',next:'滴水'});
 assert.ok(found.some(item=>item.kind==='repeat'&&item.times===2));
 assert.ok(found.some(item=>item.kind==='echo'&&item.a==='蛙鸣'&&item.b==='滴水'),'A → B → A is call and answer');
 assert.ok(found.some(item=>item.kind==='together'&&item.a==='蛙鸣'&&item.b==='滴水'));
 assert.ok(found.some(item=>item.kind==='rest'&&item.seconds===20));
 assert.deepEqual(found.at(-1),{kind:'ending',name:'蛙鸣',same:true},'starts and ends with the same sound');
 const longShort=findDiscoveries(work({events:[ev('a',0,0,8),ev('b',.5,0,1,'u2')]}));
 assert.ok(longShort.some(item=>item.kind==='long-short'&&item.long==='蛙鸣'&&item.short==='滴水'));
 assert.ok(!longShort.some(item=>item.kind==='echo'));
 assert.deepEqual(findDiscoveries(work({events:[ev('a',.2,0,1)]})),[{kind:'single',name:'蛙鸣'}]);
 assert.deepEqual(findDiscoveries(work({events:[]})),[]);
});

test('the local background is made from the work: its length, when its sounds play, its mood and the chosen song',()=>{
 const piece=work({events:[ev('a',0,0,4),ev('b',.5,0,3)],mood:{kind:'custom',text:'像打雷',nearest:'angry'}});
 const input=backgroundInput(piece,{kind:'none'},exampleTracks);
 assert.equal(input.seconds,pieceSeconds(piece));
 assert.deepEqual(input.sounding,[{start:0,end:4},{start:15,end:18}],'the same times the score and the playback use');
 assert.equal(input.mood,'angry','a custom mood uses the nearest preset');
 assert.equal(input.seed,piece.id);
 const borrowed=backgroundInput(piece,{kind:'textbook',entryId:'tb:mock:lullaby'},exampleTracks);
 assert.equal(borrowed.textbook?.id,'tb:mock:lullaby');
 const plan=backgroundPlan(borrowed);
 assert.deepEqual([plan.tempo,plan.metre,plan.colour],[66,3,'angry'],'the song lends its rhythm, the child\'s mood the colour');
 assert.equal(backgroundInput(piece,{kind:'teaching-music',musicId:'m',name:'歌',durationMs:1000},exampleTracks).textbook,null,'teaching music is not analysed yet');
});

test('textbook example cards are valid templates, and 帮我找找 finds the most alike songs offline',()=>{
 assert.ok(exampleTracks.length>=6&&exampleTracks.every(isTextbookTrack));
 assert.ok(exampleTracks.every(track=>track.source===null&&track.extraction.numbers==='example'),'examples say they are examples');
 assert.deepEqual(inspirationMatches(work({events:[]}),exampleTracks),[],'nothing placed: nothing to match');
 const matches=inspirationMatches(work({events:[ev('a',0,0,4),ev('b',.5,0,3)],mood:{kind:'preset',id:'sad'}}),exampleTracks);
 assert.equal(matches.length,3);
 assert.ok(matches.every(match=>exampleTracks.includes(match.track)&&match.reason.field));
});

test('万物成曲 refuses a length too short for the longest sound',()=>{
 const state=loaded(work({events:[ev('a',0,0,25)]}));
 assert.equal(state.arrangement!.spanSeconds,30);
 const refused=composeReducer(state,{type:'span',spanSeconds:20,now});
 assert.equal(refused.arrangement,state.arrangement);assert.equal(refused.lastAction,'span-blocked');
 assert.equal(composeReducer(state,{type:'span',spanSeconds:45,now}).arrangement!.spanSeconds,45);
});

test('课本: the child picks a shape of the song; the background, the AI brief and the talk follow it',()=>{
 let state=loaded(work({events:[ev('a',0,0,4),ev('b',.5,0,3)]}));
 assert.equal(composeReducer(state,{type:'variation',variation:'stretch'}),state,'no song chosen: nothing to shape');
 state=composeReducer(state,{type:'inspiration',inspiration:{kind:'textbook',entryId:'tb:mock:lullaby'}});
 state=composeReducer(state,{type:'variation',variation:'lower'});
 assert.deepEqual(state.settings.inspiration,{kind:'textbook',entryId:'tb:mock:lullaby',variation:'lower'});
 assert.ok(parseComposeSettings(state.settings));
 assert.equal(isValidInspiration({kind:'textbook',entryId:'x',variation:'sideways'}),false);
 const input=backgroundInput(state.arrangement!,state.settings.inspiration,exampleTracks);
 assert.equal(input.textbook?.variation,'lower');assert.equal(backgroundPlan(input).variation,'lower');
 assert.equal(backgroundBrief(state.arrangement!,state.settings.inspiration,exampleTracks,[])!.variation,'lower');
 const track=exampleTracks.find(item=>item.id==='tb:mock:lullaby')!;
 assert.equal(rhythmWords([2,1]),'嗒— 嗒');assert.equal(rhythmWords([.5,.5,1]),'嘀 嘀 嗒');
 assert.equal(songFeature(track),'「摇篮曲」是三拍子，节奏是「嗒— 嗒」，像摇篮轻轻晃。');
 const talk=textbookTalk(track,'lower',{kind:'together',example:0},'蛙鸣');
 assert.deepEqual(Object.keys(talk),['feature','shape','meeting','task']);
 assert.match(talk.meeting,/「蛙鸣」正好落在拍子上/);assert.match(talk.shape,/唱低了一点/);
});

test('the shelf can rename a work and take one off; empty names are refused',()=>{
 const shelf=new WorkShelf(),first=shelfEntry(loaded(work()),'一',now,rendering)!,second=shelfEntry(loaded(work({id:'work:2'})),'二',now,rendering)!;
 shelf.put(first);shelf.put(second);
 assert.equal(shelf.rename('work:1','   '),null);
 const renamed=shelf.rename('work:1','  下雨的歌  ')!;
 assert.equal(renamed.title,'下雨的歌');assert.equal(renamed.savedAt,first.savedAt);
 assert.deepEqual(shelf.list().map(item=>item.title),['二','下雨的歌'],'its place stays');
 assert.equal(shelf.remove('work:2'),true);assert.equal(shelf.remove('work:2'),false);
 assert.deepEqual(shelf.list().map(item=>item.id),['work:1']);
});

test('the AI background request is an anonymous brief with the textbook song\'s features only',()=>{
 const piece=work({events:[ev('a',0,0,4),ev('b',.5,0,3)],mood:{kind:'preset',id:'sad'}});
 assert.equal(backgroundBrief(work({events:[]}),{kind:'none'},exampleTracks,[]),null,'nothing placed: nothing to ask');
 const brief=backgroundBrief(piece,{kind:'textbook',entryId:'tb:mock:lullaby'},exampleTracks,['inst:local:organ'])!;
 assert.ok(isBackgroundBrief(brief));
 assert.deepEqual([brief.tempo,brief.metre,brief.mood,brief.textbook?.id,brief.textbook?.rhythmCell],[66,3,'sad','tb:mock:lullaby',[2,1]]);
 assert.deepEqual(brief.sounding,[{start:0,end:4},{start:15,end:18}]);
 assert.deepEqual(brief.rules,RULE_VERSIONS);
 const text=JSON.stringify(brief);
 for(const secret of ['蛙鸣','滴水','recording:','摇篮曲','像摇篮'])assert.ok(!text.includes(secret),`no ${secret} in the brief`);
 assert.equal(brief.teachingMusic,null,'a textbook song is not teaching music');
});

test('teaching music rides in the same AI background brief, by its upload id only',()=>{
 const piece=work({events:[ev('a',0,0,4)]});
 const brief=backgroundBrief(piece,{kind:'teaching-music',musicId:'music:42',name:'三年级二班春游录音',durationMs:90_000},exampleTracks,[])!;
 assert.ok(isBackgroundBrief(brief));
 assert.deepEqual([brief.teachingMusic,brief.textbook,brief.variation],[{musicId:'music:42'},null,null]);
 assert.ok(!JSON.stringify(brief).includes('春游'),'the file name stays on the device');
 const bad=(change:Record<string,unknown>)=>isBackgroundBrief({...brief,...change});
 assert.equal(bad({teachingMusic:{musicId:''}}),false,'empty id');
 assert.equal(bad({teachingMusic:{musicId:'music:42',name:'春游'}}),false,'nothing beside the id');
 assert.equal(bad({teachingMusic:undefined}),false,'the field must be there');
 const withSong=backgroundBrief(piece,{kind:'textbook',entryId:'tb:mock:lullaby'},exampleTracks,[])!;
 assert.equal(isBackgroundBrief({...withSong,teachingMusic:{musicId:'music:42'}}),false,'one inspiration at a time');
});

test('the AI background chain: closed sends nothing; steps are tried in order, each with a timeout; bad results are refused',async()=>{
 const brief=backgroundBrief(work({events:[ev('a',0,0,4)]}),{kind:'none'},exampleTracks,[])!;
 const never=new AbortController().signal;
 assert.deepEqual(await runBackgroundChain(offlineBackgroundGenerator,brief,never),{status:'unavailable',reason:'not-open'});
 const asked:string[]=[];
 const notes=[{at:0,length:2,midi:60,part:'chord',accent:0}];
 const fake=(answers:Record<string,unknown|'hang'>):BackgroundGenerator=>({open:['audio-ai','notes-ai'],
  generate:(_,step)=>{asked.push(step);const answer=answers[step];return answer==='hang'?new Promise(()=>{}):Promise.resolve(answer);}});
 const ready=await runBackgroundChain(fake({'audio-ai':{status:'unavailable',reason:'quota'},'notes-ai':{status:'ready',source:'notes-ai',notes,model:'qwen',promptVersion:'p1'}}),brief,never);
 assert.equal(ready.status,'ready');assert.deepEqual(asked,['audio-ai','notes-ai'],'audio first, then notes');
 const slow=await runBackgroundChain(fake({'audio-ai':'hang','notes-ai':'hang'}),brief,never,{'audio-ai':20,'notes-ai':20});
 assert.deepEqual(slow,{status:'unavailable',reason:'timeout'},'too slow: keep the local background');
 const tooLong=await runBackgroundChain(fake({'audio-ai':{status:'ready',source:'audio-ai',audioUrl:'https://x/a.mp3',durationMs:99_000,model:'fun',promptVersion:'p'},'notes-ai':{status:'ready',source:'notes-ai',notes:[{...notes[0],length:99}],model:'q',promptVersion:'p'}}),brief,never);
 assert.deepEqual(tooLong,{status:'unavailable',reason:'failed'},'a background longer than the piece is refused');
 assert.equal(parseBackgroundResult({status:'ready',source:'audio-ai',audioUrl:'http://x/a.mp3',durationMs:1000,model:'f',promptVersion:'p'},30),null,'https only');
});

test('routes /compose and /works',()=>{
 assert.deepEqual(parseRoute('/compose'),{page:'compose'});
 assert.deepEqual(parseRoute('/works/'),{page:'works'});
 assert.equal(routeHref({page:'compose'}),'/compose');assert.equal(routeHref({page:'works'}),'/works');
 assert.equal(WORK_CONTRACT_VERSION,'work-v1');
});

test('instruments: tap to add, tap again to remove, none = the original background; only the switch silences it',()=>{
 let state=loaded(work());
 assert.deepEqual(state.settings.background,{enabled:true,instruments:[],volume:.5},'starts with the background as generated, switched on');
 const tap=(id:string)=>{state=composeReducer(state,{type:'instrument',id});};
 tap('inst:local:drum');tap('inst:local:xylophone');
 assert.deepEqual(state.settings.background.instruments,['inst:local:drum','inst:local:xylophone']);
 tap('inst:local:drum');tap('inst:local:xylophone');
 assert.deepEqual(state.settings.background.instruments,[]);
 assert.equal(state.settings.background.enabled,true,'taking every instrument away does not switch the background off');
 state=composeReducer(state,{type:'background-enabled',enabled:false});
 tap('inst:local:organ');
 assert.equal(state.settings.background.enabled,true,'adding an instrument turns the layer on');
 for(let i=0;i<MAX_INSTRUMENTS+2;i++)tap(`inst:more:${i}`);
 assert.equal(state.settings.background.instruments.length,MAX_INSTRUMENTS);
 assert.ok(parseComposeSettings(state.settings));
 assert.equal(parseComposeSettings({...state.settings,background:{...state.settings.background,instruments:['a','a']}}),null);
 assert.equal(parseComposeSettings({...state.settings,background:{...state.settings.background,instruments:null}}),null);
});

test('课本灵感: example rhythm or teaching music; chosen in 万物声场 it stays with the work for 万物成曲',()=>{
 assert.ok(isValidInspiration({kind:'teaching-music',musicId:'teaching:1',name:'春雨',durationMs:90_000}));
 assert.equal(isValidInspiration({kind:'teaching-music',musicId:'teaching:1',name:'',durationMs:90_000}),false);
 assert.equal(isValidInspiration({kind:'textbook',entryId:''}),false);
 const session=new WorkSession(),inspiration={kind:'teaching-music',musicId:'teaching:1',name:'春雨',durationMs:90_000} as const;
 assert.equal(session.saveSettings({...session.settings(),inspiration}),true);
 session.addUnit(unit('u9',0),null,now);
 assert.deepEqual(session.settings().inspiration,inspiration,'making a sound keeps the inspiration');
 session.reset();
 assert.deepEqual(session.settings().inspiration,{kind:'none'});
});

test('textbook rhythm preview: whole bars at the entry’s tempo and metre, a bell on every downbeat',()=>{
 const notes=previewNotes({tempo:60,metre:3});
 const beats=notes.filter(note=>note.voice!=='pad');
 assert.equal(beats.length,6,'two 3-second bars fit in the 8-second preview');
 assert.deepEqual(beats.map(note=>note.voice),['bell','tick','tick','bell','tick','tick']);
 assert.deepEqual(beats.map(note=>note.at),[0,1,2,3,4,5]);
 assert.equal(previewNotes({tempo:120,metre:2}).filter(note=>note.voice==='bell').length,8);
});

test('the squirrel has something to say after every card control: no textbook, the volume, each shape',()=>{
 let state=loaded(work());
 state=composeReducer(state,{type:'inspiration',inspiration:{kind:'none'}});
 assert.equal(state.lastAction,'inspiration-none');
 state=composeReducer(state,{type:'background-volume',volume:.2});
 assert.equal(state.lastAction,'background-volume');assert.equal(state.settings.background.volume,.2);
 assert.equal(composeReducer(state,{type:'background-volume',volume:.2}),state,'the same volume changes nothing');
});

