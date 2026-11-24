// 声音诞生's 声音库: the library's examples (from the shared sound library port, shared/creation/soundLibrary.ts) plus
// the sources captured on this device in this visit, grouped for the dialog. Class / public libraries need the server.
import type {SoundSource} from '@wanwu-v2/contracts/sound';
import {EXAMPLE_PROVENANCE_URL,exampleSourceId} from '../../../shared/creation/exampleSounds.ts';
import type {ExampleSound} from '../../../shared/creation/exampleSounds.ts';
import type {ArchiveSnapshot} from '../../../shared/creation/sourceArchive.ts';

export type LibraryItem={source:SoundSource;url:string|null;cloud?:boolean};
export type LibraryGroup={id:string;title:string;note:string;items:LibraryItem[]};

export const EXAMPLE_GROUP='示例声音';

/** A library example as a pickable source (whole recording, credited, with its licence page). */
export const exampleLibraryItem=(example:ExampleSound):LibraryItem=>({
 url:example.url,
 source:{id:exampleSourceId(example.id),kind:'example',label:example.label,durationMs:example.durationMs,mimeType:'audio/mpeg',
  provenance:{recordedBy:example.by,recordedOn:null,place:null,group:EXAMPLE_GROUP,provenanceUrl:EXAMPLE_PROVENANCE_URL}},
});

/** Examples first, then local sources grouped by their 分组 (ungrouped last). Parts of examples are not listed again. */
export function libraryGroups(examples:readonly LibraryItem[],local:ArchiveSnapshot,cloud:readonly {scope:'mine'|'teachers';source:SoundSource;url:string}[]=[]):LibraryGroup[]{
 const byGroup=new Map<string,LibraryItem[]>();
 for(const source of local){
  if(source.kind==='example'||cloud.some(entry=>entry.source.id===source.id))continue;const key=source.provenance.group??'';byGroup.set(key,[...(byGroup.get(key)??[]),{source,url:null}]);}
 const groups=[...byGroup.entries()].sort(([a],[b])=>a===''?1:b===''?-1:a.localeCompare(b,'zh-Hans-CN'))
  .map(([group,items])=>({id:`local:${group}`,title:group||'本页未分组',note:'本页临时声音 · 不等于已入库',items}));
 const saved:LibraryGroup[]=(['mine','teachers'] as const).map(scope=>({id:scope,title:scope==='mine'?'个人素材库':'老师共享素材库',note:'已试听确认',items:cloud.filter(entry=>entry.scope===scope).map(entry=>({source:entry.source,url:entry.url,cloud:true}))}));
 return [{id:'examples',title:EXAMPLE_GROUP,note:'随网页提供 · 可查看来源与许可',items:[...examples]},...saved.filter(group=>group.items.length),...groups];
}
