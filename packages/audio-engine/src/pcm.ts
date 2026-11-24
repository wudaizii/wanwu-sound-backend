/** Small bounded PCM helpers; RIFF is decoded only after FFmpeg writes a canonical derivative. */
export const RENDER_SAMPLE_RATE=48000;
export type Pcm={sampleRate:number;channels:Float32Array[]};

export function pcm16Wave(channels:readonly Float32Array[],sampleRate=RENDER_SAMPLE_RATE):Uint8Array<ArrayBuffer>{
 const frames=channels[0]?.length??0;
 if(!frames||channels.length>2||channels.some(channel=>channel.length!==frames)
  ||!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000||frames>sampleRate*91)throw new Error('invalid-pcm');
 const bytes=new Uint8Array(44+frames*channels.length*2),view=new DataView(bytes.buffer);
 const word=(at:number,value:string)=>{for(let i=0;i<value.length;i++)bytes[at+i]=value.charCodeAt(i);};
 word(0,'RIFF');view.setUint32(4,bytes.length-8,true);word(8,'WAVE');word(12,'fmt ');
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels.length,true);
 view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*channels.length*2,true);
 view.setUint16(32,channels.length*2,true);view.setUint16(34,16,true);word(36,'data');view.setUint32(40,bytes.length-44,true);
 for(let i=0;i<frames;i++)for(let c=0;c<channels.length;c++){
  const sample=channels[c]![i]!;if(!Number.isFinite(sample))throw new Error('non-finite-pcm');
  const clipped=Math.max(-1,Math.min(1,sample));view.setInt16(44+(i*channels.length+c)*2,Math.round(clipped*(clipped<0?32768:32767)),true);
 }
 return bytes;
}

export function readPcm16Wave(bytes:Uint8Array):Pcm{
 const fail=()=>{throw new Error('invalid-pcm-wave');};
 if(bytes.length<44)return fail();
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const word=(at:number,length:number)=>String.fromCharCode(...bytes.subarray(at,at+length));
 if(word(0,4)!=='RIFF'||word(8,4)!=='WAVE'||view.getUint32(4,true)+8!==bytes.length)return fail();
 let channels=0,sampleRate=0,alignment=0,data:Uint8Array|null=null;
 for(let at=12;at+8<=bytes.length;){
  const size=view.getUint32(at+4,true),start=at+8,end=start+size;
  if(end>bytes.length)return fail();
  if(word(at,4)==='fmt '){
   if(size<16||view.getUint16(start,true)!==1||view.getUint16(start+14,true)!==16)return fail();
   channels=view.getUint16(start+2,true);sampleRate=view.getUint32(start+4,true);alignment=view.getUint16(start+12,true);
  }
  if(word(at,4)==='data'){if(data)return fail();data=bytes.subarray(start,end);}
  at=end+(size%2);
 }
 if(!data||!data.length||channels<1||channels>2||alignment!==channels*2||data.length%alignment
  ||sampleRate<8000||sampleRate>192000||data.length/alignment>sampleRate*91)return fail();
 const samples=new DataView(data.buffer,data.byteOffset,data.byteLength),frames=data.length/alignment;
 const output=Array.from({length:channels},()=>new Float32Array(frames));
 for(let i=0;i<frames;i++)for(let c=0;c<channels;c++)output[c]![i]=samples.getInt16((i*channels+c)*2,true)/32768;
 return {sampleRate,channels:output};
}

export function pcmMetrics(channels:readonly Float32Array[]){
 let peak=0,square=0,count=0;
 for(const channel of channels)for(const sample of channel){
  if(!Number.isFinite(sample))throw new Error('non-finite-pcm');
  peak=Math.max(peak,Math.abs(sample));square+=sample*sample;count++;
 }
 return {peak,rms:Math.sqrt(square/Math.max(1,count)),frames:channels[0]?.length??0};
}
