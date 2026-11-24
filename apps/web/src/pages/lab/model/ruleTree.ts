// The tuning lab's view of a rule file: one field per tunable value, read from the same limits the rule checks use
// (packages/sound-rules/src/schema.ts), so every slider's range is the allowed range and nothing is listed twice.
// Pure: reading and writing a value at a path returns a new rule object; the loaded rules are never changed.
import {analysisLimits,backgroundLimits,mixLimits,shapingLimits} from '@wanwu-v2/sound-rules/schema';
import {analysisProblems,backgroundProblems,mixProblems,shapingProblems} from '@wanwu-v2/sound-rules/rules';
import type {AnalysisRules,BackgroundRules,MixRules,ShapingRules} from '@wanwu-v2/sound-rules/rules';

export type Field=
 |{kind:'number';path:string[];min:number;max:number;step:number}
 |{kind:'list';path:string[];min:number;max:number;fewest:number;most:number}
 |{kind:'word';path:string[];options:readonly string[]};
type Limits={readonly [key:string]:unknown};

/** A step a slider can land on: whole numbers when the range and the value are whole, otherwise ~1/100 of the range. */
export function stepFor(min:number,max:number,value:number){
 if(Number.isInteger(min)&&Number.isInteger(max)&&Number.isInteger(value)&&max-min>=2)return 1;
 return 10**Math.floor(Math.log10((max-min)/100));
}

export function fieldsOf(limits:Limits,rules:unknown,path:string[]=[]):Field[]{
 return Object.entries(limits).flatMap(([key,limit]):Field[]=>{
  const at=[...path,key];
  if(limit==='version')return [];
  if(Array.isArray(limit)&&typeof limit[0]==='string')return [{kind:'word',path:at,options:limit as string[]}];
  if(Array.isArray(limit)&&limit.length===4){const [min,max,fewest,most]=limit as number[];return [{kind:'list',path:at,min:min!,max:max!,fewest:fewest!,most:most!}];}
  if(Array.isArray(limit)){const [min,max]=limit as number[];return [{kind:'number',path:at,min:min!,max:max!,step:stepFor(min!,max!,Number(getAt(rules,at)))}];}
  return fieldsOf(limit as Limits,rules,at);
 });
}

export function getAt(value:unknown,path:readonly string[]):unknown{
 return path.reduce<unknown>((current,key)=>current&&typeof current==='object'?(current as Record<string,unknown>)[key]:undefined,value);
}
/** A copy of `value` with `next` at `path`. */
export function setAt<T>(value:T,path:readonly string[],next:unknown):T{
 if(!path.length)return next as T;
 const [key,...rest]=path as [string,...string[]];
 const record=value as Record<string,unknown>;
 return {...record,[key]:setAt(record[key],rest,next)} as T;
}

/** The four rule files the lab tunes, each with its checks and the file name it is exported as. */
export type RuleSets={analysis:AnalysisRules;shaping:ShapingRules;background:BackgroundRules;mix:MixRules};
export type RuleSetName=keyof RuleSets;
export const RULE_SETS:readonly RuleSetName[]=['shaping','analysis','background','mix'];
export const ruleLimits:Record<RuleSetName,Limits>={analysis:analysisLimits,shaping:shapingLimits,background:backgroundLimits,mix:mixLimits};
export function ruleProblems(name:RuleSetName,rules:RuleSets[RuleSetName]){
 switch(name){
  case 'analysis':return analysisProblems(rules as AnalysisRules);
  case 'shaping':return shapingProblems(rules as ShapingRules);
  case 'background':return backgroundProblems(rules as BackgroundRules);
  case 'mix':return mixProblems(rules as MixRules);
 }
}
/** `shaping-v3` → `shaping.v3.json`: drop it into packages/sound-rules/rules/ to use it. */
export const fileNameOf=(version:string)=>`${version.replace(/-v(\d+)$/,'.v$1')}.json`;
