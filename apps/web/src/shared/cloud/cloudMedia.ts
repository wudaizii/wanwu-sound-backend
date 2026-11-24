import {parseSourceView,MAX_UPLOAD_BYTES} from '@wanwu-v2/contracts/cloud';
import type {SourceView,UploadIntent} from '@wanwu-v2/contracts/cloud';
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import type {SoundSource} from '@wanwu-v2/contracts/sound';
import {missingProvenance} from '@wanwu-v2/contracts/sound';
import {CookieAccountClient,AccountError} from '../account/accountClient';
import {sessionArchive} from '../creation/sourceArchive';
import {workSession} from '../creation/workSession';
import {decodeAudio} from '../audio/loadAudio';

export class CloudMedia{
 epoch=0;
 private readonly api:CookieAccountClient;private accountId:string|null=null;
 private pending=new Map<string,Promise<SourceView>>();
 private canonical=new Set<string>();
 private ready=new Map<string,SourceView>();
 constructor(api:CookieAccountClient){this.api=api;}
 setAccount(id:string|null){this.accountId=id;this.pending.clear();this.canonical.clear();this.ready.clear();}
 private same(id:string){if(this.accountId!==id)throw new AccountError('needs-account');}
 async source(id:string){const result=await this.api.business(`/api/v1/sources/${encodeURIComponent(id)}`),view=parseSourceView(result.data);
  if(!view)throw new AccountError('bad-response');return view;}
 private async untilReady(id:string,account:string,onStatus:(message:string)=>void){
  for(let i=0;i<90;i++){
   this.same(account);const view=await this.source(id);
   if(view.status==='ready')return view;
   if(view.status==='failed'||view.status==='disabled')throw new Error(`声音处理未完成：${view.failure??view.status}`);
   onStatus('正在校验音频并生成试听文件…');await new Promise<void>(done=>setTimeout(done,2000));
  }throw new Error('音频仍在处理中，可以稍后重试；原件和本地创作仍保留。');
 }
 private put(intent:UploadIntent,blob:Blob,notify:(message:string)=>void){
  return new Promise<void>((resolve,reject)=>{
   const url=new URL(intent.uploadUrl);if(url.protocol!=='https:'||url.username||url.password){reject(new AccountError('bad-response'));return;}
   const xhr=new XMLHttpRequest();xhr.open('PUT',intent.uploadUrl);xhr.timeout=120_000;
   for(const [key,value] of Object.entries(intent.requiredHeaders))if(key.toLowerCase()!=='content-length')xhr.setRequestHeader(key,value);
   xhr.upload.onprogress=event=>{if(event.lengthComputable)notify(`上传原件 ${Math.round(event.loaded/event.total*100)}%…`);};
   xhr.onload=()=>xhr.status>=200&&xhr.status<300||xhr.status===409?resolve():reject(new AccountError(xhr.status===403?'forbidden':'network',xhr.status));
   xhr.onerror=()=>reject(new AccountError('network'));xhr.ontimeout=()=>reject(new AccountError('timeout'));xhr.send(blob);
  });
 }
 async load(id:string){
  const account=this.accountId;if(!account)throw new AccountError('needs-account');
  for(let attempt=0;attempt<2;attempt++){
   const view=await this.source(id);this.same(account);
   if(view.status!=='ready'||!view.playback)throw new Error('这个声音尚未就绪或已停止授权。');
   const response=await fetch(view.playback.url,{credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30_000)});
   if(response.status===403&&attempt===0)continue;if(!response.ok)throw new AccountError('network');
   const bytes=await response.arrayBuffer();if(bytes.byteLength>12*1024*1024)throw new AccountError('bad-response');
   const buffer=await decodeAudio(bytes);this.same(account);
   sessionArchive.save(view.source,buffer);if(view.source.kind!=='example')sessionArchive.claim(id,account);
   this.canonical.add(id);
   this.epoch++;
   this.ready.set(id,view);
   workSession.registerSources([view.source]);return {view,buffer};
  }throw new AccountError('network');
 }
 async prepare(arrangement:Arrangement,onStatus:(message:string)=>void){
  const account=this.accountId;if(!account)throw new AccountError('needs-account');const views=new Map<string,SourceView>();
  for(const id of new Set(arrangement.units.map(unit=>unit.sourceId))){
   this.same(account);let pending=this.pending.get(id);
   if(!pending){pending=this.ensure(id,account,onStatus).finally(()=>{if(this.pending.get(id)===pending)this.pending.delete(id);});this.pending.set(id,pending);}
   views.set(id,await pending);
  }
  this.same(account);return views;
 }
 private async ensure(id:string,account:string,notify:(message:string)=>void){
  const known=this.ready.get(id);if(known&&sessionArchive.buffer(id))return known;
  let existing:SourceView|null=null;
  try{existing=await this.source(id);}catch(error){if(!(error instanceof AccountError)||error.status!==404)throw error;}
  this.same(account);
  if(existing?.status==='ready'&&this.canonical.has(id)&&sessionArchive.buffer(id))return existing;
  if(!existing){
   const excerpt=/^(example:[\w-]+)#(\d+)-(\d+)$/.exec(id);
   if(excerpt){await this.api.business(`/api/v1/sources/${encodeURIComponent(id)}`,'PUT',{parentId:excerpt[1],selection:{startMs:Number(excerpt[2]),endMs:Number(excerpt[3])}});}
   else{
    const source:SoundSource|null=workSession.source(id)??sessionArchive.list().find(item=>item.id===id)??null,original=sessionArchive.original(id);
    if(!source||!original)throw new Error('找不到这份声音的原件，请重新选择原始文件；当前创作不会被清空。');
    if(original.rawDurationMs&&original.rawDurationMs>45_500)throw new Error('首版云端仅接受不超过 45.5 秒的普通原件。当前长文件的本页剪辑仍保留，请另选符合限制的原始录音；不会拿重编码文件冒充原件。');
    if(missingProvenance(source).length)throw new Error('请先补齐声音名称、记录人昵称、日期和大致地点，再保存到云端。');
    if(original.blob.size>MAX_UPLOAD_BYTES)throw new Error('原始文件超过 20 MiB，暂不能云端保存。');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await original.blob.arrayBuffer())),byte=>byte.toString(16).padStart(2,'0')).join('');
    this.same(account);
    const result=await this.api.business<{status:string;intent?:UploadIntent}>(`/api/v1/sources/${encodeURIComponent(id)}`,'PUT',
     {source,bytes:original.blob.size,checksum:hash,...(original.selection?{selection:original.selection}:{})});
    if(result.data.intent){
     notify('正在上传原始录音…');await this.put(result.data.intent,original.blob,notify);this.same(account);
     await this.api.business(`/api/v1/sources/${encodeURIComponent(id)}/complete`,'POST',{uploadId:result.data.intent.uploadId});
    }
   }
  }else if(existing.status==='uploading'){
   // A previous PUT may have finished before the completion response was lost.
   const original=sessionArchive.original(id),source=workSession.source(id)??sessionArchive.list().find(item=>item.id===id);
   if(!original||!source)throw new Error('上传尚未完成，请在保留原始文件的页面重试。');
   if(original.rawDurationMs&&original.rawDurationMs>45_500)throw new Error('普通原件超过 45.5 秒，暂不能云端保存；本页剪辑仍保留。');
   const bytes=await original.blob.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   this.same(account);
   const renewed=await this.api.business<{intent:UploadIntent}>(`/api/v1/sources/${encodeURIComponent(id)}`,'PUT',{source,bytes:original.blob.size,checksum:hash,...(original.selection?{selection:original.selection}:{})});
   await this.put(renewed.data.intent,original.blob,notify);this.same(account);await this.api.business(`/api/v1/sources/${encodeURIComponent(id)}/complete`,'POST',{uploadId:renewed.data.intent.uploadId});
  }
  await this.untilReady(id,account,notify);const loaded=await this.load(id);return loaded.view;
 }
}
