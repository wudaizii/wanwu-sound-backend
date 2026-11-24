// Bundled example sounds for the sound library: whole original recordings, only converted to MP3 — no excerpt is chosen
// for the child. The list, credits and presets come from docs/assets/library-recipe.json through the generated catalogue
// (scripts/build-library-audio.mjs); add a sound there, not here. Credits are public attributions, not children's data.
// Shared by 声音诞生 (pick a source) and 万物声场 / 万物成曲 (example units), so all resolve the same audio.
import {isChosenShape,isSoundAnalysis} from '@wanwu-v2/contracts/sound';
import type {ChosenShape,SoundAnalysis} from '@wanwu-v2/contracts/sound';
import catalogue from './library-sounds.generated.json' with {type:'json'};

export const EXAMPLE_PROVENANCE_URL='/legal/sound-sources.html';
/** How long to wait for an example to load before saying the network is slow (the longest is about 350 KB). */
export const EXAMPLE_TIMEOUT_MS=12_000;

export type ExampleSound={id:string;label:string;by:string;url:string;bytes:number;durationMs:number;
 /** The project's five choices for this example (shown as 示例, never as a child's); null = none. */
 preset:ChosenShape|null;
 /** 声音体检 of the published file, made when the library was built (same rules as on the device). */
 analysis:SoundAnalysis};
export const exampleSounds:readonly ExampleSound[]=catalogue.sounds.map(sound=>{
 if(sound.preset&&!isChosenShape(sound.preset))throw new Error('Bad example preset: '+sound.id);
 if(!isSoundAnalysis(sound.analysis))throw new Error('Library catalogue has no valid analysis: run npm run assets:library');
 return {...sound,preset:sound.preset as ChosenShape|null,analysis:sound.analysis};
});

export const exampleSourceId=(id:string)=>`example:${id}`;
export const exampleSound=(id:string)=>exampleSounds.find(sound=>sound.id===id)??null;
/** Audio URL for a bundled example source id (`example:bird`), or null for anything else. */
export function exampleSourceUrl(sourceId:string){
 return exampleSounds.find(sound=>exampleSourceId(sound.id)===sourceId)?.url??null;
}
