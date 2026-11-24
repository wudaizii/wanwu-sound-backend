import {media} from '../../styles/breakpoints';
export type ConnectionHint = {saveData?:boolean;effectiveType?:string};
type HintedNavigator = Navigator & {connection?:ConnectionHint;deviceMemory?:number};
export function readPerformanceHints(){
 const device=navigator as HintedNavigator;
 return {
  reduced:matchMedia(media['reduced-motion']).matches,
  saveData:!!device.connection?.saveData,
  weak:['slow-2g','2g'].includes(device.connection?.effectiveType||''),
  lowDevice:(!!device.deviceMemory&&device.deviceMemory<=2)||(device.hardwareConcurrency>0&&device.hardwareConcurrency<=2),
 };
}
export function readSessionFlag(key:string){try{return sessionStorage.getItem(key)==='1';}catch{return false;}}
export function writeSessionFlag(key:string){try{sessionStorage.setItem(key,'1');}catch{/* Storage is optional. */}}
export function subscribeReducedMotion(callback:()=>void){
 const query=matchMedia(media['reduced-motion']);
 if(query.addEventListener){query.addEventListener('change',callback);return()=>query.removeEventListener('change',callback);}
 query.addListener(callback);return()=>query.removeListener(callback);
}
