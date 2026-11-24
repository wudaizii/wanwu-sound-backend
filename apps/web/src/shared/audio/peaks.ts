// Waveform drawing helper: normalised peak per bin (0–1). Not a sound rule — the shaping rules live in
// @wanwu-v2/sound-rules.

export function computePeaks(channels:readonly Float32Array[],bins:number):number[]{
 const length=channels[0]?.length??0;
 if(!length||bins<=0)return Array.from({length:Math.max(0,bins)},()=>0);
 const peaks=new Array<number>(bins).fill(0),step=length/bins;
 for(let bin=0;bin<bins;bin++){
  const from=Math.floor(bin*step),to=Math.max(from+1,Math.floor((bin+1)*step));
  let peak=0;
  for(const channel of channels)for(let i=from;i<to&&i<length;i+=Math.max(1,Math.floor((to-from)/64)))peak=Math.max(peak,Math.abs(channel[i]!));
  peaks[bin]=peak;
 }
 const max=Math.max(...peaks);
 return max>0?peaks.map(value=>value/max):peaks;
}
