import {useLayoutEffect} from 'react';
import type {CSSProperties,ReactNode} from 'react';
import {homeBirthMotion} from './config';
import type {HomeBirthPhase} from './transitionState';
import styles from './HomeBirthTransition.module.css';

/** Inside Suspense, so ready means the real page has committed rather than its loading fallback. */
export function HomeBirthDestination({onReady,children}:{onReady:()=>void;children:ReactNode}){
 useLayoutEffect(onReady,[onReady]);
 return <>{children}</>;
}
type Props={phase:HomeBirthPhase;overlay:boolean;scrollOffset:number;home:ReactNode;children:ReactNode};
export function HomeBirthTransition({phase,overlay,scrollOffset,home,children}:Props){
 const style={'--crossfade-duration':`${homeBirthMotion.durationMs}ms`,'--home-top':`${-scrollOffset}px`} as CSSProperties;
 return <div data-page-crossfade={phase} className={styles.root} style={style}>
  <div inert={phase!=='idle'||undefined}>{children}</div>
  {home&&<div className={styles.home} data-overlay={overlay||undefined} aria-hidden={overlay||undefined}>{home}</div>}
 </div>;
}
