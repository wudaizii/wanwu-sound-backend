import {useState} from 'react';
import {MAKER_NAME_MAX} from '@wanwu-v2/contracts/sound';
import {markerNumber} from '../../../shared/markers/markers';
import {birthCopy} from '../config/copy';
import styles from './MakerLabel.module.css';

/** The marker's label: who made this sound. Shows the number until a name is written; tap to edit in place. */
export function MakerLabel({maker,index,onChange}:{maker:string|null;index:number;onChange:(name:string)=>void}){
 const [editing,setEditing]=useState(false);
 if(editing)return <input className={styles.makerInput} defaultValue={maker??''} maxLength={MAKER_NAME_MAX} placeholder={birthCopy.makerHint}
  aria-label={birthCopy.maker} autoFocus
  onBlur={event=>{onChange(event.currentTarget.value);setEditing(false);}}
  onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();if(event.key==='Escape'){event.currentTarget.value=maker??'';event.currentTarget.blur();}}}/>;
 return <button type="button" className={styles.makerButton} data-empty={!maker||undefined} aria-label={`${birthCopy.makerEdit}：${maker??'未写'}`} onClick={()=>setEditing(true)}>
  {maker??markerNumber(index)}
 </button>;
}
