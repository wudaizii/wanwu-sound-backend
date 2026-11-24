import type {CSSProperties} from 'react';
import type {IntroState} from '../model/introState';
import {useTitleMotion} from '../model/useTitleMotion';
import {titleAssets,titleCanvas,titleMotion,titleGlyphs,titleParticles} from '../config/title';
import {TitleSprite} from './TitleSprite';
import styles from './HandwrittenTitle.module.css';
const position=(x:number,y:number,size:number,height=size)=>({left:`${x/titleCanvas.width*100}%`,top:`${y/titleCanvas.height*100}%`,width:`${size/titleCanvas.width*100}%`,height:`${height/titleCanvas.height*100}%`});
export function HandwrittenTitle({opening,cycle}:{opening:IntroState;cycle:number}){
 const state=useTitleMotion(opening,cycle);
 return <h1 id="home-title" className={styles.title} data-phase={state.phase} data-ambient={state.ambient} data-paused={state.paused}>
  <span className={styles.accessible}>今天，你听见了什么？</span>
  {state.lettering.failed?<span aria-hidden="true" className={styles.fallback}><span>今天，</span>你听见了什么？</span>:state.lettering.ready?<span key={cycle} aria-hidden="true">
   <span className={styles.particles}>{titleParticles.map((p,i)=>{const bubble=p.index>=3,resource=bubble?state.bubbles:state.doodles;if(!resource.ready)return null;return <span key={i} className={styles.particleSlot} style={{...position(p.x,p.y,p.size),'--rise':`${p.rise/titleCanvas.width*550}px`,'--drift':`${p.drift}px`,'--angle':`${p.angle}deg`,'--duration':`${p.duration}ms`,'--launch-delay':`${p.delay}ms`} as CSSProperties}>
    <span className={styles.particle}><TitleSprite url={resource.url} index={bubble?p.index-3:p.index} atlas={bubble?titleAssets.bubbles:titleAssets.doodles}/></span>
   </span>;})}</span>
   <span className={styles.letters}>{titleGlyphs.map((g,i)=><span key={g.index} data-title-glyph={g.index} className={styles.glyphSlot} style={{...position(g.x,g.y,g.size,g.height),'--angle':`${g.angle}deg`,'--delay':`${i*titleMotion.staggerMs}ms`,'--enter-ms':`${titleMotion.enterMs}ms`} as CSSProperties}>
    <span className={styles.pop}><TitleSprite url={state.lettering.url} index={g.index} atlas={titleAssets.lettering}/></span>
   </span>)}</span>
  </span>:null}
 </h1>;
}
