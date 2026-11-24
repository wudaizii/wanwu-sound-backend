import {useEffect,useState} from 'react';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import {WORK_TITLE_MAX,cleanWorkTitle} from '@wanwu-v2/contracts/work';
import type {SavedWork} from '@wanwu-v2/contracts/work';
import {flowSteps} from '../../app/navigation';
import {ArtPicture} from '../../shared/media/ArtPicture';
import {WorkBackdrop} from '../../shared/scene/WorkBackdrop';
import {FlowHeader} from '../../shared/ui/FlowHeader';
import {KidIcon} from '../../shared/ui/KidIcon';
import {WorkHeaderActions} from '../../shared/ui/WorkHeaderActions';
import {WorkIntro} from '../../shared/ui/WorkIntro';
import {WorkSheet,sheetStyles} from '../../shared/ui/WorkSheet';
import {shelfCopy,shelfGuide} from './config/copy';
import {useWorkShelf} from './model/useWorkShelf';
import {useShelfPlayer} from './model/useShelfPlayer';
import type {ShelfPlayFailure} from './model/useShelfPlayer';
import type {Instrument} from '../../shared/background/instruments';
import {services} from '../../app/services';
import {WorkCard} from './components/WorkCard';
import styles from './WorksPage.module.css';

/** 作品书架: the works put on the shelf during this visit (in memory — a refresh empties it). 听一听 plays one here; 打开曲谱
 *  returns to 万物成曲; a work can be renamed or taken off the shelf. */
export function WorksPage({onNavigate}:{onNavigate:(path:string)=>void}){
 const shelf=useWorkShelf();
 const [asking,setAsking]=useState<SavedWork|null>(null);
 const [renaming,setRenaming]=useState<{work:SavedWork;title:string}|null>(null);
 const [removing,setRemoving]=useState<SavedWork|null>(null);
 const [failure,setFailure]=useState<ShelfPlayFailure|null>(null);
 // What the background needs to play a saved work as it was kept: the instruments and the textbook songs.
 const [instruments,setInstruments]=useState<readonly Instrument[]>([]);
 const [tracks,setTracks]=useState<readonly TextbookTrack[]>([]);
 useEffect(()=>{
  let live=true;
  void Promise.all([services.backgroundLibrary.list(),services.inspirationCatalog.list()]).then(([library,catalogue])=>{if(live){setInstruments(library.instruments);setTracks(catalogue.entries);}});
  return()=>{live=false;};
 },[]);
 const player=useShelfPlayer(instruments,tracks,setFailure);
 const open=(work:SavedWork)=>{player.stop();void shelf.open(work).then(()=>onNavigate('/compose'));};
 const text=failure?shelfCopy.failures[failure]:shelfCopy.bubble(shelf.works.length);
 const saveName=async()=>{if(renaming&&await shelf.rename(renaming.work.id,renaming.title))setRenaming(null);};
 return <div className={styles.shell}>
  <WorkBackdrop/>
  <FlowHeader steps={flowSteps} current={null} onNavigate={onNavigate} aside={<WorkHeaderActions onNavigate={onNavigate} current="shelf"/>}/>
  <main className={styles.page}>
   <WorkIntro title={shelfCopy.title} subtitle={shelfCopy.subtitle} guide={shelfGuide} text={text} rekey={false} className={styles.intro}/>
   <p className={styles.session}><span><KidIcon name="lock"/>{shelfCopy.sessionBadge}</span>{shelfCopy.accountNote}</p>
   {shelf.works.length?<ul className={styles.grid}>
    {shelf.works.map(work=><WorkCard key={work.id} work={work} current={shelf.currentId===work.id}
     playing={player.playing===work.id} preparing={player.preparing===work.id} elapsed={player.elapsed}
     onPlay={()=>{setFailure(null);void player.toggle(work);}}
     onOpen={()=>shelf.wouldReplace(work)?setAsking(work):open(work)}
     onRename={()=>setRenaming({work,title:work.title})} onRemove={()=>setRemoving(work)}/>)}
   </ul>:<section className={styles.empty}>
    <span className={styles.emptyArt}><ArtPicture variants={shelfGuide.variants} className={styles.emptyMascot}/></span>
    <h2>{shelfCopy.empty}</h2>
    <p>{shelfCopy.emptyHint}</p>
    <div className={styles.emptyActions}>
     {shelf.currentId&&<button type="button" className={sheetStyles.secondary} onClick={()=>onNavigate('/compose')}><KidIcon name="back"/>{shelfCopy.goCompose}</button>}
     <button type="button" className={sheetStyles.primary} onClick={()=>onNavigate('/create')}><KidIcon name="plus"/>{shelfCopy.makeOne}</button>
    </div>
   </section>}
  </main>
  {renaming&&<WorkSheet title={shelfCopy.rename.title} description={shelfCopy.rename.description} onClose={()=>setRenaming(null)}>
   <form onSubmit={event=>{event.preventDefault();void saveName();}}>
    <input className={styles.renameField} value={renaming.title} maxLength={WORK_TITLE_MAX} placeholder={shelfCopy.rename.placeholder} aria-label={shelfCopy.rename.title}
     autoFocus onChange={event=>setRenaming({...renaming,title:event.target.value})}/>
    <div className={sheetStyles.actions}>
     <button type="button" className={sheetStyles.secondary} onClick={()=>setRenaming(null)}>{shelfCopy.rename.cancel}</button>
     <button type="submit" className={sheetStyles.primary} disabled={!cleanWorkTitle(renaming.title)}>{shelfCopy.rename.save}</button>
    </div>
   </form>
  </WorkSheet>}
  {removing&&<WorkSheet title={shelfCopy.remove.title} description={shelfCopy.remove.description(removing.title)} onClose={()=>setRemoving(null)}>
   <div className={sheetStyles.actions}>
    <button type="button" className={sheetStyles.secondary} onClick={()=>setRemoving(null)}>{shelfCopy.remove.cancel}</button>
    <button type="button" className={sheetStyles.primary} onClick={()=>{if(player.playing===removing.id)player.stop();void shelf.remove(removing.id);setRemoving(null);}}>{shelfCopy.remove.confirm}</button>
   </div>
  </WorkSheet>}
  {asking&&<WorkSheet title={shelfCopy.replace.title} description={shelfCopy.replace.description} onClose={()=>setAsking(null)}>
   <div className={sheetStyles.actions}>
    <button type="button" className={sheetStyles.secondary} onClick={()=>{setAsking(null);onNavigate('/compose');}}>{shelfCopy.replace.keep}</button>
    <button type="button" className={sheetStyles.primary} onClick={()=>{const work=asking;setAsking(null);open(work);}}>{shelfCopy.replace.open}</button>
   </div>
  </WorkSheet>}
 </div>;
}
