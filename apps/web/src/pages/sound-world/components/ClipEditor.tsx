import {SHAPING_RULES} from '@wanwu-v2/sound-rules/rules';
import {spanFor} from '../../../shared/creation/arrangementTiming';
import {WorkSheet} from '../../../shared/ui/WorkSheet';
import {Glyph} from '../../../shared/ui/PaperIcon';
import {worldCopy} from '../config/copy';
import {secondsText} from '../model/clipEditing';
import {useClipEditor} from '../model/useClipEditor';
import type {SoundWorld} from '../model/useSoundWorld';
import sheet from './sheet.module.css';
import styles from './ClipEditor.module.css';

const copy=worldCopy.clipEditor;
const pct=(ms:number,total:number)=>`${total?ms/total*100:0}%`;

/** 剪一剪: pick the part of the original recording this occurrence plays. The recording itself is never cut. */
export function ClipEditor({world,eventId,onClose}:{world:SoundWorld;eventId:string;onClose:()=>void}){
 const editor=useClipEditor(world,eventId,onClose);
 const {unit,clip,totalMs}=editor;
 if(!unit||!clip)return null;
 const span=world.state.arrangement?.spanSeconds??0;
 const ready=!!editor.buffer&&totalMs>0;
 const listeningClip=world.playing===`clip:${eventId}`,listeningSource=world.playing===`source:${unit.sourceId}`;
 const slider=(edge:'start'|'end')=>({
  role:'slider',tabIndex:0,'aria-label':edge==='start'?copy.start:copy.end,
  'aria-valuemin':0,'aria-valuemax':Math.round(totalMs/100)/10,'aria-valuenow':Math.round((edge==='start'?clip.startMs:clip.endMs)/100)/10,
  'aria-valuetext':`${secondsText(edge==='start'?clip.startMs:clip.endMs)} 秒`,
 } as const);
 return <WorkSheet title={copy.title(unit.name)} description={copy.description} className={styles.clipSheet} onClose={onClose}>
  <div className={styles.clipBody}>
   {editor.failed?<p className={sheet.scopeClosed}>{copy.failed}</p>
   :!ready?<p className={styles.clipLoading} role="status">{copy.loading}</p>
   :<>
    <div ref={editor.wave} className={styles.clipWave} onClick={event=>editor.tapWave(event.clientX)}>
     <svg viewBox={`0 0 ${editor.peaks.length} 100`} preserveAspectRatio="none" aria-hidden="true">
      {editor.peaks.map((peak,i)=>{const h=Math.max(4,peak*92),inside=(i+.5)/editor.peaks.length*totalMs>=clip.startMs&&(i+.5)/editor.peaks.length*totalMs<=clip.endMs;
       return <rect key={i} x={i+.18} width={.64} y={50-h/2} height={h} rx={.3} className={inside?styles.clipBarIn:styles.clipBar}/>;})}
     </svg>
     <div className={styles.clipWindow} style={{left:pct(clip.startMs,totalMs),width:pct(clip.endMs-clip.startMs,totalMs)}} aria-label={copy.window} {...editor.windowProps}>
      <span className={styles.clipHandle} data-edge="start" {...slider('start')} {...editor.edgeProps('start')}><i/></span>
      <span className={styles.clipHandle} data-edge="end" {...slider('end')} {...editor.edgeProps('end')}><i/></span>
     </div>
     {editor.playheadMs!==null&&<span className={styles.clipPlayhead} style={{left:pct(editor.playheadMs,totalMs)}} aria-hidden="true"/>}
    </div>
    <div className={styles.clipScale} aria-hidden="true"><span>0 秒</span><span>{secondsText(totalMs)} 秒</span></div>
    <p className={styles.clipReadout} aria-live="polite">{copy.picked(secondsText(clip.startMs),secondsText(clip.endMs),secondsText(clip.endMs-clip.startMs))}</p>
    <p className={styles.clipHeard}>{copy.heard(secondsText(editor.heard*1000),copy.pattern(unit.shape.pattern))}
     {/* One sound is never longer than the field: say what happens before the child applies it. */}
     {editor.heard>=SHAPING_RULES.limits.clipMaxSeconds-.05?copy.atMost(SHAPING_RULES.limits.clipMaxSeconds)
      :editor.heard>span+1e-6?copy.spanWillGrow(spanFor(editor.heard)):''}</p>
    <div className={styles.clipTools}>
     <button type="button" aria-pressed={listeningClip} onClick={editor.listenClip}><Glyph name={listeningClip?'stop':'play'}/>{listeningClip?copy.stop:copy.listenClip}</button>
     <button type="button" aria-pressed={listeningSource} onClick={editor.listenSource}><Glyph name={listeningSource?'stop':'play'}/>{listeningSource?copy.stop:copy.listenSource}</button>
     <button type="button" onClick={editor.useWhole}><Glyph name="sounds"/>{copy.useWhole}</button>
    </div>
   </>}
  </div>
  <div className={sheet.clipActions}>
   <button type="button" className={sheet.clipCancel} onClick={onClose}>{copy.cancel}</button>
   <button type="button" className={sheet.clipApply} disabled={!ready} onClick={editor.apply}><Glyph name="check"/>{copy.apply}</button>
  </div>
 </WorkSheet>;
}
