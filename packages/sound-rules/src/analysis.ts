// 声音体检: what is in a recording, measured with fixed rules (no model). It finds the single sounds (split first at
// quiet gaps, then long stretches at clear dips in loudness, so the chirps in a birdsong are found too), sorts the
// recording into one sound / a series of sounds / sound that runs together, and measures how long one sound
// typically lasts, how loud and how bright it is. Pure: samples in, a SoundAnalysis out.
import type {DurationChoice,PitchChoice,SoundAnalysis,SoundKind} from '@wanwu-v2/contracts/sound';
import {ANALYSIS_RULES} from './rules.ts';
import type {AnalysisRules} from './rules.ts';
import {spectralCentroid} from './spectrum.ts';

const FLOOR_DB=-120;
const toDb=(amplitude:number)=>amplitude>0?Math.max(FLOOR_DB,20*Math.log10(amplitude)):FLOOR_DB;
const round1=(value:number)=>Math.round(value*10)/10;
const median=(values:readonly number[])=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)]??0;};

function mono(channels:readonly Float32Array[]){
 if(channels.length===1)return channels[0]!;
 const length=channels[0]?.length??0,out=new Float32Array(length);
 for(const channel of channels)for(let i=0;i<length;i++)out[i]!+=channel[i]!/channels.length;
 return out;
}

/** Loudness per frame (dB), lightly smoothed so one rough frame does not split a sound. */
function envelope(samples:Float32Array,frameLength:number,smooth:number){
 const raw:number[]=[];
 for(let from=0;from<samples.length;from+=frameLength){
  let sum=0;const to=Math.min(samples.length,from+frameLength);
  for(let i=from;i<to;i++)sum+=samples[i]!*samples[i]!;
  raw.push(sum/Math.max(1,to-from));
 }
 const half=Math.floor(smooth/2);
 return raw.map((_,i)=>{let sum=0,count=0;for(let k=i-half;k<=i+half;k++)if(raw[k]!==undefined){sum+=raw[k]!;count++;}return 10*Math.log10(Math.max(1e-12,sum/count));});
}

type Run={from:number;to:number;peak:number};
const peakOf=(db:readonly number[],from:number,to:number)=>Math.max(FLOOR_DB,...db.slice(from,to));
/** Sounding frames grouped into runs; gaps shorter than the merge gap do not separate sounds. */
function soundingRuns(db:readonly number[],threshold:number,mergeFrames:number){
 const runs:Run[]=[];
 db.forEach((value,index)=>{
  if(value<threshold)return;
  const last=runs.at(-1);
  if(last&&index-last.to<=mergeFrames){last.to=index+1;last.peak=Math.max(last.peak,value);}
  else runs.push({from:index,to:index+1,peak:value});
 });
 return runs;
}
/** A long run split at its clear dips: after a peak, a fall of `dip` dB and a rise of `dip` dB again starts a new sound. */
function splitAtDips(db:readonly number[],run:Run,dip:number):Run[]{
 const parts:Run[]=[];let start=run.from,top=db[run.from]!,low=Infinity,lowAt=run.from,falling=false;
 for(let i=run.from;i<run.to;i++){
  const value=db[i]!;
  if(!falling){if(value>top)top=value;else if(value<top-dip){falling=true;low=value;lowAt=i;}}
  else if(value<low){low=value;lowAt=i;}
  else if(value>low+dip){parts.push({from:start,to:lowAt,peak:peakOf(db,start,lowAt)});start=lowAt;top=value;falling=false;}
 }
 parts.push({from:start,to:run.to,peak:peakOf(db,start,run.to)});
 return parts;
}

function kindOf(units:readonly Run[],mainSeconds:number,quietRatio:number,rules:AnalysisRules):SoundKind{
 const {oneMaxSeconds,oneDominanceDb,seriesQuietRatio}=rules.kind;
 const peaks=units.map(unit=>unit.peak).sort((a,b)=>b-a);
 if(mainSeconds<=oneMaxSeconds&&(units.length===1||peaks[0]!-peaks[1]!>=oneDominanceDb))return 'one';
 return units.length>1&&quietRatio>=seriesQuietRatio?'series':'texture';
}
const lengthBandOf=(seconds:number,rules:AnalysisRules):DurationChoice=>
 seconds<rules.unitLength.shortBelowSeconds?'short':seconds>rules.unitLength.longAboveSeconds?'long':'medium';
