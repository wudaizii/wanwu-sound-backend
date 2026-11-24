import {parseArrangement} from '@wanwu-v2/contracts/arrangement';
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import {parseComposeSettings} from '@wanwu-v2/contracts/work';
import type {ComposeSettings} from '@wanwu-v2/contracts/work';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import {isTextbookTrack} from '@wanwu-v2/contracts/textbook';
import {analyseSamples} from '@wanwu-v2/sound-rules/analysis';
import {assignParts,backgroundPlan} from '@wanwu-v2/sound-rules/background';
import {MIX_RULES,RULE_VERSIONS} from '@wanwu-v2/sound-rules/rules';
import {planClip,shapeKey} from '@wanwu-v2/sound-rules/shaping';
import {renderShaped} from './shaping.ts';
import {renderBackground} from './background.ts';
import {LOCAL_INSTRUMENTS} from './instruments.ts';
import {pieceSeconds,planPlayback,timedEvents} from './timeline.ts';
import {RENDER_SAMPLE_RATE} from './pcm.ts';
import {isSoundAnalysis} from '@wanwu-v2/contracts/sound';
import type {SoundAnalysis} from '@wanwu-v2/contracts/sound';

export {RENDERER_VERSION,TIMBRE_VERSION} from './version.ts';
export type RenderInput={arrangement:Arrangement;settings:ComposeSettings;textbook:TextbookTrack|null;rules:typeof RULE_VERSIONS;
 /** Internal worker-only bounds, derived from a hash-verified bundled catalogue; never accepted in work JSON. */
 sourceLimits?:Record<string,number>;
 /** Worker-only facts from an immutable server snapshot, after verifying each derivative's exact SHA-256. */
 sourceFacts?:Record<string,{checksum:string;analysis:SoundAnalysis}>};
export type SourceLoader=(id:string)=>Promise<AudioBuffer>;

/** Identity/asset authorization belongs to the API; this is the bounded offline rendering boundary. */
function validate(input:RenderInput){
 if(!parseArrangement(input.arrangement)||!parseComposeSettings(input.settings))throw new Error('invalid-work');
 if(!input.rules||Object.entries(RULE_VERSIONS).some(([key,value])=>input.rules[key as keyof typeof RULE_VERSIONS]!==value))throw new Error('renderer-incompatible');
 const {inspiration,background}=input.settings;
 if(inspiration.kind==='teaching-music')throw new Error('not-open');
 if(input.textbook&&(!isTextbookTrack(input.textbook)||!Number.isFinite(input.textbook.tempoBpm)))throw new Error('invalid-textbook');
 if(inspiration.kind==='textbook'&&input.textbook?.id!==inspiration.entryId)throw new Error('missing-textbook');
 if(background.instruments.some(id=>!LOCAL_INSTRUMENTS.some(instrument=>instrument.id===id)))throw new Error('unknown-instrument');
 if(!input.arrangement.events.length)throw new Error('empty-work');
 if(input.sourceLimits&&Object.values(input.sourceLimits).some(value=>!Number.isFinite(value)||value<45.5||value>60))throw new Error('invalid-source-limit');
 if(input.sourceFacts){const ids=new Set(input.arrangement.units.map(unit=>unit.sourceId));
  if(Object.keys(input.sourceFacts).length!==ids.size||[...ids].some(id=>{
   const fact=input.sourceFacts![id];return !fact||!/^[a-f0-9]{64}$/.test(fact.checksum)||!isSoundAnalysis(fact.analysis)||fact.analysis.rules!==RULE_VERSIONS.analysis
    ||fact.analysis.durationMs>(input.sourceLimits?.[id]??45.5)*1000;
  }))throw new Error('invalid-source-facts');
 }
}

const checkBuffer=(buffer:AudioBuffer,limit=45.5)=>{
 if(buffer.sampleRate!==RENDER_SAMPLE_RATE||buffer.numberOfChannels<1||buffer.numberOfChannels>2
  ||buffer.duration<=0||buffer.duration>limit)throw new Error('invalid-source');
};

