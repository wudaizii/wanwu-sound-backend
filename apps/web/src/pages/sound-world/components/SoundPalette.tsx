import {SoundMarker} from '../../../shared/markers/SoundMarker';
import {markerNumber} from '../../../shared/markers/markers';
import {inspirationCopy} from '../../../shared/inspiration/copy';
import {Glyph,PaperIcon} from '../../../shared/ui/PaperIcon';
import {worldCopy} from '../config/copy';
import {placedCount} from '../model/soundWorldState';
import type {SoundWorld} from '../model/useSoundWorld';
import type {useFieldDrag} from '../model/useFieldDrag';
import type {LibraryScope} from '../services/soundWorldRepository';
import {libraryScopes} from '../services/soundWorldRepository';
import styles from './SoundPalette.module.css';
import {ui} from '../../../shared/ui/controls';

/** 选一个声音: the work's sounds as cards. Tap a card to pick it (or drag it into the field); 试听 is a separate button. */
export function SoundPalette({world,bind,onMore,onInspiration}:{world:SoundWorld;bind:ReturnType<typeof useFieldDrag>['bind'];onMore:(scope:LibraryScope)=>void;onInspiration:()=>void}){
 const {arrangement,selection}=world.state;
 return <section className={`${ui.limeCard} ${styles.palette}`} aria-labelledby="palette-title">
  <span className={ui.tape} aria-hidden="true"/>
  <h2 id="palette-title">{worldCopy.paletteTitle}</h2>
  <ul className={styles.paletteList} aria-label="可选声音列表" tabIndex={0}>
   {arrangement?.units.map(unit=>{
    const selected=selection?.kind==='unit'&&selection.unitId===unit.id,count=placedCount(arrangement,unit.id);
    const key=`unit:${unit.id}`,listening=world.playing===key,waiting=world.preparing===key;
    return <li key={unit.id} className={styles.paletteItem} data-selected={selected||undefined}>
     <button type="button" className={styles.pick} aria-pressed={selected} {...bind({kind:'unit',unitId:unit.id})}>
      <SoundMarker index={unit.markerIndex} className={styles.paletteMarker} face={listening?'happy':'calm'}/>
      <span className={styles.pickText}>
       <b>{markerNumber(unit.markerIndex)} · {unit.name}</b>
       <small>{unit.input==='example-preset'&&<em>{worldCopy.example}</em>}{count>0&&worldCopy.placedTimes(count)}</small>
      </span>
     </button>
     <button type="button" className={styles.listen} aria-pressed={listening} aria-label={`${listening?worldCopy.stop:worldCopy.listen}「${unit.name}」`}
      data-waiting={waiting||undefined} onClick={()=>world.previewUnit(unit)}>
      <span className={styles.listenIcon}><Glyph name={listening?'stop':'play'}/></span>{listening?worldCopy.stop:worldCopy.listen}
     </button>
    </li>;
   })}
  </ul>
  <div className={styles.paletteFoot}>
   {/* 课本灵感 and the background switch share one row; what they mean is said by the frog, not written in the row. */}
   <div className={styles.inspirationRow} data-on={world.inspiration.kind!=='none'||undefined}>
    <button type="button" className={styles.inspiration} aria-label={`${worldCopy.inspiration}：${inspirationCopy.summary(world.inspiration,world.inspirationEntries)}`} onClick={onInspiration}>
     <span className={styles.inspirationBadge}><PaperIcon name="book" tone="pink"/></span>
     <b>{worldCopy.inspiration}</b>{world.inspiration.kind!=='none'&&<Glyph name="check" className={styles.inspirationCheck}/>}
    </button>
    <button type="button" role="switch" aria-checked={world.backgroundEnabled} aria-label={worldCopy.backgroundToggle} className={styles.switch}
     onClick={()=>world.setBackgroundEnabled(!world.backgroundEnabled)}>
     <i><Glyph name={world.backgroundEnabled?'sound':'muted'}/></i>
    </button>
   </div>
   <button type="button" className={styles.more} onClick={()=>onMore('example')}><Glyph name="plus"/>{worldCopy.more}</button>
   <p className={styles.scopes}>
    {libraryScopes.map(scope=><button key={scope} type="button" onClick={()=>onMore(scope)}>{worldCopy.moreDialog.scopes[scope]}</button>)}
   </p>
  </div>
 </section>;
}
