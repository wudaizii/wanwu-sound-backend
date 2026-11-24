// 声音诞生's 声音库: the library's examples (from the shared sound library port, shared/creation/soundLibrary.ts) plus
// the sources captured on this device in this visit, grouped for the dialog. Class / public libraries need the server.
import type {SoundSource} from '@wanwu-v2/contracts/sound';
import {EXAMPLE_PROVENANCE_URL,exampleSourceId} from '../../../shared/creation/exampleSounds.ts';
import type {ExampleSound} from '../../../shared/creation/exampleSounds.ts';
import type {ArchiveSnapshot} from '../../../shared/creation/sourceArchive.ts';

export type LibraryItem={source:SoundSource;url:string|null};
export type LibraryGroup={id:string;title:string;note:string;items:LibraryItem[]};

export const EXAMPLE_GROUP='示例声音';

/** A library example as a pickable source (whole recording, credited, with its licence page). */
export const exampleLibraryItem=(example:ExampleSound):LibraryItem=>({
 url:example.url,
 source:{id:exampleSourceId(example.id),kind:'example',label:example.label,durationMs:example.durationMs,mimeType:'audio/mpeg',
  provenance:{recordedBy:example.by,recordedOn:null,place:null,group:EXAMPLE_GROUP,provenanceUrl:EXAMPLE_PROVENANCE_URL}},
});

/** Examples first, then local sources grouped by their 分组 (ungrouped last). Parts of examples are not listed again. */
export function libraryGroups(examples:readonly LibraryItem[],local:ArchiveSnapshot):LibraryGroup[]{
 const byGroup=new Map<string,LibraryItem[]>();
 for(const source of local){
  if(source.kind==='example')continue;const key=source.provenance.group??'';byGroup.set(key,[...(byGroup.get(key)??[]),{source,url:null}]);}
 const groups=[...byGroup.entries()].sort(([a],[b])=>a===''?1:b===''?-1:a.localeCompare(b,'zh-Hans-CN'))
  .map(([group,items])=>({id:`local:${group}`,title:group||'未分组',note:'本机 · 未上传',items}));
 return [{id:'examples',title:EXAMPLE_GROUP,note:'随网页提供 · 可查看来源与许可',items:[...examples]},...groups];
}
