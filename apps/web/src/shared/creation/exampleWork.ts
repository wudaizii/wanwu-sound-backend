// Mock data for 万物声场 and 万物成曲: example sound units built on the library's example sounds, and one example
// arrangement. The five choices are project presets from the library recipe (input 'example-preset'), not a child's
// choices; the pages label them 示例. Real class / public units come from the server later through the repository ports.
import {ARRANGEMENT_CONTRACT_VERSION,DEFAULT_ROWS,DEFAULT_SPAN_SECONDS} from '@wanwu-v2/contracts/arrangement';
import type {Arrangement,SourceClip} from '@wanwu-v2/contracts/arrangement';
import {SOUND_CONTRACT_VERSION} from '@wanwu-v2/contracts/sound';
import type {SoundUnitDraft} from '@wanwu-v2/contracts/sound';
import {exampleSound,exampleSourceId} from './exampleSounds.ts';

const PRESET_DATE='2026-10-22T00:00:00.000Z';

export const exampleUnitId=(sound:string)=>`unit:example:${sound}`;
/** Example units; `markerIndex` is assigned when one joins a work, so pass the index it gets there. */
export function exampleUnit(sound:string,markerIndex:number):SoundUnitDraft{
 const example=exampleSound(sound);
 if(!example)throw new Error('Missing example sound '+sound);
 return {version:SOUND_CONTRACT_VERSION,id:exampleUnitId(sound),sourceId:exampleSourceId(sound),name:example.label,maker:null,markerIndex,
  shape:{...example.preset},input:'example-preset',createdAt:PRESET_DATE,analysis:example.analysis};
}

/**
 * The field a visitor sees before making a sound: three examples, one repeated, spread over the three rows. Like a
 * child's work, each occurrence uses a part of the whole recording, chosen by the project for this example.
 */
const examplePlan:readonly {sound:string;at:number;row:number;clip:SourceClip}[]=[
 {sound:'bird',at:.06,row:0,clip:{startMs:8000,endMs:11_200}},
 {sound:'drop',at:.3,row:1,clip:{startMs:3000,endMs:5800}},
 {sound:'frog',at:.52,row:2,clip:{startMs:400,endMs:3600}},
 {sound:'bird',at:.66,row:0,clip:{startMs:8000,endMs:11_200}},
];
export function exampleArrangement(id:string,now:Date):Arrangement{
 const sounds=[...new Set(examplePlan.map(item=>item.sound))];
 return {version:ARRANGEMENT_CONTRACT_VERSION,id,origin:'example',mood:null,rows:DEFAULT_ROWS,spanSeconds:DEFAULT_SPAN_SECONDS,updatedAt:now.toISOString(),
  units:sounds.map((sound,index)=>exampleUnit(sound,index)),
  events:examplePlan.map((item,index)=>({id:`event:example:${index+1}`,unitId:exampleUnitId(item.sound),at:item.at,row:item.row,clip:{...item.clip}}))};
}