const bandOf=(hz:number,rules:AnalysisRules):PitchChoice=>
 hz<rules.brightness.lowBelowHz?'low':hz>rules.brightness.highAboveHz?'high':'mid';

export function analyseSamples(channels:readonly Float32Array[],sampleRate:number,rules:AnalysisRules=ANALYSIS_RULES):SoundAnalysis{
 const samples=mono(channels),frame=rules.frameSeconds,frameLength=Math.max(1,Math.round(frame*sampleRate));
 const db=envelope(samples,frameLength,rules.smoothFrames);
 const durationMs=Math.round(samples.length/sampleRate*1000),ms=(index:number)=>Math.min(durationMs,Math.round(index*frame*1000));
 const loudest=Math.max(FLOOR_DB,...db);
 const empty:SoundAnalysis={rules:rules.version,durationMs,silent:true,main:null,units:[],kind:'one',unitMs:durationMs,lengthBand:'medium',
  loudnessDb:round1(loudest),peakDb:FLOOR_DB,brightnessHz:0,band:'mid'};
 if(loudest<rules.silence.floorDb)return empty;

 const threshold=Math.max(loudest-rules.silence.belowPeakDb,rules.silence.floorDb),u=rules.units;
 const runs=soundingRuns(db,threshold,Math.round(u.mergeGapSeconds/frame)).filter(run=>(run.to-run.from)*frame>=u.minSeconds);
 if(!runs.length)return empty;
 const units=runs.flatMap(run=>(run.to-run.from)*frame>u.splitAboveSeconds?splitAtDips(db,run,u.splitDipDb):[run])
  .filter(unit=>(unit.to-unit.from)*frame>=u.minSeconds);
 const first=runs[0]!.from,last=runs.at(-1)!.to,mainSeconds=(last-first)*frame;
 const quiet=runs.slice(1).reduce((sum,run,i)=>sum+(run.from-runs[i]!.to),0)*frame;
 const unitSeconds=median(units.map(unit=>(unit.to-unit.from)*frame));

 // Loudness and peak of the sounding part only, so silence around it does not count.
 let power=0,counted=0,peak=0;const active:number[]=[];
 for(let f=first;f<last;f++)if(db[f]!>=threshold){power+=10**(db[f]!/10);counted++;active.push(f);}
 for(let i=first*frameLength;i<Math.min(samples.length,last*frameLength);i++)peak=Math.max(peak,Math.abs(samples[i]!));

 // Brightness: median spectral centroid over the loud frames (background noise between sounds does not count).
 const {fftSize,maxFrames,withinDb,ignoreBelowHz}=rules.brightness,centroids:number[]=[];
 const loud=active.filter(f=>db[f]!>=loudest-withinDb),step=Math.max(1,loud.length/maxFrames);
 for(let k=0;k<loud.length&&centroids.length<maxFrames;k+=step){
  const centre=(loud[Math.floor(k)]!+.5)*frameLength;
  centroids.push(spectralCentroid(samples,Math.max(0,Math.round(centre-fftSize/2)),fftSize,sampleRate,ignoreBelowHz));
 }
 const brightnessHz=Math.round(median(centroids));

 const kept=[...units].sort((a,b)=>b.peak-a.peak).slice(0,u.maxCount).sort((a,b)=>a.from-b.from);
 return {
  rules:rules.version,durationMs,silent:false,
  main:{startMs:ms(first),endMs:ms(last)},
  units:kept.map(unit=>({startMs:ms(unit.from),endMs:ms(unit.to),peakDb:round1(unit.peak)})),
  kind:kindOf(units,mainSeconds,quiet/Math.max(frame,mainSeconds),rules),
  unitMs:Math.round(unitSeconds*1000),lengthBand:lengthBandOf(unitSeconds,rules),
  loudnessDb:round1(10*Math.log10(power/Math.max(1,counted))),peakDb:round1(toDb(peak)),
  brightnessHz,band:bandOf(brightnessHz,rules),
 };
}
