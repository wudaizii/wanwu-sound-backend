// Four neutral paper markers. They identify a sound source only; they carry no type, pitch, volume or mood meaning.
import generated from './marker-assets.generated.json';
import type {ArtVariants} from '../media/types';

const order=['marker-sage','marker-ochre','marker-slate','marker-lilac'] as const;
type Crop={left:number;top:number;width:number;height:number};
const assets=generated.assets as Record<string,{label:string;crop:Crop;variants:ArtVariants}>;
/** `crop` is where the trimmed artwork sits in the 627 × 627 original, so live overlays (eyes, arms) can line up. */
export const soundMarkers=order.map(id=>{const asset=assets[id];if(!asset)throw new Error('Missing marker '+id);return {id,label:asset.label,crop:asset.crop,variants:asset.variants};});

/** Markers repeat after four; the visible number keeps every sound distinct, so colour is never the only cue. */
export function markerFor(index:number){return soundMarkers[((index%soundMarkers.length)+soundMarkers.length)%soundMarkers.length]!;}
export function markerNumber(index:number){return String(index+1).padStart(2,'0');}
