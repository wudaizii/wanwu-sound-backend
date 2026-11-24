import type {PlacedEvent} from '@wanwu-v2/contracts/arrangement';
import {Glyph} from '../../../shared/ui/PaperIcon';
import {worldCopy} from '../config/copy';
import {spotPosition} from '../model/fieldGeometry';
import type {SoundWorld} from '../model/useSoundWorld';
import styles from './EventToolbar.module.css';

/**
 * Small floating tools for the selected occurrence: 剪一剪 · 复制 · 移除, each with text (tapping the sound itself plays
 * it). It sits just under the marker (above it in the bottom row) and hugs the field edge near either end.
 */
export function EventToolbar({world,event,rows,onTrim}:{world:SoundWorld;event:PlacedEvent;rows:number;onTrim:()=>void}){
 const side=event.row===rows-1?'above':'below',edge=event.at<.18?'start':event.at>.82?'end':'center';
 return <div className={styles.toolbar} data-toolbar data-side={side} data-edge={edge} style={spotPosition(event,rows)} role="toolbar" aria-label={worldCopy.toolbar.label}>
  <button type="button" onClick={onTrim}><Glyph name="trim"/>{worldCopy.toolbar.trim}</button>
  <button type="button" onClick={()=>world.copy(event.id)}><Glyph name="copy"/>{worldCopy.toolbar.copy}</button>
  <button type="button" data-tone="remove" onClick={()=>world.remove(event.id)}><Glyph name="trash"/>{worldCopy.toolbar.remove}</button>
 </div>;
}
