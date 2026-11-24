import type {CSSProperties} from 'react';
import {Glyph} from '../../../shared/ui/PaperIcon';
import {composeCopy} from '../config/copy';
import {clockText} from '../model/scoreLayout';
import type {Compose} from '../model/useCompose';
import styles from './Transport.module.css';

/**
 * 播放 / 暂停 · 从头听 · a draggable progress bar. The bar's value is the same playback time the score's playhead and
 * highlights use; dragging pauses, releasing carries on from the new spot if it was playing.
 */
export function Transport({compose}:{compose:Compose}){
 const {now,total,playing,preparing}=compose;
 const ready=!!compose.layout?.items.length;
 const nowText=clockText(now),totalText=clockText(Math.ceil(total-1e-6));
 const fill=total?Math.min(1,now/total):0;
 return <div className={styles.transport}>
  <button type="button" className={styles.playButton} aria-pressed={playing} data-busy={preparing||undefined} disabled={!ready} onClick={compose.togglePlay}>
   <span className={styles.playCircle}><Glyph name={playing||preparing?'pause':'play'}/></span>
   <span>{preparing?composeCopy.preparing:playing?composeCopy.pause:composeCopy.play}</span>
  </button>
  <button type="button" className={styles.restartButton} disabled={!ready} onClick={compose.restart}><Glyph name="restart"/><span>{composeCopy.restart}</span></button>
  <div className={styles.progress}>
   <input type="range" min={0} max={total||1} step={.1} value={Math.min(now,total)} disabled={!ready}
    aria-label={composeCopy.progressLabel} aria-valuetext={composeCopy.progressValue(nowText,totalText)} style={{'--fill':`${fill*100}%`} as CSSProperties}
    onChange={event=>compose.scrubTo(Number(event.target.value))}
    onPointerUp={compose.endScrub} onKeyUp={compose.endScrub} onBlur={compose.endScrub}/>
   <p>{composeCopy.progressHint}</p>
  </div>
  <span className={styles.clock} aria-hidden="true">{nowText} <i>/</i> {totalText}</span>
 </div>;
}
