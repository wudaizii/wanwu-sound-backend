import {useEffect,useRef,useState} from 'react';
import {SOURCE_TEXT_MAX,missingProvenance} from '@wanwu-v2/contracts/sound';
import {Glyph} from '../../../shared/ui/PaperIcon';
import {birthCopy} from '../config/copy';
import type {ProvenanceField,useSoundBirth} from '../model/useSoundBirth';
import styles from './SoundInfo.module.css';

type Birth=ReturnType<typeof useSoundBirth>;
const copy=birthCopy.info;

/** 声卡信息 — where this card's sound came from (采集与转译). Examples are read-only; local sources are named and grouped here. */
export function SoundInfo({birth}:{birth:Birth}){
 const {state}=birth,source=state.source;
 const section=useRef<HTMLDivElement>(null);
 const missing=source?missingProvenance(source):[];
 const infoNotice=state.notice?.area==='info'?state.notice:null;
 // Guided finish brings the first missing field into view and focuses it.
 useEffect(()=>{
  if(!infoNotice||!missing.length)return;
  const field=section.current?.querySelector<HTMLInputElement>(`[name="${missing[0]}"]`);
  field?.scrollIntoView({block:'center',behavior:'smooth'});field?.focus({preventScroll:true});
 // Runs when a new guidance notice appears, not on every keystroke.
 },[infoNotice]);
 return <div ref={section} className={styles.info} role="group" aria-labelledby="card-info-title">
  <h3 id="card-info-title" className={styles.infoTitle}>{copy.title}{source&&missing.length>0&&<span className={styles.infoBadge}>待补 {missing.length}</span>}{source?.kind.startsWith('local-')&&<small className={styles.infoNote}>{copy.sessionOnly}</small>}</h3>
  {source&&source.kind!=='example'&&<div className={styles.infoForm}>
   <Field birth={birth} field="label" label={copy.label} hint={copy.labelHint} value={source.label} missing={missing.includes('label')}/>
   <div className={styles.groupField}>
    <Field birth={birth} field="group" label={copy.group} hint={copy.groupHint} value={source.provenance.group} options={birth.suggestions.group}/>
    {birth.suggestions.group.length>0&&<div className={styles.chips} aria-label="已有分组">
     {birth.suggestions.group.slice(0,6).map(group=><button key={group} type="button" aria-pressed={source.provenance.group===group} onClick={()=>birth.updateSource('group',group)}>{group}</button>)}
    </div>}
   </div>
   <Field birth={birth} field="recordedBy" label={copy.recordedBy} hint={copy.recordedByHint} value={source.provenance.recordedBy} missing={missing.includes('recordedBy')} options={birth.suggestions.recordedBy}/>
   <Field birth={birth} field="recordedOn" label={copy.recordedOn} value={source.provenance.recordedOn} missing={missing.includes('recordedOn')} type="date"/>
   <Field birth={birth} field="place" label={copy.place} hint={copy.placeHint} value={source.provenance.place} missing={missing.includes('place')} options={birth.suggestions.place}/>
   <div className={styles.infoRow}><span>{copy.visibility}</span><b>{copy.visibilityLocal}</b></div>
   <div className={styles.confirmRow}>
    <p className={styles.infoSummary} data-tone={infoNotice?.tone}>
     {infoNotice?.text??(missing.length?copy.privacy:copy.archived([source.provenance.group,source.provenance.recordedBy,source.provenance.place].filter(Boolean).join(' · ')))}
    </p>
    <button type="button" className={styles.confirm} data-ready={!missing.length||undefined} onClick={birth.confirmCard}><Glyph name="check"/>{birthCopy.confirmCard}</button>
   </div>
  </div>}
 </div>;
}

function Field({birth,field,label,hint,value,missing=false,options,type='text'}:{birth:Birth;field:ProvenanceField;label:string;hint?:string;value:string|null;missing?:boolean;options?:readonly string[];type?:'text'|'date'}){
 const list=options?.length?`list-${field}`:undefined;
 const sourceId=birth.state.source?.id;
 // Local draft keeps typing smooth; the cleaned value is committed on blur / Enter and resets when the source changes.
 const [draft,setDraft]=useState(value??'');
 useEffect(()=>setDraft(value??''),[sourceId,value]);
 const commit=(next:string)=>{if(next!==(value??''))birth.updateSource(field,next);};
 return <label className={styles.field} data-missing={missing||undefined}>
  <span>{label}</span>
  <input name={field} type={type} value={draft} placeholder={hint} maxLength={type==='text'?SOURCE_TEXT_MAX:undefined} list={list} autoComplete="off"
   onChange={event=>{setDraft(event.currentTarget.value);if(type==='date')commit(event.currentTarget.value);}}
   onBlur={event=>commit(event.currentTarget.value)}
   onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/>
  {list&&<datalist id={list}>{options!.map(option=><option key={option} value={option}/>)}</datalist>}
 </label>;
}
