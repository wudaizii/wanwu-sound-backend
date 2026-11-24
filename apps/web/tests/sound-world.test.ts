import test from 'node:test';
import assert from 'node:assert/strict';
import {ARRANGEMENT_CONTRACT_VERSION,ARRANGEMENT_MAX_EVENTS,DEFAULT_ROWS,DEFAULT_SPAN_SECONDS,MAX_ROWS,MIN_CLIP_MS,eventsInOrder,parseArrangement} from '@wanwu-v2/contracts/arrangement';
import type {Arrangement,PlacedEvent} from '@wanwu-v2/contracts/arrangement';
import {SOUND_CONTRACT_VERSION,SOUND_SOURCE_MAX_MS,parseSoundUnitDraft} from '@wanwu-v2/contracts/sound';
import type {SoundSource,SoundUnitDraft} from '@wanwu-v2/contracts/sound';
import {canRemoveRow,resettleRows,defaultClip,fitClip,freeRow,heardSeconds,initialSoundWorld,nudge,planPlayback,rowEndSpot,soundWorldReducer} from '../src/pages/sound-world/model/soundWorldState.ts';
import type {SoundWorldState} from '../src/pages/sound-world/model/soundWorldState.ts';
import {dragEdge,dragWindow,keyEdge,tapAt} from '../src/pages/sound-world/model/clipEditing.ts';
import {FIELD_INSET,locateSpot,spotPosition} from '../src/pages/sound-world/model/fieldGeometry.ts';
import {cleanMoodText,offlineMoodInterpreter,parseInterpretation} from '../src/pages/sound-world/services/moodInterpreter.ts';
import {exampleArrangement,exampleUnit} from '../src/shared/creation/exampleWork.ts';
import {SHAPING_RULES} from '@wanwu-v2/sound-rules/rules';
import {WorkSession} from '../src/shared/creation/workSession.ts';
import {parseRoute,routeHref} from '../src/app/router.ts';

const now=new Date('2026-10-22T08:00:00.000Z');
const once={pitch:'mid',duration:'short',contour:'flat',intensity:'soft',pattern:'once'} as const;
const unit=(id:string,markerIndex:number):SoundUnitDraft=>({version:SOUND_CONTRACT_VERSION,id,sourceId:`recording:${id}`,name:'我的录音',maker:'小林',markerIndex,
 shape:{...once},input:'manual',createdAt:now.toISOString()});
/** An occurrence lasting `seconds` (pattern once, pitch mid, so heard length = excerpt length). */
const ev=(id:string,at:number,row:number,seconds=1,unitId='u1'):PlacedEvent=>({id,unitId,at,row,clip:{startMs:0,endMs:seconds*1000}});
const work=(over:Partial<Arrangement>={}):Arrangement=>({version:ARRANGEMENT_CONTRACT_VERSION,id:'work:1',units:[unit('u1',0),unit('u2',1)],events:[],
 rows:DEFAULT_ROWS,spanSeconds:DEFAULT_SPAN_SECONDS,mood:null,origin:'child',updatedAt:now.toISOString(),...over});
const loaded=(arrangement:Arrangement):SoundWorldState=>soundWorldReducer(initialSoundWorld,{type:'loaded',arrangement});

test('example arrangement is valid, labelled as example and uses preset units',()=>{
 const example=exampleArrangement('work:example',now);
 assert.ok(parseArrangement(example));
 assert.equal(example.origin,'example');
 assert.ok(example.units.every(item=>item.input==='example-preset'&&parseSoundUnitDraft(item)));
 assert.deepEqual(example.units.map(item=>item.markerIndex),[0,1,2]);
 const bird=example.events.filter(event=>event.unitId==='unit:example:bird');
 assert.equal(bird.length,2);assert.notEqual(bird[0]!.id,bird[1]!.id);
});

test('arrangement parser checks references, rows, field length and excerpts',()=>{
 const base=work({events:[ev('e1',.5,1)]});
 assert.ok(parseArrangement(base));
 assert.equal(parseArrangement({...base,events:[{...ev('e1',.5,1),unitId:'missing'}]}),null);
 assert.equal(parseArrangement({...base,events:[ev('e1',640,1)]}),null);
 assert.equal(parseArrangement({...base,events:[ev('e1',.2,1),ev('e1',.4,1)]}),null);
 assert.equal(parseArrangement({...base,events:[ev('e1',.2,3)]}),null,'row outside the field');
 assert.ok(parseArrangement({...base,rows:4,events:[ev('e1',.2,3)]}));
 assert.equal(parseArrangement({...base,rows:MAX_ROWS+1}),null);
 assert.equal(parseArrangement({...base,spanSeconds:25 as 30}),null);
 assert.equal(parseArrangement({...base,events:[{...ev('e1',.2,1),clip:{startMs:500,endMs:600}}]}),null,'excerpt shorter than the minimum');
 assert.equal(parseArrangement({...base,events:[{...ev('e1',.2,1),clip:{startMs:0,endMs:SOUND_SOURCE_MAX_MS+1}}]}),null,'beyond 45 s');
 assert.equal(parseArrangement({...base,units:[unit('u1',0),unit('u2',0)]}),null,'marker numbers stay unique in a work');
 assert.equal(SOUND_SOURCE_MAX_MS,45_000);
});

