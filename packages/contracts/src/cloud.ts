import {exactObject} from './account.ts';
import {parseArrangement} from './arrangement.ts';
import type {Arrangement} from './arrangement';
import {parseComposeSettings,cleanWorkTitle} from './work.ts';
import type {ComposeSettings} from './work';
import {isSoundSource,isSoundAnalysis,missingProvenance,isChosenShape,parseSoundUnitDraft} from './sound.ts';
import type {SoundSource,SoundAnalysis,SoundUnitDraft} from './sound';

export const CONFIRMATION_VERSION='teacher-confirmation-v1';
export const MAX_UPLOAD_BYTES=20*1024*1024;
export const cloudId=(value:unknown,prefix:string):value is string=>typeof value==='string'&&value.length<=128
 &&new RegExp(`^${prefix}[:_][A-Za-z0-9_:-]+$`).test(value);
export const fingerprint=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
export const isoDate=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT/.test(value)&&Number.isFinite(Date.parse(value));
const keys=(value:unknown,required:string[],optional:string[]=[])=>!!value&&typeof value==='object'&&!Array.isArray(value)
 &&required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>[...required,...optional].includes(key));
export type WorkContent={id:string;title:string;arrangement:Arrangement;settings:ComposeSettings};
export type WorkRecord=WorkContent&{revision:number;state:'draft'|'saved';savedRevision:number|null;updatedAt:string};
export type WorkSummary={id:string;title:string;revision:number;state:'draft'|'saved';savedRevision:number|null;updatedAt:string};
export type ProcessingStatus='uploading'|'queued'|'processing'|'ready'|'failed'|'disabled';
export type Playback={url:string;expiresAt:string};
export type SourceView={source:SoundSource;status:ProcessingStatus;checksum:string;analysis:SoundAnalysis|null;playback:Playback|null;failure:string|null};
export type UploadIntent={uploadId:string;method:'PUT';uploadUrl:string;requiredHeaders:Record<string,string>;expiresAt:string};
export type RenderView={workId:string;workRevision:number;status:'queued'|'processing'|'ready'|'failed';audioAssetId:string|null;playback:Playback|null;durationMs:number|null;failure:string|null;retryAfterSeconds:number};
export type ShareView={status:'none'|'pending-render'|'published'|'revoked';workRevision:number|null;url:string|null;publishedAt:string|null};
export type PublishedWorkView={title:string;publishedAt:string;audio:{durationMs:number;playback:Playback}};
export type Confirmation={listened:true;suitableForChildren:true;statementVersion:typeof CONFIRMATION_VERSION};
export type LibraryScope='private'|'teachers';
export type LibraryEntry={entryId:string;sourceId:string;kind:'source'|'sound-unit';scope:LibraryScope;unit:SoundUnitDraft|null;
 source:SourceView;mine:boolean;confirmation:{confirmedAt:string;sourceChecksum:string;statementVersion:string}};

