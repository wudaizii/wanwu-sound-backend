// Sources captured on this device during this visit (recordings, picked files), with their provenance.
// In memory only: nothing is uploaded or persisted. A storage / server adapter can replace this behind the same shape.
//
// Intended upload (protocol v0.4; not implemented; sign-in; the original is never overwritten):
//   PUT  /api/v1/sources/{sourceId}          ← {source: SoundSource, analysis: SoundAnalysis, bytes} → {uploadUrl, expiresAt}
//        `sourceId` is the id made on this device (newId: prefix + UUID), so the call is idempotent: kept here while
//        offline, sent again when the network is back, retried after a failure — and works keep the same sourceId.
//        The server checks durationMs ≤ SOUND_SOURCE_MAX_MS (+ SOUND_SOURCE_SLACK_MS), an audio/webm | audio/mp4 |
//        audio/ogg type and a complete provenance (missingProvenance is empty).
//   then the original goes straight to object storage at `uploadUrl` (with progress and retries), not through the API;
//   POST /api/v1/sources/{sourceId}/complete → SoundSource with kind 'uploaded' (the server checks the real length and
//        type and makes a playable copy; visibility starts private)
import type {SoundSource} from '@wanwu-v2/contracts/sound';

type Entry={source:SoundSource;buffer:AudioBuffer};
export type ArchiveSnapshot=readonly SoundSource[];

export class SessionSourceArchive{
 private entries=new Map<string,Entry>();
 private snapshot:ArchiveSnapshot=[];
 private listeners=new Set<()=>void>();
 save(source:SoundSource,buffer:AudioBuffer){this.entries.set(source.id,{source,buffer});this.emit();}
 update(source:SoundSource){const entry=this.entries.get(source.id);if(!entry)return;this.entries.set(source.id,{...entry,source});this.emit();}
 buffer(id:string){return this.entries.get(id)?.buffer??null;}
 list=():ArchiveSnapshot=>this.snapshot;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 /** Most recent first, distinct, non-empty values of a provenance field — for one-tap reuse. */
 recent(field:'recordedBy'|'place'|'group'){
  const seen=new Set<string>();
  for(const source of [...this.snapshot].reverse()){const value=source.provenance[field];if(value)seen.add(value);}
  return [...seen];
 }
 private emit(){this.snapshot=[...this.entries.values()].map(entry=>entry.source);for(const listener of this.listeners)listener();}
}
export const sessionArchive=new SessionSourceArchive();
