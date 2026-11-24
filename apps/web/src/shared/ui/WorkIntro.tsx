import type {ArtVariants} from '../media/types';
import {ArtPicture} from '../media/ArtPicture';
import styles from './WorkIntro.module.css';

/**
 * The work pages' header: title + subtitle on the left, the guide animal and its speech bubble on the right (bubble on
 * the animal's other side on phones). Used by 万物声场, 万物成曲 and 作品书架. 声音诞生 (accepted earlier) keeps its own
 * header: its sizes and breakpoints differ and are not forced into this one.
 *
 * Per-page differences (animal backdrop colours, art size, margins) are CSS variables set by the page on `className` —
 * see WorkIntro.module.css for the list. `fit` turns on the tighter rhythm for one-screen pages on short laptop
 * screens. With `rekey`, the bubble and the animal replay their entrance whenever the line changes.
 */
export function WorkIntro({title,subtitle,guide,text,tone,fit=false,rekey=true,className=''}:{
 title:string;subtitle:string;guide:{label:string;variants:ArtVariants};text:string;
 /** The guide is passing on a page notice (`error` tints the bubble). */
 tone?:'info'|'error';
 fit?:boolean;rekey?:boolean;className?:string;
}){
 return <header className={`${styles.intro} ${className}`} data-fit={fit||undefined}>
  <div className={styles.introText}><h1>{title}</h1><p>{subtitle}</p></div>
  <aside className={styles.guidePanel} aria-label={guide.label}>
   <p key={rekey?text:undefined} className={styles.guideBubble} data-tone={tone} aria-live="polite">{text}</p>
   <span key={rekey?`guide-${text}`:undefined} className={styles.mascot}><ArtPicture variants={guide.variants} className={styles.mascotArt} priority="high"/></span>
  </aside>
 </header>;
}