test('rows are layout only: moving to another row never changes what is played',()=>{
 const before=work({events:[ev('e1',.3,0)]});
 const moved=soundWorldReducer(loaded(before),{type:'move',eventId:'e1',at:.3,row:2,now}).arrangement!;
 assert.equal(moved.events[0]!.row,2);
 assert.deepEqual(planPlayback(moved),planPlayback(before));
});

test('the page never moves a sound in time: a taken row sends it to the nearest free row, else it stays and says so',()=>{
 // A 9-second sound at 0.3 covers 0.25 … 0.6 of a 30-second field in row 1.
 let state=loaded(work({events:[ev('long',.3,1,9)]}));
 state=soundWorldReducer(state,{type:'place',unitId:'u2',eventId:'p',at:.45,row:1,clip:{startMs:0,endMs:1000},now});
 const placed=state.arrangement!.events.find(event=>event.id==='p')!;
 assert.equal(placed.at,.45,'time kept');assert.notEqual(placed.row,1);assert.equal(state.notice,null);
 // Fill every row at that moment: the next one overlaps and the child is told to add a row.
 state=loaded(work({events:[ev('a',.3,0,9),ev('b',.3,1,9),ev('c',.3,2,9)]}));
 state=soundWorldReducer(state,{type:'place',unitId:'u2',eventId:'p',at:.45,row:1,clip:{startMs:0,endMs:1000},now});
 assert.deepEqual(state.arrangement!.events.find(event=>event.id==='p'),ev('p',.45,1,1,'u2'));
 assert.deepEqual(state.notice,{tone:'info',key:'row-crowded'});
 assert.equal(freeRow(state.arrangement!,ev('q',.9,1),1),1,'later in time the row is free again');
});

test('copy keeps sound and excerpt, goes right after the original; remove and move only touch that event',()=>{
 let state=loaded(work({events:[{...ev('e1',.3,1,3),clip:{startMs:1000,endMs:4000}}]}));
 state=soundWorldReducer(state,{type:'copy',eventId:'e1',newId:'e2',now});
 const [first,second]=state.arrangement!.events;
 assert.equal(second!.unitId,first!.unitId);assert.deepEqual(second!.clip,first!.clip);assert.equal(second!.row,1);
 assert.ok(second!.at>=first!.at+3/30,'starts after the 3-second original has finished');
 state=soundWorldReducer(state,{type:'move',eventId:'e1',at:.9,row:2,now});
 assert.equal(state.arrangement!.events.find(event=>event.id==='e1')!.row,2);
 state=soundWorldReducer(state,{type:'remove',eventId:'e2',now});
 assert.deepEqual(state.arrangement!.events.map(event=>event.id),['e1']);
 assert.equal(state.selection,null);
});

test('excerpts: a placed sound starts with the whole recording, fits it, editing keeps time and the original untouched',()=>{
 assert.deepEqual(defaultClip(3200),{startMs:0,endMs:3200});
 assert.deepEqual(defaultClip(40_000),{startMs:0,endMs:40_000});
 assert.deepEqual(defaultClip(null),{startMs:0,endMs:SOUND_SOURCE_MAX_MS},'unknown length: the limit, fitted once decoded');
 assert.deepEqual(fitClip({startMs:5000,endMs:9000},3000),{startMs:2800,endMs:3000});
 let state=loaded(work({events:[ev('e1',.2,0,1)]}));
 state=soundWorldReducer(state,{type:'clip',eventId:'e1',clip:{startMs:2000,endMs:7500},now});
 const edited=state.arrangement!.events[0]!;
 assert.deepEqual(edited.clip,{startMs:2000,endMs:7500});assert.equal(edited.at,.2);
 assert.equal(heardSeconds(unit('u1',0),edited),5.5);
 // The real length arrives later and shortens an excerpt that reached past it, without counting as an edit.
 const fitted=soundWorldReducer(state,{type:'source-length',sourceId:'recording:u1',durationMs:6000});
 assert.deepEqual(fitted.arrangement!.events[0]!.clip,{startMs:2000,endMs:6000});
 assert.equal(fitted.arrangement!.updatedAt,state.arrangement!.updatedAt);
});

