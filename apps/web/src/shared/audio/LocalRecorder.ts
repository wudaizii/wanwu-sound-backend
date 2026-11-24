// Microphone recording kept on this device. Nothing here uploads; the caller decides what to do with the Blob.
export type RecorderFailure='insecure'|'unsupported'|'denied'|'no-device'|'failed'|'too-short';
export class RecorderError extends Error{readonly reason:RecorderFailure;constructor(reason:RecorderFailure){super(reason);this.reason=reason;}}

const MIME_CANDIDATES=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'];

export function recorderSupport():'ok'|'insecure'|'unsupported'{
 if(typeof window==='undefined')return 'unsupported';
 if(!window.isSecureContext)return 'insecure';
 if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')return 'unsupported';
 return 'ok';
}

export class LocalRecorder{
 private stream:MediaStream|null=null;
 private recorder:MediaRecorder|null=null;
 private chunks:Blob[]=[];
 private timer:ReturnType<typeof setTimeout>|undefined;
 private startedAt=0;
 private settle:{resolve:(blob:Blob)=>void;reject:(error:RecorderError)=>void}|null=null;

 async start(maxMs:number){
  const support=recorderSupport();
  if(support!=='ok')throw new RecorderError(support);
  try{
   // Nature recordings: keep the raw signal; speech processing would remove what children are listening for.
   this.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  }catch(error){
   const name=(error as DOMException)?.name;
   throw new RecorderError(name==='NotAllowedError'||name==='SecurityError'?'denied':name==='NotFoundError'||name==='OverconstrainedError'?'no-device':'failed');
  }
  const mimeType=MIME_CANDIDATES.find(type=>MediaRecorder.isTypeSupported?.(type));
  this.chunks=[];
  this.recorder=new MediaRecorder(this.stream,mimeType?{mimeType}:undefined);
  this.recorder.ondataavailable=event=>{if(event.data.size)this.chunks.push(event.data);};
  this.recorder.onstop=()=>{
   const elapsed=performance.now()-this.startedAt,type=this.recorder?.mimeType||mimeType||'audio/webm';
   this.releaseStream();
   const settle=this.settle;this.settle=null;
   if(!settle)return;
   if(elapsed<400||!this.chunks.length)settle.reject(new RecorderError('too-short'));
   else settle.resolve(new Blob(this.chunks,{type}));
  };
  this.startedAt=performance.now();
  this.recorder.start(250);
  this.timer=setTimeout(()=>{void this.stop().catch(()=>{});},maxMs);
 }
 elapsedMs(){return this.recorder?.state==='recording'?performance.now()-this.startedAt:0;}
 stop():Promise<Blob>{
  clearTimeout(this.timer);
  const recorder=this.recorder;
  if(!recorder||recorder.state==='inactive')return Promise.reject(new RecorderError('failed'));
  return new Promise((resolve,reject)=>{this.settle={resolve,reject};recorder.stop();});
 }
 /** Abandon without producing a recording (unmount, cancel). */
 cancel(){
  clearTimeout(this.timer);this.settle=null;
  if(this.recorder&&this.recorder.state!=='inactive'){this.recorder.onstop=null;this.recorder.stop();}
  this.releaseStream();
 }
 private releaseStream(){this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;}
}
