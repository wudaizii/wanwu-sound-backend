import test from 'node:test';
import assert from 'node:assert/strict';
import {ARRANGEMENT_CONTRACT_VERSION} from '@wanwu-v2/contracts/arrangement';
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import {SOUND_CONTRACT_VERSION} from '@wanwu-v2/contracts/sound';
import type {ChosenShape} from '@wanwu-v2/contracts/sound';
import {TEXTBOOK_CONTRACT_VERSION,isTextbookTrack} from '@wanwu-v2/contracts/textbook';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import {TEXTBOOK_MATCH_RULES,textbookMatchProblems} from '../src/rules.ts';
import {matchTracks,workSummary} from '../src/textbookMatch.ts';

const track=(id:string,extra:Partial<TextbookTrack>):TextbookTrack=>({version:TEXTBOOK_CONTRACT_VERSION,id,title:id,source:null,tempoBpm:90,meter:4,rhythmCell:[1],
 onsetDensity:'medium',pitchRange:{low:60,high:72},brightness:'mid',mode:'major',repetition:'medium',mood:'calm',childLine:'像……',
 extraction:{numbers:'example',words:'example',confidence:1,earChecked:false},...extra});
const busy=track('busy',{onsetDensity:'busy',repetition:'high',mood:'lively',pitchRange:{low:72,high:84}});
const sparse=track('sparse',{onsetDensity:'sparse',repetition:'low',mood:'sad',pitchRange:{low:48,high:60}});
const middle=track('middle',{});

const work=(shape:ChosenShape,events:number,mood:Arrangement['mood']=null):Arrangement=>({version:ARRANGEMENT_CONTRACT_VERSION,id:'w',origin:'child',rows:3,spanSeconds:30,mood,updatedAt:'2026-10-24T00:00:00.000Z',
 units:[{version:SOUND_CONTRACT_VERSION,id:'u',sourceId:'s',name:'雨',maker:null,markerIndex:0,shape,input:'manual',createdAt:'2026-10-24T00:00:00.000Z'}],
 events:Array.from({length:events},(_,i)=>({id:`e${i}`,unitId:'u',at:i/Math.max(1,events),row:0,clip:{startMs:0,endMs:2000}}))});

test('the match rules load, and template cards are validated',()=>{
 assert.deepEqual(textbookMatchProblems(TEXTBOOK_MATCH_RULES),[]);
 assert.ok(isTextbookTrack(busy));
 assert.equal(isTextbookTrack({...busy,rhythmCell:[]}),false);
 assert.equal(isTextbookTrack({...busy,mood:'sleepy'}),false);
});

test('the arrangement is summed up with the same fields as the songs',()=>{
 assert.equal(workSummary(work({},0)),null,'nothing placed: nothing to match');
 const lots=workSummary(work({pattern:'repeat',pitch:'high'},24,{kind:'preset',id:'lively'}))!;
 assert.deepEqual([lots.density,lots.repetition,lots.register,lots.mood],['busy','high','high','lively']);
 const few=workSummary(work({pitch:'low'},1,{kind:'preset',id:'sad'}))!;
 assert.deepEqual([few.density,few.repetition,few.register,few.mood],['sparse','low','low','sad']);
});

test('the most alike songs come first, each with why',()=>{
 const lots=workSummary(work({pattern:'repeat',pitch:'high'},24,{kind:'preset',id:'lively'}))!;
 const matches=matchTracks(lots,[sparse,middle,busy]);
 assert.equal(matches.length,TEXTBOOK_MATCH_RULES.top);
 assert.deepEqual(matches.map(match=>match.trackId),['busy','middle','sparse']);
 assert.equal(matches[0]!.reason.field,'density');assert.equal(matches[0]!.reason.value,'busy');
 const few=workSummary(work({pitch:'low'},1,{kind:'preset',id:'sad'}))!;
 assert.equal(matchTracks(few,[busy,middle,sparse])[0]!.trackId,'sparse');
});