test('excerpt editing: edges, sliding window, taps and keys stay inside the recording',()=>{
 const clip={startMs:1000,endMs:3000},total=10_000;
 assert.deepEqual(dragEdge(clip,'start',2950,total),{startMs:3000-MIN_CLIP_MS,endMs:3000});
 assert.deepEqual(dragEdge(clip,'end',20_000,total),{startMs:1000,endMs:total});
 assert.deepEqual(dragWindow(clip,9000,total),{startMs:8000,endMs:10_000});
 assert.deepEqual(dragWindow(clip,-5000,total),{startMs:0,endMs:2000});
 assert.deepEqual(tapAt(clip,6000,total),{startMs:1000,endMs:6000});
 assert.deepEqual(tapAt(clip,2000,total),clip);
 assert.deepEqual(keyEdge(clip,'start','ArrowRight',true,total),{startMs:2000,endMs:3000});
 assert.deepEqual(keyEdge(clip,'end','End',false,total),{startMs:1000,endMs:total});
});

test('field playback of an excerpt plays it as chosen: no 10-second cap; timing follows the unit\'s own analysis',()=>{
 assert.equal(heardSeconds(unit('a',0),{clip:{startMs:0,endMs:30_000}}),30,'no analysis yet: the excerpt as it is');
 assert.equal(heardSeconds({shape:{...once,pitch:'high'}},{clip:{startMs:0,endMs:2000}}),2,'高低 keeps the length');
 const {waveSeconds,waveGapSeconds}=SHAPING_RULES.pattern.repeat;
 const repeated=heardSeconds({shape:{...once,pattern:'repeat'}},{clip:{startMs:0,endMs:10_000}});
 const waves=Math.floor((10+waveGapSeconds)/(waveSeconds+waveGapSeconds));
 assert.ok(Math.abs(repeated-(waves*waveSeconds+(waves-1)*waveGapSeconds))<1e-9,'a long running sound comes back in waves all through the excerpt');
 const bird=exampleUnit('bird',0),whole={startMs:bird.analysis!.main!.startMs,endMs:bird.analysis!.main!.startMs+45_000};
 assert.ok(heardSeconds({...bird,shape:{...bird.shape,pattern:'repeat'}},{clip:whole})>40,'45 s of birdsong repeated still lasts about 45 s, not a few seconds');
 const frog=exampleUnit('frog',0);
 assert.equal(frog.analysis?.kind,'series','example units carry the library analysis');
 const clip={startMs:frog.analysis!.main!.startMs,endMs:frog.analysis!.main!.endMs};
 assert.ok(heardSeconds({...frog,shape:{duration:'long'}},{clip})>heardSeconds({...frog,shape:{}},{clip}),'长长的 makes each croak longer');
});

test('rows: start with three, add up to the maximum, take back only an empty last row',()=>{
 let state=loaded(work());
 state=soundWorldReducer(state,{type:'add-row',now});
 assert.equal(state.arrangement!.rows,4);assert.ok(canRemoveRow(state.arrangement!));
 state=soundWorldReducer(state,{type:'place',unitId:'u1',eventId:'e',at:.5,row:3,clip:{startMs:0,endMs:1000},now});
 assert.equal(canRemoveRow(state.arrangement!),false,'a row with a sound in it stays');
 state=soundWorldReducer(state,{type:'add-row',now});
 state=soundWorldReducer(state,{type:'add-row',now});
 assert.equal(state.arrangement!.rows,MAX_ROWS);assert.deepEqual(state.notice,{tone:'info',key:'rows-full'});
 state=soundWorldReducer(state,{type:'remove-row',now});
 assert.equal(state.arrangement!.rows,4);
 assert.ok(parseArrangement(state.arrangement));
});

test('the field refuses more than the maximum and says why',()=>{
 const events=Array.from({length:ARRANGEMENT_MAX_EVENTS},(_,i)=>ev(`e${i}`,(i%8)/8,i%3));
 const state=soundWorldReducer(loaded(work({events})),{type:'place',unitId:'u1',eventId:'extra',at:.5,row:1,clip:{startMs:0,endMs:1000},now});
 assert.equal(state.arrangement!.events.length,ARRANGEMENT_MAX_EVENTS);
 assert.deepEqual(state.notice,{tone:'error',key:'events-full'});
});

