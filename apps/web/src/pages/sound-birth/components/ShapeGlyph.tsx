import type {SoundDimension} from '@wanwu-v2/contracts/sound';
import styles from './ShapeGlyph.module.css';

const guides=[16,32,48];
/** Small data-free diagrams for each option: solid dots, bars and lines (no hollow rings); SVG, so no image requests. */
export function ShapeGlyph({dimension,value}:{dimension:SoundDimension;value:string}){
 return <svg className={styles.glyph} viewBox="0 0 120 64" aria-hidden="true">{draw(dimension,value)}</svg>;
}
function draw(dimension:SoundDimension,value:string){
 switch(dimension){
  case 'pitch':{
   const y=value==='low'?48:value==='mid'?32:16;
   return <>{guides.map(g=><line key={g} className={styles.guide} x1="20" x2="100" y1={g} y2={g}/>)}<circle className={styles.dot} cx="60" cy={y} r="11"/></>;
  }
  case 'duration':{
   const width=value==='short'?22:value==='medium'?50:84;
   return <><rect className={styles.track} x="16" y="22" width="88" height="20" rx="10"/><rect className={styles.dot} x="16" y="22" width={width} height="20" rx="10"/></>;
  }
  case 'contour':{
   const d=value==='rising'?'M20 50C46 48 74 34 100 14':value==='falling'?'M20 14C46 16 74 30 100 50':value==='flat'?'M18 32H102':'M16 32c10-17 19-17 29 0s19 17 29 0 19-17 29 0';
   return <path className={styles.stroke} d={d}/>;
  }
  case 'intensity':{
   const r=value==='soft'?8:value==='medium'?14:22;
   return <><circle className={styles.halo} cx="60" cy="32" r="30"/><circle className={styles.dot} cx="60" cy="32" r={r}/></>;
  }
  case 'pattern':{
   const xs=value==='once'?[60]:value==='repeat'?[30,60,90]:value==='bursts'?[22,40,80,98]:[20,47,73,100];
   return <>{xs.map((x,i)=><circle key={x} className={styles.dot} cx={x} cy="32" r={value==='fade-in'?5+i*3:10} opacity={value==='fade-in'?.28+i*.24:1}/>)}</>;
  }
 }
}
