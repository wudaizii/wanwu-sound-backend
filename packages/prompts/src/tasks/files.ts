// The prompt files (../../prompts/*.json) and their checks. A prompt file holds only words: the lines sent to the model,
// word tables the program picks from, small templates, and an example reply. Each task says which placeholders its
// lines may use and which tables must cover which values; a typo, a missing word or an unknown placeholder is reported
// in plain words and the file refuses to load, so a bad edit fails `npm test`, never a request.
import systemFile from '../../prompts/system.v1.json' with {type:'json'};
import {fill,unknownPlaceholders} from '../fill.ts';
import {avoidList,neverSayList} from '../style.ts';

export type PromptFile={
 version:string;task:string;model:'language'|'music';status:'open'|'closed';temperature:number;lines:string[];
 words?:Record<string,unknown>;example?:unknown;[extra:string]:unknown;
};
export type PromptSpec={
 task:string;model:PromptFile['model'];
 /** Placeholders the lines may use. */
 placeholders:readonly string[];
 /** Other templates in the file (dot path) and the placeholders each may use. */
 templates?:Readonly<Record<string,readonly string[]>>;
 /** Word tables (dot path) and the values each must cover. */
 tables?:Readonly<Record<string,readonly string[]>>;
 /** Checks the example reply against the task's own acceptance. */
 example?:(example:unknown)=>string[];
};

export const at=(file:unknown,path:string)=>path.split('.').reduce<unknown>((value,key)=>value&&typeof value==='object'?(value as Record<string,unknown>)[key]:undefined,file);

export function promptProblems(file:PromptFile,spec:PromptSpec){
 const name=`${spec.task}`,problems:string[]=[];
 if(typeof file.version!=='string'||!file.version)problems.push(`${name}.version 应该是版本名`);
 if(file.task!==spec.task)problems.push(`${name}.task 应该是 ${spec.task}`);
 if(file.model!==spec.model)problems.push(`${name}.model 应该是 ${spec.model}`);
 if(file.status!=='open'&&file.status!=='closed')problems.push(`${name}.status 只能是 open / closed`);
 if(typeof file.temperature!=='number'||file.temperature<0||file.temperature>1.5)problems.push(`${name}.temperature 应该在 0–1.5 之间`);
 if(!Array.isArray(file.lines)||!file.lines.length||!file.lines.every(line=>typeof line==='string'&&line.trim()))problems.push(`${name}.lines 应该是一行行的文字`);
 else file.lines.forEach((line,i)=>problems.push(...unknownPlaceholders(`${name}.lines[${i}]`,line,spec.placeholders)));
 for(const [path,allowed] of Object.entries(spec.templates??{})){
  const text=at(file,path);
  if(typeof text!=='string'||!text.trim())problems.push(`${name}.${path} 缺少`);
  else problems.push(...unknownPlaceholders(`${name}.${path}`,text,allowed));
 }
 for(const [path,keys] of Object.entries(spec.tables??{})){
  const table=at(file,path);
  if(!table||typeof table!=='object'){problems.push(`${name}.${path} 缺少`);continue;}
  for(const key of keys)if(typeof (table as Record<string,unknown>)[key]!=='string'||!(table as Record<string,string>)[key]!.trim())problems.push(`${name}.${path}.${key} 缺少`);
  for(const key of Object.keys(table))if(!keys.includes(key))problems.push(`${name}.${path}.${key} 不认识（拼错了？）`);
 }
 if(spec.example)problems.push(...spec.example(file.example).map(problem=>`${name}.example：${problem}`));
 return problems;
}

export function loadPrompt<T extends PromptFile>(file:T,spec:PromptSpec):T{
 const problems=promptProblems(file,spec);
 if(problems.length)throw new Error(`提示词文件有误：\n${problems.join('\n')}`);
 return file;
}

export const SYSTEM_SPEC:PromptSpec={task:'system',model:'language',placeholders:['childAvoid','neverSay']};
export const SYSTEM_PROMPT=loadPrompt(systemFile as PromptFile,SYSTEM_SPEC);

/** What is sent for one request: the shared system prompt (language tasks only), the task prompt, and its settings. */
export type BuiltPrompt={task:string;version:string;system:string|null;prompt:string;temperature:number;model:PromptFile['model']};

export function buildPrompt(file:PromptFile,values:Readonly<Record<string,string|number>>):BuiltPrompt{
 const lines=file.lines.map(line=>fill(line,values)).filter(line=>line.trim());
 return {
  task:file.task,version:file.version,model:file.model,temperature:file.temperature,
  system:file.model==='language'?SYSTEM_PROMPT.lines.map(line=>fill(line,{childAvoid:avoidList(),neverSay:neverSayList()})).join('\n'):null,
  prompt:lines.join(file.model==='language'?'\n':' '),
 };
}
/** A word from a table, by key (the tables are checked to cover every key when loaded). */
export const word=(file:PromptFile,path:string,key:string|number)=>String((at(file,path) as Record<string,string>)[String(key)]);
export const exampleJson=(file:PromptFile)=>JSON.stringify(file.example);
