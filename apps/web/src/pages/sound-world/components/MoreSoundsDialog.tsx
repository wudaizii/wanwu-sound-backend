import {useEffect,useState} from 'react';
import {SoundMarker} from '../../../shared/markers/SoundMarker';
import {WorkSheet,sheetStyles} from '../../../shared/ui/WorkSheet';
import {Glyph} from '../../../shared/ui/PaperIcon';
import {worldCopy} from '../config/copy';
import {nextMarkerIndex} from '../model/soundWorldState';
import type {SoundWorld} from '../model/useSoundWorld';
import {libraryScopes} from '../services/soundWorldRepository';
import type {LibraryScope,ScopeResult} from '../services/soundWorldRepository';
import sheet from './sheet.module.css';
import styles from './MoreSoundsDialog.module.css';

const copy=worldCopy.moreDialog;

/**
 * 找更多声音: 示例 / 我的 / 班级 / 公共 from the repository. Scopes without an account or data say so plainly —
 * nothing here pretends to be a real class library.
 */
export function MoreSoundsDialog({world,initial,onMakeNew,onClose}:{world:SoundWorld;initial:LibraryScope;onMakeNew:()=>void;onClose:()=>void}){
 const [scope,setScope]=useState(initial);
 const [result,setResult]=useState<ScopeResult|null>(null);
 useEffect(()=>{
  let live=true;setResult(null);
  void world.scope(scope).then(next=>{if(live)setResult(next);});
  return()=>{live=false;};
 // The repository call is stable for the page's lifetime; reload only when the tab changes.
 },[scope]);
 const inWork=new Set(world.state.arrangement?.units.map(unit=>unit.id));
 // A sound already in the work keeps its marker; one not yet added shows the marker it would get.
 const work=world.state.arrangement,nextIndex=work?nextMarkerIndex(work):0;
 const markerOf=(id:string)=>work?.units.find(unit=>unit.id===id)?.markerIndex??nextIndex;
 return <WorkSheet title={copy.title} description={copy.description} onClose={onClose}>
  <div className={styles.tabs} role="tablist" aria-label={copy.title}>
   {libraryScopes.map(item=><button key={item} type="button" role="tab" id={`scope-${item}`} aria-selected={scope===item} aria-controls="scope-panel"
    onClick={()=>setScope(item)}>{copy.scopes[item]}</button>)}
  </div>
  <div id="scope-panel" role="tabpanel" aria-labelledby={`scope-${scope}`} className={styles.scopePanel}>
   {!result?<p className={styles.scopeNote}>{worldCopy.loading}</p>
   :result.status==='unavailable'?<p className={sheet.scopeClosed}><Glyph name="library"/>{copy.unavailable[result.reason]}</p>
   :<>
    <p className={styles.scopeNote}>{scope==='example'?copy.exampleNote:copy.mineNote}</p>
    {result.units.length?<ul className={styles.scopeList}>
     {result.units.map(unit=>{
      const added=inWork.has(unit.id),key=`unit:${unit.id}`,listening=world.playing===key;
      return <li key={unit.id}>
       <SoundMarker index={markerOf(unit.id)} className={styles.scopeMarker} label={null}/>
       <span className={styles.scopeName}>{unit.name}</span>
       <button type="button" className={styles.scopeListen} aria-pressed={listening} aria-label={`${listening?worldCopy.stop:worldCopy.listen}「${unit.name}」`}
        onClick={()=>world.previewUnit(unit)}><Glyph name={listening?'stop':'play'}/></button>
       <button type="button" className={styles.scopeAdd} disabled={added} onClick={()=>world.addUnit(unit)}>
        {added?<><Glyph name="check"/>{copy.added}</>:<><Glyph name="plus"/>{copy.add}</>}
       </button>
      </li>;
     })}
    </ul>:<p className={sheet.scopeClosed}>{copy.mineEmpty}</p>}
    {scope==='mine'&&<button type="button" className={styles.makeNew} onClick={onMakeNew}><Glyph name="mic"/>{copy.makeNew}</button>}
   </>}
  </div>
  <p className={sheetStyles.note}>{copy.sessionOnly}</p>
 </WorkSheet>;
}
