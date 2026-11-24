// In-memory original bytes and decoded/canonical playback buffers. Nothing persists merely by entering this archive.
// The authenticated cloud adapter explicitly uploads original Blob/File bytes, freezes a new immutable object, and
// replaces preview buffers with server-normalized audio. Upload completion never admits anything to a library.
// Originals captured inside an account remain account-scoped here; unclaimed guest work is not silently imported.
import type {SoundSource} from '@wanwu-v2/contracts/sound';

/** Original bytes are immutable. A local excerpt retains its parent file and selection, never a re-encoded "original". */
export type LocalOriginal={blob:Blob;selection?:Readonly<{startMs:number;endMs:number}>;rawDurationMs?:number};
type Entry={source:SoundSource;buffer:AudioBuffer;original?:LocalOriginal;ownerId?:string};
export type ArchiveSnapshot=readonly SoundSource[];

export class SessionSourceArchive{
 private entries=new Map<string,Entry>();
 private snapshot:ArchiveSnapshot=[];
 private listeners=new Set<()=>void>();
 private activeAccount:string|null=null;
 save(source:SoundSource,buffer:AudioBuffer,original?:LocalOriginal){
  const previous=this.entries.get(source.id)?.original;
  if(previous&&original&&(previous.blob!==original.blob||previous.selection?.startMs!==original.selection?.startMs
   ||previous.selection?.endMs!==original.selection?.endMs))throw new Error('original-source-cannot-be-replaced');
  const retained=original??previous;
  this.entries.set(source.id,{source,buffer,ownerId:this.entries.get(source.id)?.ownerId??(source.kind.startsWith('local-')?this.activeAccount??undefined:undefined),original:retained&&Object.freeze({...retained,
   ...(retained.selection?{selection:Object.freeze({...retained.selection})}:{})})});this.emit();
 }
 update(source:SoundSource){const entry=this.entries.get(source.id);if(!entry)return;this.entries.set(source.id,{...entry,source});this.emit();}
 private visible(entry:Entry|undefined){return entry&&(!entry.ownerId||entry.ownerId===this.activeAccount)?entry:null;}
 buffer(id:string){return this.visible(this.entries.get(id))?.buffer??null;}
 original(id:string){return this.visible(this.entries.get(id))?.original??null;}
 setAccount(id:string|null){this.activeAccount=id;this.emit();}
 claim(id:string,ownerId:string){const entry=this.entries.get(id);if(entry){this.entries.set(id,{...entry,ownerId});this.emit();}}
 ownedBy(id:string){return [...this.entries.values()].some(entry=>entry.ownerId===id);}
 list=():ArchiveSnapshot=>this.snapshot;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 /** Most recent first, distinct, non-empty values of a provenance field — for one-tap reuse. */
 recent(field:'recordedBy'|'place'|'group'){
  const seen=new Set<string>();
  for(const source of [...this.snapshot].reverse()){const value=source.provenance[field];if(value)seen.add(value);}
  return [...seen];
 }
 private emit(){this.snapshot=[...this.entries.values()].filter(entry=>this.visible(entry)).map(entry=>entry.source);for(const listener of this.listeners)listener();}
}
export const sessionArchive=new SessionSourceArchive();
