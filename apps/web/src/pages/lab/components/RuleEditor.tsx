import {useMemo,useState} from 'react';
import {labCopy} from '../config/copy';
import {RULE_SETS,fieldsOf,getAt,ruleLimits} from '../model/ruleTree';
import type {Field,RuleSetName} from '../model/ruleTree';
import type {Lab} from '../model/useLab';
import styles from '../LabPage.module.css';

/** One control per tunable value of a rule file, its range from the rule checks; problems block the export. */
export function RuleEditor({lab}:{lab:Lab}){
 const [name,setName]=useState<RuleSetName>('shaping');
 const rules=lab.rules[name],problems=lab.problems[name];
 const fields=useMemo(()=>fieldsOf(ruleLimits[name],rules),[name,rules]);
 return <section className={styles.panel} aria-labelledby="lab-rules">
  <h2 id="lab-rules">{labCopy.rulesTitle}</h2>
  <div className={styles.tabs} role="tablist">
   {RULE_SETS.map(set=><button key={set} type="button" role="tab" aria-selected={set===name} data-problem={lab.problems[set].length>0||undefined} onClick={()=>setName(set)}>
    {labCopy.sets[set]}<small>{String(getAt(lab.rules[set],['version']))}</small>
   </button>)}
  </div>
  <p className={styles.note}>{labCopy.setNotes[name]}</p>
  {problems.length>0&&<ul className={styles.problem} role="alert">{problems.map(problem=><li key={problem}>{problem}</li>)}</ul>}
  <div className={styles.fields}>{fields.map(field=><FieldRow key={field.path.join('.')} field={field} value={getAt(rules,field.path)} onChange={value=>lab.set(name,field.path,value)}/>)}</div>
  <div className={styles.exportRow}>
   <button type="button" onClick={()=>lab.reset(name)}>{labCopy.reset}</button>
   <button type="button" className={styles.primary} disabled={problems.length>0} onClick={()=>lab.exportFile(name)}>{labCopy.exportFile(name)}</button>
  </div>
 </section>;
}

function FieldRow({field,value,onChange}:{field:Field;value:unknown;onChange:(value:unknown)=>void}){
 const name=field.path.join('.');
 if(field.kind==='word')return <label className={styles.field}><span>{name}</span>
  <select value={String(value)} onChange={event=>onChange(event.target.value)}>{field.options.map(option=><option key={option}>{option}</option>)}</select></label>;
 if(field.kind==='list'){
  const list=Array.isArray(value)?value as number[]:[];
  return <label className={styles.field}><span>{name}<small>[{field.min}, {field.max}] × {field.fewest}–{field.most}</small></span>
   <input type="text" defaultValue={list.join(', ')} onBlur={event=>onChange(event.target.value.split(/[,，\s]+/).filter(Boolean).map(Number))}/></label>;
 }
 const number=Number(value);
 return <label className={styles.field}><span>{name}<small>[{field.min}, {field.max}]</small></span>
  <input type="range" min={field.min} max={field.max} step={field.step} value={number} onChange={event=>onChange(Number(event.target.value))}/>
  <input type="number" min={field.min} max={field.max} step={field.step} value={number} onChange={event=>onChange(Number(event.target.value))}/></label>;
}
