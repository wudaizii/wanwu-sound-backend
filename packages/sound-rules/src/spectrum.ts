// Spectral centroid ("how bright") of one window, with a small in-place radix-2 FFT. Pure maths, no audio API.

function fft(re:Float64Array,im:Float64Array){
 const n=re.length;
 for(let i=1,j=0;i<n;i++){
  let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;
  if(i<j){[re[i],re[j]]=[re[j]!,re[i]!];[im[i],im[j]]=[im[j]!,im[i]!];}
 }
 for(let size=2;size<=n;size<<=1){
  const angle=-2*Math.PI/size,wr=Math.cos(angle),wi=Math.sin(angle);
  for(let start=0;start<n;start+=size){
   let cr=1,ci=0;
   for(let k=0;k<size/2;k++){
    const a=start+k,b=a+size/2;
    const tr=re[b]!*cr-im[b]!*ci,ti=re[b]!*ci+im[b]!*cr;
    re[b]=re[a]!-tr;im[b]=im[a]!-ti;re[a]=re[a]!+tr;im[a]=im[a]!+ti;
    [cr,ci]=[cr*wr-ci*wi,cr*wi+ci*wr];
   }
  }
 }
}

/**
 * Power-weighted centroid in Hz of `samples[from … from+size)` (Hann window; zero-padded past the end), ignoring rumble
 * below `ignoreBelowHz` (wind, handling noise). 0 for a silent window.
 */
export function spectralCentroid(samples:Float32Array,from:number,size:number,sampleRate:number,ignoreBelowHz:number){
 const re=new Float64Array(size),im=new Float64Array(size);
 for(let i=0;i<size;i++){const value=samples[from+i]??0;re[i]=value*(.5-.5*Math.cos(2*Math.PI*i/(size-1)));}
 fft(re,im);
 let weighted=0,total=0;
 for(let bin=Math.max(1,Math.ceil(ignoreBelowHz*size/sampleRate));bin<size/2;bin++){
  const power=re[bin]!*re[bin]!+im[bin]!*im[bin]!;weighted+=power*bin*sampleRate/size;total+=power;
 }
 return total>0?weighted/total:0;
}