/** Build canonical timing from actual samples, never from client-supplied analysis. Choices and positions stay intact. */
async function canonicalArrangement(input:RenderInput,load:SourceLoader,release:()=>void|Promise<void>):Promise<Arrangement>{
 const {arrangement,sourceLimits:limits={},sourceFacts:facts}=input;
 const analyses=new Map<string,ReturnType<typeof analyseSamples>>();
 for(const id of new Set(arrangement.units.map(unit=>unit.sourceId))){
  if(facts){analyses.set(id,facts[id]!.analysis);continue;}
  const buffer=await load(id);checkBuffer(buffer,limits[id]);
  analyses.set(id,analyseSamples(Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i)),buffer.sampleRate));
  await release();
 }
 const result={...arrangement,units:arrangement.units.map(unit=>({...unit,analysis:analyses.get(unit.sourceId)!}))};
 for(const item of planPlayback(result))if(item.clip.endMs>analyses.get(item.sourceId)!.durationMs)throw new Error('invalid-source-clip');
 return result;
}

/** One clip at a time into one accumulator: memory does not grow with the number of placed events. */
export async function renderWork(input:RenderInput,load:SourceLoader,release:()=>void|Promise<void>=()=>{}):Promise<AudioBuffer>{
 validate(input);
 const arrangement=await canonicalArrangement(input,load,release),seconds=pieceSeconds(arrangement);
 if(seconds>90)throw new Error('work-too-long');
 const frames=Math.ceil(seconds*RENDER_SAMPLE_RATE),ctx=new OfflineAudioContext(2,frames,RENDER_SAMPLE_RATE);
 const sum=ctx.createBuffer(2,frames,RENDER_SAMPLE_RATE);
 const groups=new Map<string,ReturnType<typeof planPlayback>>();
 for(const item of planPlayback(arrangement)){
  const key=JSON.stringify([item.sourceId,shapeKey(item.shape),item.clip.startMs,item.clip.endMs]);
  const group=groups.get(key);if(group)group.push(item);else groups.set(key,[item]);
 }
 const accumulate=async(group:ReturnType<typeof planPlayback>)=>{
  const item=group[0]!;
  const source=await load(item.sourceId);checkBuffer(source,input.sourceLimits?.[item.sourceId]);
  if(input.sourceFacts&&Math.abs(source.duration*1000-input.sourceFacts[item.sourceId]!.analysis.durationMs)>.5)throw new Error('source-facts-mismatch');
  const shaped=await renderShaped(source,planClip(item.shape,item.clip,item.analysis,item.sourceId));
  // Repeated identical clips are rendered once, accumulated at each original position, then released.
  for(const placement of group){
   const offset=Math.round(placement.startSeconds*RENDER_SAMPLE_RATE),length=Math.min(shaped.length,frames-offset);
   for(let c=0;c<2;c++){
    const into=sum.getChannelData(c),from=shaped.getChannelData(Math.min(c,shaped.numberOfChannels-1));
    for(let i=0;i<length;i++)into[offset+i]=into[offset+i]!+from[i]!;
   }
  }
 };
 for(const group of groups.values()){await accumulate(group);await release();}
 const master=ctx.createGain();master.gain.value=MIX_RULES.childGain;
 const limiter=ctx.createDynamicsCompressor(),rules=MIX_RULES.limiter;
 limiter.threshold.value=rules.thresholdDb;limiter.knee.value=rules.kneeDb;limiter.ratio.value=rules.ratio;
 limiter.attack.value=rules.attackSeconds;limiter.release.value=rules.releaseSeconds;
 master.connect(limiter).connect(ctx.destination);
 const child=ctx.createBufferSource();child.buffer=sum;child.connect(master);child.start(0);
 const {background,inspiration}=input.settings;
 if(background.enabled&&background.volume>0){
  const mood=arrangement.mood;
  const plan=backgroundPlan({seconds,seed:arrangement.id,sounding:timedEvents(arrangement).map(({start,end})=>({start,end})),
   mood:mood?.kind==='preset'?mood.id:mood?.kind==='custom'?mood.nearest:null,
   textbook:inspiration.kind==='textbook'&&input.textbook?{...input.textbook,variation:inspiration.variation??'original'}:null});
  const chosen=background.instruments.map(id=>LOCAL_INSTRUMENTS.find(instrument=>instrument.id===id)!);
  const under=await renderBackground(plan,assignParts(chosen),Object.fromEntries(chosen.map(instrument=>[instrument.id,instrument.recipe])));
  const node=ctx.createBufferSource(),gain=ctx.createGain();node.buffer=under;
  gain.gain.value=background.volume*MIX_RULES.backgroundMaxGain;node.connect(gain).connect(master);node.start(0);
 }
 return ctx.startRendering();
}
