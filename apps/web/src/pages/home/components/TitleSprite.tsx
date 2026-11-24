import type {CSSProperties} from 'react';
import styles from './HandwrittenTitle.module.css';
export function TitleSprite({url,index,atlas}:{url:string;index:number;atlas:{columns:number;rows:number}}){
 const col=index%atlas.columns,row=Math.floor(index/atlas.columns);
 const style={backgroundImage:`url("${url}")`,backgroundSize:`${atlas.columns*100}% ${atlas.rows*100}%`,backgroundPosition:`${atlas.columns>1?col/(atlas.columns-1)*100:0}% ${atlas.rows>1?row/(atlas.rows-1)*100:0}%`} as CSSProperties;
 return <span className={styles.sprite} style={style}/>;
}
