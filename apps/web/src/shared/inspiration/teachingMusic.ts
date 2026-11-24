// Teaching music for 课本灵感: a teacher picks the class's textbook / teaching recording on this device. Today it stays
// on this device for this visit (listen only) — nothing is uploaded, analysed or generated.
//
// Intended flow once the backend exists (protocol v0.4; not implemented; teacher sign-in; the server owns accounts,
// licence checks and review):
//   1. POST /api/v1/teaching-music                     ← {mimeType, bytes, durationMs, licenseConfirmed:true,
//                                                         licenseVersion} → {musicId, uploadUrl, expiresAt}
//      The server records which teacher confirmed which licence text, and when. Limits as below (30 MiB, 10 minutes).
//   2. The file goes straight to object storage at `uploadUrl` (in parts, resumable on a weak network), not through the API.
//   3. POST /api/v1/teaching-music/{musicId}/complete  → {musicId, status:'analysing'}
//   4. GET  /api/v1/teaching-music/{musicId}           → {status:'analysing'} | {status:'ready',features:{tempo,metre,key,
//      mood,phrases}}. Once analysed the server deletes the audio and keeps only the features — like textbook songs,
//      whose audio never goes to the cloud.
//   5. POST /api/v1/backgrounds ← BackgroundBrief with teachingMusic:{musicId} (+ step) → {jobId}, then
//      GET /api/v1/backgrounds/{jobId} → BackgroundResult: the same AI background entry as without teaching music
//      (shared/background/generator.ts). The server combines the music's features with how the child arranged the
//      sounds (where they cluster, rests, length, mood) and generates a matching background layer. It never alters the
//      child's sounds or placement and never copies the teaching music's melody into the piece.
import {newId} from '../creation/ids';

export const TEACHING_MUSIC_MAX_BYTES=30*1024*1024;
export const TEACHING_MUSIC_MAX_MS=10*60_000;

/** Picked on this device; `url` is a local object URL for listening. Not uploaded. */
export type LocalTeachingMusic={id:string;name:string;durationMs:number;bytes:number;url:string};
export type PickResult={status:'picked';music:LocalTeachingMusic}|{status:'not-audio'|'too-large'|'too-long'|'unreadable'};

/** Reads the length from the file's own metadata (no decoding of the whole file). */
function readDuration(url:string){
 return new Promise<number>((resolve,reject)=>{
  const audio=new Audio();audio.preload='metadata';
  audio.onloadedmetadata=()=>Number.isFinite(audio.duration)?resolve(audio.duration*1000):reject(new Error('no duration'));
  audio.onerror=()=>reject(new Error('unreadable'));
  audio.src=url;
 });
}

export class TeachingMusicStore{
 private items=new Map<string,LocalTeachingMusic>();
 get(id:string){return this.items.get(id)??null;}
 async pick(file:File):Promise<PickResult>{
  if(!file.type.startsWith('audio/'))return {status:'not-audio'};
  if(file.size>TEACHING_MUSIC_MAX_BYTES)return {status:'too-large'};
  const url=URL.createObjectURL(file);
  try{
   const durationMs=Math.round(await readDuration(url));
   if(durationMs<=0){URL.revokeObjectURL(url);return {status:'unreadable'};}
   if(durationMs>TEACHING_MUSIC_MAX_MS){URL.revokeObjectURL(url);return {status:'too-long'};}
   const music={id:newId('teaching'),name:file.name.replace(/\.[^.]+$/,'').slice(0,24)||'教学音乐',durationMs,bytes:file.size,url};
   this.items.set(music.id,music);
   return {status:'picked',music};
  }catch{URL.revokeObjectURL(url);return {status:'unreadable'};}
 }
}
export const teachingMusic=new TeachingMusicStore();

/** Server side of teaching music (chosen in app/services.ts). Offline: analysis and generation are not available, and the
 *  课本灵感 dialog says so; a server adapter sets `analyseAvailable` once upload and analysis exist. */
export type TeachingMusicService={readonly analyseAvailable:boolean};
export const offlineTeachingMusicService:TeachingMusicService={analyseAvailable:false};
