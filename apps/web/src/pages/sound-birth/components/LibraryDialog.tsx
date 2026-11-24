import {WorkSheet,sheetStyles} from '../../../shared/ui/WorkSheet';
import {Glyph} from '../../../shared/ui/PaperIcon';
import {birthCopy} from '../config/copy';
import type {useSoundBirth} from '../model/useSoundBirth';
import type {LibraryItem} from '../services/soundLibrary';
import styles from './LibraryDialog.module.css';

type Birth=ReturnType<typeof useSoundBirth>;
const copy=birthCopy.libraryDialog;
const meta=(item:LibraryItem)=>{
 const p=item.source.provenance;
 return item.source.kind==='example'?p.recordedBy??'':[p.recordedBy,p.place,p.recordedOn?.slice(5)].filter(Boolean).join(' · ')||'来源信息待补';
};

/** 从声音库挑选: examples plus this device's sources, grouped by 分组 so each one can be traced. */
export function LibraryDialog({birth}:{birth:Birth}){
 const error=birth.state.notice?.area==='bar'?birth.state.notice.text:'';
 return <WorkSheet title={copy.title} description={copy.description} onClose={birth.closeDialog}>
  <div className={styles.libraryGroups}>
   {birth.groups.map(group=><section key={group.id} className={styles.libraryGroup} aria-label={group.title}>
    <header><h3>{group.title}</h3><span>{group.note} · {group.items.length}</span></header>
    <ul>
     {group.items.map(item=>{
      const id=item.source.id,listening=birth.playing===`item:${id}`,loading=birth.loadingId===id,current=birth.state.source?.id===id;
      return <li key={id} data-current={current||undefined}>
       <button type="button" className={styles.listen} aria-label={`${listening?'停止':'试听'}${item.source.label}`} aria-pressed={listening} onClick={()=>void birth.previewItem(item)}>
        <Glyph name={listening?'stop':'play'}/></button>
       <span className={styles.itemText}><strong>{item.source.label}</strong><small>{loading?birthCopy.reading:meta(item)}</small></span>
       <button type="button" className={styles.pick} disabled={loading||current} onClick={()=>void birth.pickItem(item)}>{current?copy.current:copy.pick}</button>
      </li>;
     })}
    </ul>
   </section>)}
  </div>
  <p className={sheetStyles.note} role="status">{error||copy.scopes}</p>
 </WorkSheet>;
}
