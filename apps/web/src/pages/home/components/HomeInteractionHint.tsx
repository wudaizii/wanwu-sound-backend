import {useEffect,useState} from 'react';
import {readPerformanceHints} from '../../../shared/platform/capabilities';
import styles from '../HomePage.module.css';

const defaultHint='点一点小动物和水滴，听声音、看它动一动';
export function HomeInteractionHint({feedback}:{feedback:{message:string;visible:boolean}}){
 const target=feedback.visible&&feedback.message?feedback.message:defaultHint;
 const [displayed,setDisplayed]=useState(target);
 const [fading,setFading]=useState(false);
 const reduced=readPerformanceHints().reduced;
 useEffect(()=>{
  if(target===displayed){setFading(false);return;}
  if(reduced){setDisplayed(target);setFading(false);return;}
  setFading(true);
  const timer=setTimeout(()=>{setDisplayed(target);setFading(false);},160);
  return()=>clearTimeout(timer);
 },[target,displayed,reduced]);
 return <p id="home-sticker-hint" className={`${styles.stickerHint} ${fading?styles['hint-fading']:''}`} role="status" aria-live="polite" aria-atomic="true">{displayed}</p>;
}
