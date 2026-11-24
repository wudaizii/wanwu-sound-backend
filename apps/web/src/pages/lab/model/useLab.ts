import {useEffect,useMemo,useRef,useState} from 'react';
import type {MoodId} from '@wanwu-v2/contracts/arrangement';
import type {ChosenShape,SoundAnalysis} from '@wanwu-v2/contracts/sound';
import {analyseSamples} from '@wanwu-v2/sound-rules/analysis';
import {assignParts,backgroundPlan} from '@wanwu-v2/sound-rules/background';
import {ANALYSIS_RULES,BACKGROUND_RULES,MIX_RULES,SHAPING_RULES} from '@wanwu-v2/sound-rules/rules';
import {originalGain,planCard} from '@wanwu-v2/sound-rules/shaping';
import {resumeAudio} from '../../../shared/audio/audioContext';
import {decodeAudio,loadAudio} from '../../../shared/audio/loadAudio';
import {renderBackground} from '../../../shared/audio/renderBackground';
import {renderShaped} from '../../../shared/audio/renderShaped';
import {SequencePlayer} from '../../../shared/audio/SequencePlayer';
import {EXAMPLE_TIMEOUT_MS,exampleSounds} from '../../../shared/creation/exampleSounds';
import {fileNameOf,getAt,ruleProblems,setAt} from './ruleTree';
import type {RuleSetName,RuleSets} from './ruleTree';

export type LabSound={id:string;name:string;buffer:AudioBuffer};
export type Listen='original'|'shaped'|'background';
const loaded=():RuleSets=>structuredClone({analysis:ANALYSIS_RULES,shaping:SHAPING_RULES,background:BACKGROUND_RULES,mix:MIX_RULES});
const channels=(buffer:AudioBuffer)=>Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));

/**
 * 调音台: one sound, the rule files being tuned, and listening with them — the original at the common loudness, the
 * card's shaping, or the shaping over the local background. Uses the real planCard / renderShaped / backgroundPlan with
 * the edited rules swapped in. Invalid rules are never used: the last valid analysis and renders stay until fixed.
 */
export function useLab(){
 const [rules,setRules]=useState<RuleSets>(loaded);
 const [sound,setSound]=useState<LabSound|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [shape,setShape]=useState<ChosenShape>({});
 const [mood,setMood]=useState<MoodId|null>(null);
 const [playing,setPlaying]=useState<string|null>(null);
 const [last,setLast]=useState<Listen|null>(null);
 const player=useMemo(()=>new SequencePlayer(setPlaying),[]);
 useEffect(()=>()=>player.stop(),[player]);

 const problems=useMemo(()=>({analysis:ruleProblems('analysis',rules.analysis),shaping:ruleProblems('shaping',rules.shaping),
  background:ruleProblems('background',rules.background),mix:ruleProblems('mix',rules.mix)}),[rules]);
 const valid=Object.values(problems).every(list=>!list.length);
 const lastAnalysis=useRef<SoundAnalysis|null>(null);
 const analysis=useMemo(()=>{
  if(!sound)return null;
  if(problems.analysis.length)return lastAnalysis.current;
  return lastAnalysis.current=analyseSamples(channels(sound.buffer),sound.buffer.sampleRate,rules.analysis);
 },[sound,rules.analysis,problems.analysis]);

 const pick=async(id:string)=>{
  const example=exampleSounds.find(item=>item.id===id);if(!example)return;
  player.stop();setLoading(true);setError(null);
  try{setSound({id,name:example.label,buffer:await loadAudio(example.url,{timeoutMs:EXAMPLE_TIMEOUT_MS})});}
  catch{setError('这段示例声音没加载出来。');}finally{setLoading(false);}
 };
 const upload=async(file:File)=>{
  player.stop();setLoading(true);setError(null);
  try{setSound({id:`upload:${file.name}`,name:file.name,buffer:await decodeAudio(await file.arrayBuffer())});}
  catch{setError('这个文件读不出来。');}finally{setLoading(false);}
 };

 const listen=async(kind:Listen)=>{
  if(!sound||!analysis||!valid)return;
  await resumeAudio();
  const {mix}=rules;
  if(kind==='original'){setLast(kind);return player.play(kind,[{at:0,buffer:sound.buffer}],originalGain(analysis,rules.shaping));}
  const shaped=await renderShaped(sound.buffer,planCard(shape,analysis,'lab',rules.shaping));
  setLast(kind);
  if(kind==='shaped')return player.play(kind,[{at:0,buffer:shaped}],mix.childGain,{limiter:mix.limiter});
  // Over the local background: the shaped sound enters at 1 s; the background is made for exactly that.
  const seconds=Math.max(8,shaped.duration+3),sounding=[{start:1,end:1+shaped.duration}];
  const under=await renderBackground(backgroundPlan({seconds,sounding,mood,textbook:null,seed:'lab'},rules.background,mix),assignParts([]),{});
  return player.play(kind,[{at:1,buffer:shaped},{at:0,buffer:under,layer:'background'}],mix.childGain,
   {length:seconds,layers:{background:.5*mix.backgroundMaxGain},limiter:mix.limiter});
 };
 // A slider moved while something played: hear the change (once the drag settles).
 const replay=useRef(listen);replay.current=listen;
 useEffect(()=>{
  if(!last||!player.activeKey())return;
  const timer=setTimeout(()=>void replay.current(last),350);
  return()=>clearTimeout(timer);
 // Only when the rules, the shape or the mood change.
 },[rules,shape,mood]);

 const set=(name:RuleSetName,path:string[],value:unknown)=>setRules(current=>({...current,[name]:setAt(current[name],path,value)}));
 /** Downloads the rule file once it passes every check; drop it into packages/sound-rules/rules/. */
 const exportFile=(name:RuleSetName)=>{
  if(problems[name].length)return;
  const file=rules[name],blob=new Blob([JSON.stringify(file,null,1)+'\n'],{type:'application/json'});
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=fileNameOf(String(getAt(file,['version'])));
  link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
 };
 return {rules,problems,valid,sound,analysis,loading,error,shape,mood,playing,
  pick,upload,listen,stop:()=>player.stop(),set,exportFile,
  reset:(name:RuleSetName)=>setRules(current=>({...current,[name]:loaded()[name]})),
  choose:(dimension:keyof ChosenShape,value:string|undefined)=>setShape(current=>{const next={...current};if(value===undefined||next[dimension]===value)delete next[dimension];else (next as Record<string,string>)[dimension]=value;return next;}),
  setMood};
}
export type Lab=ReturnType<typeof useLab>;
