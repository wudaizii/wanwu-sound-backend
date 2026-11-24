import {useMemo,useRef} from 'react';
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import type {ComposeSettings} from '@wanwu-v2/contracts/work';
import {assignParts,backgroundPlan} from '@wanwu-v2/sound-rules/background';
import {MIX_RULES} from '@wanwu-v2/sound-rules/mix';
import {renderBackground} from '../audio/renderBackground';
import {backgroundInput,inspirationTrack} from './backgroundLayer';
import type {Instrument} from './instruments';

/** Renders kept at once (a few lengths and arrangements); older ones are let go. */
const KEEP=6;

/**
 * The background layer both pages play under the child's sounds: who plays it (instruments split the parts, none =
 * the original voice), the textbook song it borrows from, its level, and its renders (cached per plan input). The
 * notes come from the local rules (@wanwu-v2/sound-rules/background); the arrangement is read when it is played.
 */
export function useBackgroundLayer(settings:ComposeSettings,instruments:readonly Instrument[],tracks:readonly TextbookTrack[]){
 const {background,inspiration}=settings;
 const renders=useRef(new Map<string,Promise<AudioBuffer>>());
 /** Instruments playing the background; none chosen = the original voice. */
 const chosen=useMemo(()=>background.instruments.flatMap(id=>instruments.filter(item=>item.id===id)),[background.instruments,instruments]);
 const parts=useMemo(()=>assignParts(chosen),[chosen]);
 /** How each chosen instrument sounds (by id), for the renderer. */
 const voices=useMemo(()=>Object.fromEntries(chosen.map(item=>[item.id,item.recipe])),[chosen]);
 const track=inspirationTrack(inspiration,tracks);
 const gain=background.enabled?background.volume*MIX_RULES.backgroundMaxGain:0;
 /** Changes when who plays it or what it borrows changes (the arrangement is read at play time). */
 const key=`${chosen.map(item=>item.id).join('+')||'original'}|${track?.id??'-'}`;
 const plan=(arrangement:Arrangement)=>backgroundPlan(backgroundInput(arrangement,inspiration,tracks));
 const buffer=(arrangement:Arrangement)=>{
  const input=backgroundInput(arrangement,inspiration,tracks),cacheKey=`${key}|${JSON.stringify(input)}`,cache=renders.current;
  let render=cache.get(cacheKey);
  if(!render){
   render=renderBackground(backgroundPlan(input),parts,voices);
   cache.set(cacheKey,render);render.catch(()=>cache.delete(cacheKey));
   while(cache.size>KEEP)cache.delete(cache.keys().next().value!);
  }
  return render;
 };
 return {enabled:background.enabled,chosen,parts,voices,track,gain,key,plan,buffer};
}
export type BackgroundLayer=ReturnType<typeof useBackgroundLayer>;
