import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import {SOUND_DIMENSIONS} from '@wanwu-v2/contracts/sound';
import {SoundSpirit} from '../../../shared/markers/SoundSpirit';
import type {SpiritHandle} from '../../../shared/markers/SoundSpirit';
import {computePeaks} from '../../../shared/audio/peaks';
import {dimensionCopy} from '../../../shared/creation/dimensionCopy';
import {birthCopy} from '../config/copy';
import {describeShape,remainingDimensions} from '../model/soundBirthState';
import type {useSoundBirth} from '../model/useSoundBirth';
import {MakerLabel} from './MakerLabel';
import {SoundInfo} from './SoundInfo';
import styles from './SpiritStage.module.css';

type Birth=ReturnType<typeof useSoundBirth>;
const labels={pitch:dimensionCopy.pitch.options,duration:dimensionCopy.duration.options,contour:dimensionCopy.contour.options,intensity:dimensionCopy.intensity.options,pattern:dimensionCopy.pattern.options};
/** How long a guide association stays in the bubble before it goes back to describing the sound. */
const HINT_MS=6000,HELLO_MS=1800,NOTICE_MS=8000,LEVEL_BINS=200;
/** Marker bodies are about 1.13 : 1; the stage keeps room above for the bubble and below for the floor. */
const BODY_RATIO=1.13,BUBBLE_ROOM=86,FLOOR_ROOM=26;

/**
 * Under 我的声卡: the sound itself as a character. It speaks for the sound (and the guide's associations), wakes up
 * when there is a sound, points at the row being chosen and taps along with what is playing. While a local sound's
 * info still needs checking, the 声卡信息 form takes the stage and the character waits small beside its bubble.
 */
export function SpiritStage({birth,reach}:{birth:Birth;reach:()=>Element|null}){
 const {state}=birth,source=state.source,editing=!!source&&!state.cardConfirmed;
 const spirit=useRef<SpiritHandle>(null),stage=useRef<HTMLDivElement>(null);
 const [size,setSize]=useState<number|null>(null);
 const [hello,setHello]=useState(false);
 const [hintKey,setHintKey]=useState<string|null>(null);
 /** A page notice (source tab or the five rows) the character is saying right now; the form's own notices stay in the form. */
 const [said,setSaid]=useState<NonNullable<typeof state.notice>|null>(null);

 // Bubble: a greeting, then a fresh guide association, otherwise what the sound is doing now.
 const sounding=birth.playing==='original'||birth.playing==='current';
 const description=describeShape(state.shape,labels);
 // "No sound yet" is already what the character says, so that notice only makes it hop; other notices it says itself.
 const askingForSound=!source&&said?.tone==='info';
 const spoken=said&&!askingForSound?said:null;
 const bubble=spoken?spoken.text:hello?birthCopy.bubble.hello
  :birth.hint&&hintKey===birth.hint.key?birth.hint.text
  :!source?birthCopy.bubble.empty:birth.playing==='original'?birthCopy.bubble.original:sounding?(description?birthCopy.bubble.current:birthCopy.bubble.sounding):description?birthCopy.bubble.shaped(description):birthCopy.bubble.fresh(state.name);
 useEffect(()=>{
  if(!birth.hint)return;
  setHintKey(birth.hint.key);const timer=setTimeout(()=>setHintKey(null),HINT_MS);return()=>clearTimeout(timer);
 },[birth.hint]);
 useEffect(()=>{if(!hello)return;const timer=setTimeout(()=>setHello(false),HELLO_MS);return()=>clearTimeout(timer);},[hello]);
 useEffect(()=>{
  const notice=state.notice;
  if(!notice||notice.area==='info'){setSaid(null);return;}
  setSaid(notice);spirit.current?.hop(1);
  const timer=setTimeout(()=>setSaid(null),NOTICE_MS);return()=>clearTimeout(timer);
 },[state.notice]);

 // A new sound wakes it with a wave; each choice is a little hop; the fifth one is a cheer.
 const sourceId=source?.id;
 useEffect(()=>{if(sourceId){spirit.current?.wave();spirit.current?.hop(1);}},[sourceId]);
 const done=SOUND_DIMENSIONS.length-remainingDimensions(state.shape).length,before=useRef(done);
 useEffect(()=>{
  if(done>before.current){if(done===SOUND_DIMENSIONS.length)spirit.current?.cheer();else spirit.current?.hop(.9);}
  before.current=done;
 },[done]);

 // Loudness of whatever the card's waveform is playing, read from its real peaks on the shared audio clock.
 const peaks=useMemo(()=>{const buffer=birth.wave.buffer;return buffer?computePeaks(Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i)),LEVEL_BINS):null;},[birth.wave.buffer]);
 const loud=useRef(0);
 loud.current=peaks&&birth.wave.progress>0?peaks[Math.min(LEVEL_BINS-1,Math.floor(birth.wave.progress*LEVEL_BINS))]!:0;
 const level=useCallback(()=>loud.current,[]);

 // The character fills the stage it has (desktop); phones size it in CSS.
 useLayoutEffect(()=>{
  const node=stage.current;if(!node)return;
  const observer=new ResizeObserver(([entry])=>{
   if(!entry)return;const {width,height}=entry.contentRect;
   setSize(Math.max(120,Math.min(width*.86,(height-BUBBLE_ROOM-FLOOR_ROOM)*BODY_RATIO)));
  });
  observer.observe(node);return()=>observer.disconnect();
 },[editing]);

 const character=<SoundSpirit handle={spirit} index={state.markerIndex} awake={!!source} compact={editing} className={styles.spirit}
  greetLabel={birthCopy.greet} onGreet={()=>setHello(true)} reach={reach} level={level}
  label={source?<MakerLabel maker={state.maker} index={state.markerIndex} onChange={name=>birth.dispatch({type:'maker',name})}/>:undefined}/>;
 const speech=<p key={spoken?`notice-${bubble}`:bubble} className={styles.bubble} data-tone={spoken?.tone} aria-live="polite">{bubble}</p>;
 if(editing)return <div className={styles.stage} data-mode="edit">
  <div className={styles.stageRow}>{speech}{character}</div>
  <SoundInfo birth={birth}/>
 </div>;
 return <div ref={stage} className={styles.stage} data-mode="card" style={size?{'--spirit-w':`${Math.round(size)}px`} as CSSProperties:undefined}>
  {speech}
  {character}
  {source?.provenance.group&&<span className={styles.groupTag}>{source.provenance.group}</span>}
 </div>;
}