test('added units get the next free marker number; mood never moves anything',()=>{
 let state=loaded(work());
 state=soundWorldReducer(state,{type:'add-unit',unit:exampleUnit('frog',0),now});
 assert.equal(state.arrangement!.units.at(-1)!.markerIndex,2);
 const before=state.arrangement!.events;
 state=soundWorldReducer(state,{type:'mood',mood:{kind:'preset',id:'calm'},now});
 assert.deepEqual(state.arrangement!.mood,{kind:'preset',id:'calm'});assert.equal(state.arrangement!.events,before);
});

test('row ends and keyboard nudges',()=>{
 const arrangement=work({events:[ev('a',.2,1,3)]});
 assert.ok(rowEndSpot(arrangement,1)>=.3,'after the 3-second sound');
 assert.equal(rowEndSpot(arrangement,2),0);
 assert.deepEqual(nudge(ev('a',.5,0),'ArrowUp',3),null);
 assert.deepEqual(nudge(ev('a',.5,0),'ArrowDown',3),{at:.5,row:1,exact:true});
 assert.deepEqual(nudge(ev('a',.5,2),'ArrowDown',4),{at:.5,row:3,exact:true});
});

test('geometry maps pointer to business coordinates and back, independent of size',()=>{
 for(const box of [{left:100,top:50,width:900,height:480},{left:10,top:300,width:290,height:360}]){
  const x=box.left+box.width*(FIELD_INSET+.5*(1-2*FIELD_INSET));
  assert.deepEqual(locateSpot(box,3,x,box.top+box.height*.9),{at:.5,row:2});
  assert.deepEqual(locateSpot(box,5,x,box.top+box.height*.9),{at:.5,row:4});
  assert.equal(locateSpot(box,3,box.left-100,box.top),null);
 }
 const corner=spotPosition({at:0,row:0},3);
 assert.equal(corner.left,`${FIELD_INSET*100}%`);assert.ok(Math.abs(parseFloat(corner.top)-100/6)<1e-9);
});

test('playback order, timing and excerpts come from the arrangement only',()=>{
 const arrangement=work({events:[ev('late',.75,0),{...ev('early',.25,2),clip:{startMs:500,endMs:1500}}]});
 const plan=planPlayback(arrangement);
 assert.deepEqual(plan.map(item=>[item.eventId,item.startSeconds,item.clip.startMs]),[['early',7.5,500],['late',22.5,0]]);
 assert.deepEqual(eventsInOrder(arrangement.events).map(event=>event.id),['early','late']);
});

test('work session: 声音诞生 hand-off numbers sounds and replaces an untouched example',()=>{
 const session=new WorkSession();
 assert.equal(session.nextMarkerIndex(),0);
 session.save(exampleArrangement('work:example',now));
 assert.equal(session.nextMarkerIndex(),0,'an example field is not the child’s work');
 const source:SoundSource={id:'recording:u1',kind:'local-recording',label:'我的录音',durationMs:1200,mimeType:'audio/webm',
  provenance:{recordedBy:'小林',recordedOn:'2026-10-22',place:'后山',group:null,provenanceUrl:null}};
 const first=session.addUnit(unit('u1',0),source,now);
 assert.equal(first.status,'added');
 assert.equal(session.current()!.origin,'child');assert.deepEqual(session.current()!.units.map(item=>item.id),['u1']);
 assert.equal(session.nextMarkerIndex(),1);
 const clash=session.addUnit(unit('u2',0),null,now);
 assert.equal(clash.status==='added'&&clash.unit.markerIndex,1,'a clashing number moves to the next free one');
 assert.equal(session.source('recording:u1')?.label,'我的录音');
 assert.equal(session.save({...session.current()!,events:[{...ev('x',.5,1),unitId:'nope'}]}),false);
});

test('route /world opens 万物声场',()=>{
 assert.deepEqual(parseRoute('/world'),{page:'sound-world'});
 assert.deepEqual(parseRoute('/world/'),{page:'sound-world'});
 assert.equal(routeHref({page:'sound-world'}),'/world');
});

test('tapping a placed sound selects it and keeps it selected; empty space or Esc lets go',()=>{
 let state=loaded(work({events:[ev('e1',.3,0)]}));
 state=soundWorldReducer(state,{type:'select-event',eventId:'e1'});
 const again=soundWorldReducer(state,{type:'select-event',eventId:'e1'});
 assert.equal(again,state,'a second tap does not deselect');
 assert.equal(soundWorldReducer(state,{type:'deselect'}).selection,null);
});

