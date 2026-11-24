import type {CSSProperties} from 'react';
import type {SavedWork} from '@wanwu-v2/contracts/work';
import {pieceSeconds,timedEvents} from '../../../shared/creation/arrangementTiming';
import {moodLabels,presetMood} from '../../../shared/creation/moodCopy';
import {SoundMarker} from '../../../shared/markers/SoundMarker';
import {markerFor} from '../../../shared/markers/markers';
import {KidIcon} from '../../../shared/ui/KidIcon';
import {MoodFace} from '../../../shared/ui/MoodFace';
import {shelfCopy} from '../config/copy';
import styles from '../WorksPage.module.css';

const time=(iso:string)=>new Date(iso).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});

/** One shelved work: a small score drawn from its arrangement (same markers and rows), its name, facts, 听一听 right
 *  here (the score lights up as it plays), 打开曲谱, and quiet 改名 / 拿下来 buttons. */
export function WorkCard({work,current,playing,preparing,elapsed,onPlay,onOpen,onRename,onRemove}:{work:SavedWork;current:boolean;
 playing:boolean;preparing:boolean;elapsed:number;onPlay:()=>void;onOpen:()=>void;onRename:()=>void;onRemove:()=>void}){
 const {arrangement}=work,timed=timedEvents(arrangement),total=pieceSeconds(arrangement);
 const units=new Set(timed.map(item=>item.unit.id)).size,mood=arrangement.mood;
 const moodId=presetMood(mood);
 const at=(seconds:number)=>`${4+seconds/total*92}%`;
 return <li className={styles.card} data-playing={playing||undefined}>
  <div className={styles.mini} style={{'--rows':arrangement.rows} as CSSProperties} aria-hidden="true">
   {Array.from({length:arrangement.rows},(_,row)=><i key={row} className={styles.miniLane}/>)}
   {timed.map(item=>{
    const position={left:at(item.start),top:`${(item.event.row+.5)/arrangement.rows*100}%`};
    return <i key={`tail-${item.event.id}`} className={styles.miniTail} data-marker={markerFor(item.unit.markerIndex).id} style={{...position,width:`${item.seconds/total*92}%`}}/>;
   })}
   {timed.map(item=>{const sounding=playing&&elapsed>=item.start&&elapsed<item.end;
    return <span key={item.event.id} className={styles.miniItem} data-sounding={sounding||undefined} style={{left:at(item.start),top:`${(item.event.row+.5)/arrangement.rows*100}%`}}>
     <SoundMarker index={item.unit.markerIndex} label={null} className={styles.miniMarker} face={sounding?'happy':undefined}/>
    </span>;})}
   {playing&&<i className={styles.miniPlayhead} style={{left:at(Math.min(elapsed,total))}}/>}
  </div>
  <div className={styles.cardBody}>
   <div className={styles.titleRow}>
    <h2>{work.title}{current&&<em>{shelfCopy.current}</em>}</h2>
    <span className={styles.tools}>
     <button type="button" aria-label={shelfCopy.renameLabel(work.title)} onClick={onRename}><KidIcon name="edit"/></button>
     <button type="button" aria-label={shelfCopy.removeLabel(work.title)} onClick={onRemove}><KidIcon name="trash"/></button>
    </span>
   </div>
   <p className={styles.facts}>
    <span>{shelfCopy.sounds(units)}</span><span>{shelfCopy.seconds(String(Math.ceil(total-1e-6)))}</span>
    {moodId&&<span><MoodFace name={moodId} className={styles.factMood}/>{moodLabels[moodId]}</span>}
   </p>
   <p className={styles.meta}><span>{shelfCopy.savedAt(time(work.savedAt))}</span><span><KidIcon name="lock"/>{shelfCopy.visibility[work.visibility]}</span></p>
  </div>
  <div className={styles.cardActions}>
   <button type="button" className={styles.play} aria-pressed={playing} data-busy={preparing||undefined} onClick={onPlay}>
    <span><KidIcon name={playing?'stop':'play'}/></span>{preparing?shelfCopy.preparing:playing?shelfCopy.stop:shelfCopy.play}
   </button>
   <button type="button" className={styles.open} onClick={onOpen}>{shelfCopy.open}<KidIcon name="arrow"/></button>
  </div>
 </li>;
}