/** Projection rejects extra identity/state fields and bounds nested collections before legacy validators run. */
export function cloudArrangement(value:unknown):Arrangement|null{
 if(!keys(value,['version','id','units','events','rows','spanSeconds','mood','origin','updatedAt']))return null;
 const raw=value as Arrangement;
 if(!cloudId(raw.id,'work')||!isoDate(raw.updatedAt)||!Array.isArray(raw.units)||raw.units.length>12||!Array.isArray(raw.events)||raw.events.length>24)return null;
 for(const unit of raw.units){
  if(!keys(unit,['version','id','sourceId','name','maker','markerIndex','shape','input','createdAt'],['analysis'])
   ||!cloudId(unit.id,'unit')||typeof unit.sourceId!=='string'||unit.sourceId.length>128||!isoDate(unit.createdAt)
   ||unit.markerIndex>11||!Number.isInteger(unit.markerIndex)||!isChosenShape(unit.shape)||Object.keys(unit.shape).length>5)return null;
 }
 for(const event of raw.events)if(!keys(event,['id','unitId','at','row','clip'])||!cloudId(event.id,'event')||!exactObject(event.clip,['startMs','endMs']))return null;
 if(raw.mood!==null){const mood=raw.mood;if(mood.kind==='preset'?!exactObject(mood,['kind','id']):!exactObject(mood,['kind','text','nearest']))return null;}
 return parseArrangement(value);
}
export function cloudSettings(value:unknown):ComposeSettings|null{
 if(!exactObject(value,['background','inspiration'])||!exactObject(value.background,['enabled','instruments','volume']))return null;
 const inspiration=value.inspiration as Record<string,unknown>|null;
 if(!inspiration||inspiration.kind==='teaching-music')return null;
 if(inspiration.kind==='none'?!exactObject(inspiration,['kind']):!keys(inspiration,['kind','entryId'],['variation']))return null;
 return parseComposeSettings(value);
}
export function workContent(value:unknown):WorkContent|null{
 if(!exactObject(value,['id','title','arrangement','settings'])||!cloudId(value.id,'work')||typeof value.title!=='string'||cleanWorkTitle(value.title)!==value.title)return null;
 const arrangement=cloudArrangement(value.arrangement),settings=cloudSettings(value.settings);
 return arrangement&&settings&&arrangement.id===value.id?{id:value.id,title:value.title,arrangement,settings}:null;
}
export function uploadRequest(value:unknown){
 if(!keys(value,['source','bytes','checksum'],['selection']))return null;
 const input=value as Record<string,unknown>;
 if(!isSoundSource(input.source))return null;
 const source=input.source;
 if(!['source','file','recording'].some(prefix=>cloudId(source.id,prefix))
  ||!exactObject(input.source,['id','kind','label','durationMs','mimeType','provenance'])
  ||!exactObject(input.source.provenance,['recordedBy','recordedOn','place','group','provenanceUrl'])
  ||!['local-recording','local-file'].includes(input.source.kind)||missingProvenance(input.source).length
  ||!Number.isInteger(input.bytes)||(input.bytes as number)<=0||(input.bytes as number)>MAX_UPLOAD_BYTES||!fingerprint(input.checksum))return null;
 if([source.label,...Object.values(source.provenance)].some(text=>text!==null&&(typeof text!=='string'||[...text].length>20)))return null;
 if(source.mimeType.length>96||! /^(?:audio\/[\w.+-]+|video\/(?:mp4|webm)|application\/(?:octet-stream|ogg))(?:;\s*codecs=["\w,. -]+)?$/.test(source.mimeType))return null;
 const day=source.provenance.recordedOn!;
 if(source.provenance.provenanceUrl!==null||!/^\d{4}-\d\d-\d\d$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)return null;
 if(input.selection!==undefined&&!sourceSelection(input.selection))return null;
 return {source,bytes:input.bytes as number,checksum:input.checksum,selection:input.selection as {startMs:number;endMs:number}|undefined};
}
export function sourceSelection(value:unknown):value is {startMs:number;endMs:number}{
 return exactObject(value,['startMs','endMs'])&&Number.isInteger(value.startMs)&&Number.isInteger(value.endMs)
  &&(value.startMs as number)>=0&&(value.endMs as number)<=60_000&&(value.endMs as number)-(value.startMs as number)>=200
  &&(value.endMs as number)-(value.startMs as number)<=45_000;
}
export function confirmed(value:unknown):value is Confirmation{
 return exactObject(value,['listened','suitableForChildren','statementVersion'])&&value.listened===true&&value.suitableForChildren===true&&value.statementVersion===CONFIRMATION_VERSION;
}
export const workEtag=(id:string,revision:number)=>`"${id}:r${revision}"`;
export function parseWorkRecord(value:unknown):WorkRecord|null{
 if(!keys(value,['id','title','arrangement','settings','revision','state','savedRevision','updatedAt']))return null;
 const raw=value as WorkRecord;
 return workContent({id:raw.id,title:raw.title,arrangement:raw.arrangement,settings:raw.settings})&&Number.isSafeInteger(raw.revision)&&raw.revision>0
  &&['draft','saved'].includes(raw.state)&&(raw.savedRevision===null||Number.isSafeInteger(raw.savedRevision)&&raw.savedRevision>0&&raw.savedRevision<=raw.revision)&&isoDate(raw.updatedAt)?raw:null;
}
export function parsePlayback(value:unknown):Playback|null{
 if(!exactObject(value,['url','expiresAt'])||typeof value.url!=='string'||!isoDate(value.expiresAt))return null;
 try{const url=new URL(value.url);return url.protocol==='https:'&&!url.username&&!url.password?value as Playback:null;}catch{return null;}
}
export function parseSourceView(value:unknown):SourceView|null{
 if(!exactObject(value,['source','status','checksum','analysis','playback','failure']))return null;
 return isSoundSource(value.source)&&['uploading','queued','processing','ready','failed','disabled'].includes(value.status as string)&&fingerprint(value.checksum)
  &&(value.analysis===null||isSoundAnalysis(value.analysis))&&(value.playback===null||!!parsePlayback(value.playback))
  &&(value.failure===null||typeof value.failure==='string'&&value.failure.length<128)?value as SourceView:null;
}
export function parseRenderView(value:unknown):RenderView|null{
 if(!exactObject(value,['workId','workRevision','status','audioAssetId','playback','durationMs','failure','retryAfterSeconds']))return null;
 return cloudId(value.workId,'work')&&Number.isSafeInteger(value.workRevision)&&(value.workRevision as number)>0
  &&['queued','processing','ready','failed'].includes(value.status as string)&&(value.audioAssetId===null||uuid(value.audioAssetId))
  &&(value.playback===null||!!parsePlayback(value.playback))&&(value.durationMs===null||typeof value.durationMs==='number'&&value.durationMs>0&&value.durationMs<92_000)
  &&(value.failure===null||typeof value.failure==='string'&&value.failure.length<128)&&typeof value.retryAfterSeconds==='number'&&value.retryAfterSeconds>0?value as RenderView:null;
}
export function parseShareView(value:unknown):ShareView|null{
 if(!exactObject(value,['status','workRevision','url','publishedAt']))return null;
 return ['none','pending-render','published','revoked'].includes(value.status as string)&&(value.workRevision===null||Number.isSafeInteger(value.workRevision))
  &&(value.url===null||typeof value.url==='string'&&/^https:\/\//.test(value.url))&&(value.publishedAt===null||isoDate(value.publishedAt))?value as ShareView:null;
}
export function parsePublishedWork(value:unknown):PublishedWorkView|null{
 if(!exactObject(value,['title','publishedAt','audio'])||!exactObject(value.audio,['durationMs','playback']))return null;
 return typeof value.title==='string'&&cleanWorkTitle(value.title)===value.title&&isoDate(value.publishedAt)
  &&typeof value.audio.durationMs==='number'&&value.audio.durationMs>0&&value.audio.durationMs<92_000&&parsePlayback(value.audio.playback)?value as PublishedWorkView:null;
}
export function parseWorkSummary(value:unknown):WorkSummary|null{
 if(!exactObject(value,['id','title','revision','state','savedRevision','updatedAt']))return null;
 return cloudId(value.id,'work')&&typeof value.title==='string'&&cleanWorkTitle(value.title)===value.title&&Number.isSafeInteger(value.revision)&&(value.revision as number)>0
  &&['draft','saved'].includes(value.state as string)&&(value.savedRevision===null||Number.isSafeInteger(value.savedRevision)&&(value.savedRevision as number)>0&&(value.savedRevision as number)<=(value.revision as number))&&isoDate(value.updatedAt)?value as WorkSummary:null;
}
export function parseLibraryEntry(value:unknown):LibraryEntry|null{
 if(!exactObject(value,['entryId','sourceId','kind','scope','unit','source','mine','confirmation'])||!exactObject(value.confirmation,['confirmedAt','sourceChecksum','statementVersion']))return null;
 const source=parseSourceView(value.source),unit=value.unit===null?null:parseSoundUnitDraft(value.unit);
 return uuid(value.entryId)&&source&&value.sourceId===source.source.id&&typeof value.mine==='boolean'&&['private','teachers'].includes(value.scope as string)
  &&(value.kind==='source'?value.unit===null:value.kind==='sound-unit'&&unit&&unit.sourceId===value.sourceId)
  &&isoDate(value.confirmation.confirmedAt)&&fingerprint(value.confirmation.sourceChecksum)&&value.confirmation.statementVersion===CONFIRMATION_VERSION?value as LibraryEntry:null;
}
export function parsePage<T>(value:unknown,parse:(item:unknown)=>T|null):{items:T[];nextCursor:string|null}|null{
 if(!exactObject(value,['items','nextCursor'])||!Array.isArray(value.items)||value.items.length>50||!(value.nextCursor===null||typeof value.nextCursor==='string'&&/^\d{1,6}$/.test(value.nextCursor)))return null;
 const items=value.items.map(parse);return items.every(item=>item!==null)?{items:items as T[],nextCursor:value.nextCursor}:null;
}
