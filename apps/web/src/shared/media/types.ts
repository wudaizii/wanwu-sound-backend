export type ImageVariant = {url:string; width:number; height:number; bytes:number};
export type CharacterId = 'bird'|'frog'|'squirrel'|'cicada'|'drop'|'snail';
export type SoundId = 'bird'|'frog'|'cicada'|'drop'|'leaves';
export type SceneLayer = {
 id:string; label:string; kind:'character'|'environment'|'foreground';
 rect:[number,number,number,number]; z:number; origin?:string; motion?:CharacterId; sound?:SoundId|null;
 variants:Record<'mobile'|'desktop'|'fallback',ImageVariant>;
};
export type SoundClip = {label:string; kind:'recording'|'ambience';url:string;volume:number;bytes:number};
export type HomeManifest = {
 version:string;design:{width:number;height:number;approved:string};layers:SceneLayer[];
 sounds:Record<SoundId,SoundClip>;introDurationMs:number;
 totals:Record<'mobile'|'desktop'|'fallback',{all:number;scene:number;intro:number;decodedPixels:number}>;
};
/** Compressed derivatives of one transparent artwork: WebP per layout tier plus a PNG fallback. */
export type ArtVariants = Record<'mobile'|'desktop'|'fallback',ImageVariant>;
