import {useLayoutEffect,useRef,useState} from 'react';
import type {CSSProperties,ReactNode} from 'react';
import type {ArtVariants} from './types';
import styles from './ArtPicture.module.css';
import {media} from '../../styles/breakpoints';

type ArtPictureProps={variants:ArtVariants;className?:string;style?:CSSProperties;priority?:'high'|'low'|'auto';fallback?:ReactNode};

/**
 * Decorative artwork that keeps its box while loading, fades in once loaded and never leaves a broken image.
 * WebP → PNG fallback → caller's `fallback` content (or nothing).
 */
export function ArtPicture({variants,className='',style,priority='auto',fallback=null}:ArtPictureProps){
 const image=useRef<HTMLImageElement>(null);
 const [usePng,setUsePng]=useState(false);
 const [state,setState]=useState<'loading'|'ready'|'failed'>('loading');
 // A memory-cached image may finish before the load listener matters; show it without a fade.
 useLayoutEffect(()=>{const node=image.current;if(node?.complete&&node.naturalWidth>0)setState('ready');},[]);
 if(state==='failed')return <>{fallback}</>;
 return <picture className={`${styles.picture} ${className}`} style={style} data-state={state}>
  {!usePng&&<><source media={media.phone} type="image/webp" srcSet={variants.mobile.url}/><source type="image/webp" srcSet={variants.desktop.url}/></>}
  <img ref={image} src={variants.fallback.url} width={variants.desktop.width} height={variants.desktop.height} alt="" draggable={false} decoding="async" fetchPriority={priority}
   onLoad={()=>setState('ready')} onError={()=>{if(!usePng)setUsePng(true);else setState('failed');}}/>
 </picture>;
}