test('field length: 20 / 30 / 45 s only; switching keeps every sound’s order and re-tidies rows only',()=>{
 // In 45 s two 9-second sounds in row 0 sit apart; squeezed into 20 s the first tail reaches the second.
 const base=work({spanSeconds:45,events:[ev('a',.1,0,9),ev('b',.42,0,1)]});
 assert.deepEqual(resettleRows(base).events.map(event=>event.row),[0,0]);
 let state=loaded(base);
 state=soundWorldReducer(state,{type:'span',spanSeconds:20,now});
 const events=state.arrangement!.events;
 assert.equal(state.arrangement!.spanSeconds,20);
 assert.deepEqual(events.map(event=>event.at),[.1,.42],'time positions untouched');
 assert.notEqual(events[1]!.row,0,'the later sound moved to a free row');
 assert.equal(soundWorldReducer(state,{type:'span',spanSeconds:60 as 45,now}),state,'longer than 45 s is refused');
 assert.equal(parseArrangement({...state.arrangement!,spanSeconds:60}),null);
});

test('moods: seven presets plus the child’s own words, which need a connected model',()=>{
 const base=work();
 assert.ok(parseArrangement({...base,mood:{kind:'preset',id:'sad'}}));
 assert.ok(parseArrangement({...base,mood:{kind:'preset',id:'angry'}}));
 assert.ok(parseArrangement({...base,mood:{kind:'custom',text:'像下雨天一样',nearest:'sad'}}));
 assert.equal(parseArrangement({...base,mood:{kind:'custom',text:'一二三四五六七八九十一二三',nearest:null}}),null,'more than 12 characters');
 assert.equal(parseArrangement({...base,mood:{kind:'preset',id:'grumpy'}}),null);
 assert.equal(parseArrangement({...base,mood:'calm'}),null,'old plain-string moods are not accepted');
 const state=soundWorldReducer(loaded(base),{type:'mood',mood:{kind:'custom',text:'',nearest:null},now});
 assert.equal(state.arrangement!.mood,null,'empty words are ignored');
 assert.equal(offlineMoodInterpreter.available,false);
 assert.equal(cleanMoodText('  像   下雨天  '),'像 下雨天');
 assert.deepEqual(parseInterpretation({nearest:'calm'}),{nearest:'calm'});
 assert.equal(parseInterpretation({nearest:'grumpy'}),null);
});

test('one sound is never longer than the field: the field grows to hold it, shorter lengths are refused',()=>{
 let state=loaded(work({spanSeconds:20,events:[ev('e1',.1,0,5)]}));
 // Placing a 25 s sound in a 20 s field: the field becomes 30 s and the frog says why; positions stay.
 state=soundWorldReducer(state,{type:'place',unitId:'u2',eventId:'e2',at:.5,row:1,clip:{startMs:0,endMs:25_000},now});
 assert.equal(state.arrangement!.spanSeconds,30);assert.equal(state.lastAction,'span-fitted');
 assert.deepEqual(state.arrangement!.events.map(event=>event.at),[.1,.5]);
 // A longer excerpt picked with 剪一剪 grows it again, to the shortest length that holds it.
 state=soundWorldReducer(state,{type:'clip',eventId:'e2',clip:{startMs:0,endMs:40_000},now});
 assert.equal(state.arrangement!.spanSeconds,45);assert.equal(state.lastAction,'span-fitted');
 // Shorter lengths are refused while that sound is there; nothing else changes.
 const refused=soundWorldReducer(state,{type:'span',spanSeconds:30,now});
 assert.equal(refused.arrangement,state.arrangement);assert.equal(refused.lastAction,'span-blocked');
 // Only the sound's own length counts: a 15 s sound late in a 30 s field may still run past the end.
 const late=loaded(work({events:[ev('e1',.8,0,15)]}));
 assert.equal(late.arrangement!.spanSeconds,30);
 assert.equal(soundWorldReducer(late,{type:'span',spanSeconds:20,now}).arrangement!.spanSeconds,20);
 // A work that comes in with a sound longer than its field is fitted on load.
 assert.equal(loaded(work({spanSeconds:20,events:[ev('e1',0,0,28)]})).arrangement!.spanSeconds,30);
 // The real length arriving later can also make a sound longer than the field.
 const unknown=loaded(work({spanSeconds:20,events:[{...ev('e1',0,0),clip:{startMs:0,endMs:SOUND_SOURCE_MAX_MS}}]}));
 assert.equal(unknown.arrangement!.spanSeconds,45,'a 45 s excerpt needs the 45 s field');
});
