import {useRef,useState} from 'react';
import {WorkSheet,sheetStyles} from '../../../shared/ui/WorkSheet';
import {Glyph,PaperIcon} from '../../../shared/ui/PaperIcon';
import {birthCopy} from '../config/copy';
import controls from './controls.module.css';
import styles from './PaperCard.module.css';
import {ui} from '../../../shared/ui/controls';

/** 拍照读声卡: the photo stays on this device as a reference while choosing. No recognition runs yet. */
export function PaperCard({photo,onChange}:{photo:string|null;onChange:(file:File|null)=>void}){
 const input=useRef<HTMLInputElement>(null);
 const [open,setOpen]=useState(false);
 const pick=()=>input.current?.click();
 return <>
  {photo?<button type="button" className={controls.tileButton} onClick={()=>setOpen(true)}><span className={styles.tilePhoto}><img src={photo} alt=""/></span>{birthCopy.paperCardChip}</button>
   :<button type="button" className={controls.tileButton} onClick={pick}><PaperIcon name="camera" tone="sage" className={controls.tile}/>{birthCopy.paperCard}</button>}
  <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file?.type.startsWith('image/')){onChange(file);setOpen(false);}}}/>
  {open&&photo&&<WorkSheet title={birthCopy.paperCardChip} description={birthCopy.paperCardNote} onClose={()=>setOpen(false)}>
   <img className={styles.cardLarge} src={photo} alt="纸卡照片"/>
   <div className={sheetStyles.actions}>
    <button type="button" className={`${ui.pill} ${ui.outline} ${controls.secondary}`} onClick={pick}><Glyph name="camera"/>重拍</button>
    <button type="button" className={`${ui.pill} ${ui.outline} ${controls.secondary}`} onClick={()=>{onChange(null);setOpen(false);}}>移除照片</button>
   </div>
  </WorkSheet>}
 </>;
}
