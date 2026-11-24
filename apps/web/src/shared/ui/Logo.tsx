import type {CSSProperties} from 'react';
import {ArtPicture} from '../media/ArtPicture';
import {soundMarkers} from '../markers/markers';
import {spiritPoses} from '../markers/spiritPoses';
import styles from './Logo.module.css';
import {media} from '../../styles/breakpoints';

// 万物声谱 as one emblem (reference: the approved logo sketch). Each sound marker belongs to one character and weaves
// through it: its body sits behind or in front of the strokes, its hands grip a stroke from the front, and the ones
// standing on the ground cast a soft contact shadow. The word keeps the caller's font size; pebbles are sized in em.
// Decorative only: the text is the name.
type Mood='look'|'happy'|'surprised';
type Arm={hand:readonly [number,number];wave?:boolean};
type Stone={marker:number;char:number;size:number;
 /** Position of the pebble's box from the character's left / bottom edge (em). */
 x:number;y:number;tilt:number;
 /** `behind`: the character's strokes cover the body; `front`: the body covers the strokes. Hands are always in front. */
 layer:'behind'|'front';mood:Mood;gaze?:readonly [number,number];
 motion:'sway'|'hop'|'bob'|'breathe';
 /** Standing on the ground (contact shadow) or resting on a stroke (soft cast shadow on the letter). */
 grounded:boolean;
 /** Arm per side (0 left, 1 right); the hand is relative to the shoulder in marker units. Missing = tucked away. */
 arms:readonly (Arm|null)[]};

const STONES:readonly Stone[]=[
 // 万: a big green one hides behind the left of the character and hugs its stroke.
 {marker:0,char:0,size:1.02,x:-.42,y:.02,tilt:-6,layer:'behind',mood:'look',gaze:[.35,-.1],motion:'sway',grounded:true,
  arms:[null,{hand:[150,40]}]},
 // between 万 and 物: a little purple one on the ground, in front, one arm up.
 {marker:3,char:1,size:.6,x:-.36,y:-.04,tilt:6,layer:'front',mood:'happy',motion:'hop',grounded:true,
  arms:[{hand:[-40,110]},{hand:[60,-230],wave:true}]},
 // 声: a yellow one sits on top of the character, its lower half behind the top stroke, both hands holding on.
 {marker:1,char:2,size:.8,x:.14,y:.56,tilt:4,layer:'behind',mood:'happy',motion:'bob',grounded:false,
  arms:[{hand:[40,150]},{hand:[-30,140]}]},
 // 谱: a small blue one peeks out from behind the bottom right, gripping the edge.
 {marker:2,char:3,size:.62,x:.84,y:-.02,tilt:-4,layer:'behind',mood:'look',gaze:[-.45,0],motion:'breathe',grounded:true,
  arms:[{hand:[-130,10]},null]},
];
const INK='#171a16',ARM=34,HAND=30;

function Eyes({id,mood,gaze=[0,0]}:{id:string;mood:Mood;gaze?:readonly [number,number]}){
 const pose=spiritPoses[id]!;
 return <>{pose.eyes.map(([x,y,angle,rx,ry],i)=><g key={i} transform={`translate(${x} ${y}) rotate(${angle})`}>
  {mood==='happy'
   ?<path d={`M${-rx*.8} ${ry*.25}Q0 ${-ry*.8} ${rx*.8} ${ry*.25}`} fill="none" stroke={INK} strokeWidth="22" strokeLinecap="round"/>
   :<>
    <ellipse cx="8" cy="2" rx={rx} ry={ry} fill="#777a72" opacity=".45"/>
    <ellipse rx={rx} ry={ry} fill="#fffefa"/>
    <ellipse cx={gaze[0]*rx} cy={gaze[1]*ry} rx={rx*(mood==='surprised'?.34:.5)} ry={ry*(mood==='surprised'?.34:.52)} fill="#111510"/>
   </>}
  {mood==='happy'&&<ellipse cx={i?rx*.9:-rx*.9} cy={ry*.9} rx={rx*.42} ry={ry*.24} fill="#ffd4d9"/>}
 </g>)}</>;
}

function Arms({stone,shoulders,still}:{stone:Stone;shoulders:readonly (readonly [number,number])[];still:boolean}){
 return <>{stone.arms.map((arm,i)=>{
  if(!arm)return null;
  const [sx,sy]=shoulders[i]!,[hx,hy]=arm.hand;
  const limb=<><path d={`M0 0Q${hx*.5} ${hy*.15-40} ${hx} ${hy}`} fill="none" stroke={INK} strokeWidth={ARM} strokeLinecap="round"/><circle cx={hx} cy={hy} r={HAND} fill={INK}/></>;
  return <g key={i} transform={`translate(${sx} ${sy})`}>
   {arm.wave?<g>{limb}{!still&&<animateTransform attributeName="transform" type="rotate" values="-6;16;-6" dur="1.2s" repeatCount="indefinite"/>}</g>:limb}
  </g>;
 })}</>;
}

function Pebble({stone,still}:{stone:Stone;still:boolean}){
 const marker=soundMarkers[stone.marker]!,pose=spiritPoses[marker.id]!,{crop}=marker;
 const box=`${crop.left} ${crop.top} ${crop.width} ${crop.height}`;
 const style={'--size':`${stone.size}em`,'--x':`${stone.x}em`,'--y':`${stone.y}em`,'--tilt':`${stone.tilt}deg`,'--ratio':crop.height/crop.width} as CSSProperties;
 // Body and hands are separate layers so the character's strokes can pass between them.
 return <span className={styles.pebble} data-layer={stone.layer} data-motion={stone.motion} data-grounded={stone.grounded||undefined} style={style} aria-hidden="true">
  {stone.grounded&&<span className={styles.contact}/>}
  <span className={styles.body}>
   <ArtPicture variants={marker.variants} className={styles.art} fallback={<span className={styles.shape}/>}/>
   <svg className={styles.overlay} viewBox={box}><Eyes id={marker.id} mood={stone.mood} gaze={stone.gaze}/></svg>
  </span>
  <svg className={styles.hands} viewBox={box}><Arms stone={stone} shoulders={pose.shoulders} still={still}/></svg>
 </span>;
}

/** The brand: the word at the caller's size with the sound markers woven through its characters. */
export function Logo({text='万物声谱'}:{text?:string}){
 const still=typeof matchMedia==='function'&&matchMedia(media['reduced-motion']).matches;
 return <span className={styles.logo}>
  <span className={styles.ground} aria-hidden="true"/>
  {[...text].map((char,i)=><span key={i} className={styles.char}>{char}
   {STONES.filter(stone=>stone.char===i).map(stone=><Pebble key={stone.marker} stone={stone} still={still}/>)}
  </span>)}
 </span>;
}
