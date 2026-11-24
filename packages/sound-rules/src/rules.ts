// The rule files, checked once when loaded. Pages and the renderer read rules only from here; the numbers themselves live
// in ../rules/*.json so the music role can tune them without touching code (see ../README.md).
import analysisFile from '../rules/analysis.v2.json' with {type:'json'};
import backgroundFile from '../rules/background.v1.json' with {type:'json'};
import mixFile from '../rules/mix.v1.json' with {type:'json'};
import shapingFile from '../rules/shaping.v3.json' with {type:'json'};
import textbookMatchFile from '../rules/textbook-match.v1.json' with {type:'json'};
import {SPAN_CHOICES} from '@wanwu-v2/contracts/arrangement';
import {analysisLimits,backgroundLimits,checkRules,mixLimits,shapingLimits,textbookMatchLimits} from './schema.ts';

export type AnalysisRules=typeof analysisFile;
export type ShapingRules=typeof shapingFile;
export type BackgroundMode='major'|'minor'|'pentatonic'|'dorian';
/** JSON imports widen words and lists; the checks below make sure the file really holds these. */
export type BackgroundMood=Omit<(typeof backgroundFile)['moods']['none'],'mode'|'metre'>&{mode:BackgroundMode;metre:2|3|4};
export type BackgroundRules=Omit<typeof backgroundFile,'moods'>&{moods:Record<keyof (typeof backgroundFile)['moods'],BackgroundMood>};
export type MixRules=typeof mixFile;
export type TextbookMatchRules=typeof textbookMatchFile;

export function analysisProblems(rules:AnalysisRules){
 return checkRules('analysis',rules,analysisLimits,[
  [rules.brightness.lowBelowHz<rules.brightness.highAboveHz,'brightness.lowBelowHz 要小于 highAboveHz'],
  [rules.unitLength.shortBelowSeconds<rules.unitLength.longAboveSeconds,'unitLength.shortBelowSeconds 要小于 longAboveSeconds'],
  [Number.isInteger(Math.log2(rules.brightness.fftSize)),'brightness.fftSize 要是 2 的整数次方（512、1024、2048…）'],
 ]);
}
export function shapingProblems(rules:ShapingRules){
 const {duration:d,level:l,pattern:p}=rules;
 return checkRules('shaping',rules,shapingLimits,[
  [d.minStretch<1&&d.maxStretch>1,'duration.minStretch 要小于 1，maxStretch 要大于 1'],
  [d.textureMinStretch<1&&d.textureMaxStretch>1,'duration.textureMinStretch 要小于 1，textureMaxStretch 要大于 1'],
  [l.choiceDb.soft<l.choiceDb.medium&&l.choiceDb.medium<l.choiceDb.loud,'轻响三档要从轻到响递增'],
  [rules.contour.sweepClosedHz<rules.contour.sweepOpenHz,'contour.sweepClosedHz 要小于 sweepOpenHz'],
  [p.repeat.motifMaxSeconds<=rules.limits.cardMaxSeconds&&p.repeat.waveSeconds<=rules.limits.cardMaxSeconds,'重复的一段不能超过声卡试听上限'],
  [rules.limits.clipMaxSeconds<=Math.max(...SPAN_CHOICES),`limits.clipMaxSeconds 不能超过最长的声场（${Math.max(...SPAN_CHOICES)} 秒）：一个声音要放得进声场`],
 ]);
}

export function backgroundProblems(rules:BackgroundRules){
 const moods=Object.values(rules.moods);
 return checkRules('background',rules,backgroundLimits,[
  [moods.every(mood=>Number.isInteger(mood.metre)&&Number.isInteger(mood.tonic)),'background.moods.*.metre 和 tonic 要是整数'],
  [moods.every(mood=>mood.progression.every(Number.isInteger)),'background.moods.*.progression 要写 1–7 的级数'],
  [Object.values(rules.modes).every(mode=>mode.scale.length===7&&mode.scale[0]===0&&mode.scale.every((step,i)=>i===0||step>mode.scale[i-1]!)),'background.modes.*.scale 要是从 0 开始、逐个变高的 7 个音'],
  [Object.values(rules.modes).every(mode=>mode.melody[0]===0&&mode.melody.every((step,i)=>i===0||step>mode.melody[i-1]!)),'background.modes.*.melody 要从 0 开始、逐个变高'],
 ]);
}
export function mixProblems(rules:MixRules){return checkRules('mix',rules,mixLimits);}
export function textbookMatchProblems(rules:TextbookMatchRules){
 const w=rules.weights;
 return checkRules('textbookMatch',rules,textbookMatchLimits,[
  [w.density+w.repetition+w.register+w.mood>0,'textbookMatch.weights 不能全是 0'],
  [rules.density.sparseBelow<rules.density.busyAbove,'textbookMatch.density.sparseBelow 要小于 busyAbove'],
  [rules.repetition.lowBelow<rules.repetition.highAbove,'textbookMatch.repetition.lowBelow 要小于 highAbove'],
  [rules.register.lowBelowMidi<rules.register.highAboveMidi,'textbookMatch.register.lowBelowMidi 要小于 highAboveMidi'],
  [Number.isInteger(rules.top),'textbookMatch.top 要是整数'],
 ]);
}

function load<T>(rules:T,problems:string[]):T{
 if(problems.length)throw new Error(`规则文件有误：\n${problems.join('\n')}`);
 return rules;
}
export const ANALYSIS_RULES:AnalysisRules=load(analysisFile,analysisProblems(analysisFile));
export const SHAPING_RULES:ShapingRules=load(shapingFile,shapingProblems(shapingFile));
export const BACKGROUND_RULES:BackgroundRules=load(backgroundFile as BackgroundRules,backgroundProblems(backgroundFile as BackgroundRules));
export const MIX_RULES:MixRules=load(mixFile,mixProblems(mixFile));
export const TEXTBOOK_MATCH_RULES:TextbookMatchRules=load(textbookMatchFile,textbookMatchProblems(textbookMatchFile));

/** Versions of every rule file, recorded with a saved piece and sent with an AI background request. */
export const RULE_VERSIONS={analysis:ANALYSIS_RULES.version,shaping:SHAPING_RULES.version,background:BACKGROUND_RULES.version,mix:MIX_RULES.version};
