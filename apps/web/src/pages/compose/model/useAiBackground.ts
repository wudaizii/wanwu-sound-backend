import {useEffect,useMemo,useRef,useState} from 'react';
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import type {BackgroundSource,BackgroundUnavailable} from '@wanwu-v2/contracts/background';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import type {ComposeSettings} from '@wanwu-v2/contracts/work';
import type {BackgroundNote} from '@wanwu-v2/sound-rules/background';
import {loadAudio} from '../../../shared/audio/loadAudio';
import {renderBackground} from '../../../shared/audio/renderBackground';
import {backgroundBrief} from '../../../shared/background/backgroundLayer';
import {runBackgroundChain} from '../../../shared/background/generator';
import type {BackgroundGenerator,ChainOutcome} from '../../../shared/background/generator';
import type {BackgroundLayer} from '../../../shared/background/useBackgroundLayer';

/**
 * Where the AI background stands: `closed` = no AI step is connected (nothing is sent); `working` = asking (the local
 * background plays meanwhile); `ready` = one came back and the child may switch to it; `unavailable` = the chain ended
 * without one (offline, too slow, over quota…), so the local background stays.
 */
export type AiBackgroundState=
 |{status:'closed'}
 |{status:'working'}
 |{status:'ready';source:Exclude<BackgroundSource,'local-rules'>}
 |{status:'unavailable';reason:BackgroundUnavailable};
type Ready=Extract<ChainOutcome,{status:'ready'}>['result'];

const AUDIO_TIMEOUT_MS=20_000;

/**
 * 万物成曲's AI background, on top of the local layer: asks the chain when the piece or what the background follows
 * changes, never switches on its own, and plays the AI result only while the child chose it. Turning it back to the
 * local background is always one tap.
 */
export function useAiBackground(arrangement:Arrangement|null,settings:ComposeSettings,tracks:readonly TextbookTrack[],layer:BackgroundLayer,generator:BackgroundGenerator){
 const [state,setState]=useState<AiBackgroundState>({status:generator.open.length?'working':'closed'});
 const [result,setResult]=useState<Ready|null>(null);
 const [using,setUsing]=useState(false);
 const instruments=settings.background.instruments;
 const brief=useMemo(()=>arrangement&&arrangement.events.length?backgroundBrief(arrangement,settings.inspiration,tracks,instruments):null,
  [arrangement,settings.inspiration,tracks,instruments]);
 const briefKey=brief?JSON.stringify(brief):'';

 // A new piece (or song, or instruments) asks again; the old AI result no longer fits it.
 useEffect(()=>{
  setResult(null);setUsing(false);
  if(!generator.open.length){setState({status:'closed'});return;}
  if(!brief){setState({status:'unavailable',reason:'failed'});return;}
  const controller=new AbortController();
  setState({status:'working'});
  void runBackgroundChain(generator,brief,controller.signal).then(outcome=>{
   if(controller.signal.aborted)return;
   if(outcome.status==='ready'){setResult(outcome.result);setState({status:'ready',source:outcome.result.source});}
   else setState({status:'unavailable',reason:outcome.reason});
  });
  return()=>controller.abort();
 // Only when what would be sent changes.
 },[briefKey,generator]);

 const renders=useRef(new Map<Ready,Promise<AudioBuffer>>());
 /** The AI background for this piece, or null to play the local one. */
 const buffer=(piece:Arrangement):Promise<AudioBuffer>|null=>{
  if(!using||!result)return null;
  let render=renders.current.get(result);
  if(!render){
   render=result.source==='audio-ai'?loadAudio(result.audioUrl,{timeoutMs:AUDIO_TIMEOUT_MS})
    // AI notes are played like the local ones: same instruments, fades and room under the child's sounds.
    :renderBackground({...layer.plan(piece),notes:result.notes as BackgroundNote[]},layer.parts,layer.voices);
   renders.current.set(result,render);render.catch(()=>renders.current.delete(result));
  }
  return render;
 };
 const source:BackgroundSource=using&&result?result.source:'local-rules';
 /** The prompt version behind the background playing now (null for the local one), kept with a saved piece. */
 const prompt=using&&result?result.promptVersion:null;
 return {state,using,source,prompt,buffer,
  /** Switch between the AI background (when one is ready) and the local one. */
  toggle:()=>{if(result)setUsing(current=>!current);}};
}
