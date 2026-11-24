import {useId,useMemo} from 'react';
import {computePeaks} from '../../../shared/audio/peaks';
import {Glyph} from '../../../shared/ui/PaperIcon';
import styles from './Waveform.module.css';

const BINS=64,W=320,MID=32,AMP=26;
const clock=(seconds:number)=>`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
const peaksOf=(buffer:AudioBuffer|null)=>buffer?computePeaks(Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i)),BINS):null;
/** A drawn wave whose swing follows the real peaks: alternate points up and down, smoothed through their midpoints. */
function wavePath(peaks:readonly number[]){
 const points=peaks.map((peak,i)=>[i/(peaks.length-1)*W,MID+(i%2?1:-1)*Math.max(.05,peak)*AMP] as const);
 let d=`M0 ${MID}`;
 for(let i=0;i<points.length-1;i++){const [x,y]=points[i]!,[nx,ny]=points[i+1]!;d+=`Q${x.toFixed(1)} ${y.toFixed(1)} ${((x+nx)/2).toFixed(1)} ${((y+ny)/2).toFixed(1)}`;}
 return d+`L${W} ${MID}`;
}

/**
 * Real peaks of the buffer being shown, drawn as a wave; the played part darkens from the shared audio clock.
 * `ghost` (the original) is drawn behind as a dotted line, so the shaped version can be compared at a glance.
 */
export function Waveform({buffer,ghost=null,progress,label,playing,onPlay,className}:{buffer:AudioBuffer|null;ghost?:AudioBuffer|null;progress:number;label:string;playing?:boolean;onPlay?:()=>void;className?:string}){
 const clip='wave'+useId().replace(/[^a-zA-Z0-9_-]/g,'');
 const now=useMemo(()=>{const peaks=peaksOf(buffer);return peaks&&wavePath(peaks);},[buffer]);
 const behind=useMemo(()=>{const peaks=peaksOf(ghost);return peaks&&wavePath(peaks);},[ghost]);
 if(!buffer||!now)return null;
 const head=progress*W;
 return <div className={className?`${styles.wave} ${className}`:styles.wave} data-has-play={!!onPlay||undefined}>
  {onPlay&&<button type="button" className={styles.wavePlay} aria-label={`${playing?'停止':'播放'}${label}`} aria-pressed={playing} onClick={onPlay}><Glyph name={playing?'stop':'play'}/></button>}
  <div className={styles.waveBox}>
   <svg viewBox={`0 0 ${W} 64`} preserveAspectRatio="none" role="img" aria-label={label}>
    <line className={styles.waveMid} x1="0" x2={W} y1={MID} y2={MID}/>
    {behind&&<path className={styles.waveGhost} d={behind}/>}
    <path className={styles.waveNow} d={now}/>
    {progress>0&&<>
     <clipPath id={clip}><rect x="0" y="0" width={head} height="64"/></clipPath>
     <path className={styles.wavePlayed} d={now} clipPath={`url(#${clip})`}/>
     <line className={styles.waveHead} x1={head} x2={head} y1="6" y2="58"/>
    </>}
   </svg>
   {behind&&<p className={styles.legend} aria-hidden="true"><span><i data-line="now"/>现在的</span><span><i data-line="original"/>原声</span></p>}
  </div>
  <span className={styles.time}>{clock(progress*buffer.duration)} / {clock(Math.max(1,Math.round(buffer.duration)))}</span>
 </div>;
}
