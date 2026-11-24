import {SOUND_SOURCE_MAX_MS} from '@wanwu-v2/contracts/sound';
import {WorkSheet,sheetStyles} from '../../../shared/ui/WorkSheet';
import {Glyph} from '../../../shared/ui/PaperIcon';
import {birthCopy} from '../config/copy';
import type {useSoundBirth} from '../model/useSoundBirth';
import {Waveform} from './Waveform';
import controls from './controls.module.css';
import styles from './RecordDialog.module.css';
import {ui} from '../../../shared/ui/controls';

type Birth=ReturnType<typeof useSoundBirth>;
const copy=birthCopy.recordDialog;
const seconds=(ms:number)=>`00:${String(Math.floor(ms/1000)).padStart(2,'0')}`;

/** 录一段声音: record → listen back → use or retake. Nothing leaves the device. */
export function RecordDialog({birth}:{birth:Birth}){
 const {phase,ms,take,progress}=birth.record;
 const error=birth.state.notice?.area==='bar'&&birth.state.notice.tone==='error'?birth.state.notice.text:'';
 return <WorkSheet title={copy.title} description={copy.description} onClose={birth.closeDialog}>
  <div className={styles.recorder} data-phase={phase}>
   {phase==='review'&&take?<>
    <Waveform className={styles.recorderWave} buffer={take} progress={progress} label="刚录的声音" playing={birth.playing==='take'} onPlay={birth.listenTake}/>
    <div className={sheetStyles.actions}>
     <button type="button" className={`${ui.pill} ${ui.outline} ${controls.secondary}`} onClick={()=>void birth.startRecording()}><Glyph name="replay"/>{copy.retake}</button>
     <button type="button" className={`${ui.pill} ${ui.go} ${controls.primary}`} onClick={birth.useTake}>{copy.use}<Glyph name="arrow"/></button>
    </div>
   </>:<>
    <p className={styles.recTime} role="timer" aria-live="off">{phase==='recording'&&<span className={styles.recDot} aria-hidden="true"/>}{seconds(birth.record.ms)}<small> / {seconds(SOUND_SOURCE_MAX_MS)}</small></p>
    {phase==='recording'
     ?<button type="button" className={styles.recButton} data-active onClick={()=>void birth.stopRecording()}><Glyph name="stop"/>{copy.stop}</button>
     :<button type="button" className={styles.recButton} disabled={phase==='starting'} onClick={()=>void birth.startRecording()}><Glyph name="mic"/>{phase==='starting'?copy.starting:copy.start}</button>}
    {ms===0&&<p className={sheetStyles.note} role="status">{error}</p>}
   </>}
  </div>
 </WorkSheet>;
}
