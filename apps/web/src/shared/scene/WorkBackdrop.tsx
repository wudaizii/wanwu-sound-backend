// Faint home-forest frame behind the work pages (声音诞生 onward): the home scene's environment layers (same hashed
// files, usually already cached), placed exactly as the home page places them — each rect scaled to the full window in
// both directions (design 1440 × 960) — so the bushes run along the left and right edges without gaps.
import {ArtPicture} from '../media/ArtPicture';
import {homeScene} from './homeScene';
import styles from './WorkBackdrop.module.css';

const {width:designWidth,height:designHeight}=homeScene.design;
const pct=(value:number,total:number)=>`${value/total*100}%`;
const layers=homeScene.layers.filter(layer=>layer.kind==='environment').map(layer=>{
 const [x,y,width,height]=layer.rect;
 return {id:layer.id,variants:layer.variants,
  box:{left:pct(x,designWidth),top:pct(y,designHeight),width:pct(width,designWidth),height:pct(height,designHeight)}};
});
/** How visible the frame is: high transparency so it never competes with the cards. */
const opacity=.12;

/** Decorative, fixed behind everything; loads at low priority and is hidden on phones. */
export function WorkBackdrop(){
 return <div className={styles.backdrop} style={{opacity}} aria-hidden="true">
  {layers.map(layer=><ArtPicture key={layer.id} variants={layer.variants} priority="low" className={styles.layer} style={layer.box}/>)}
 </div>;
}
