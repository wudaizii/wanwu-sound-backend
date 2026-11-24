// Guide-hint port: the association the sound marker says after each choice. Today the answer is the corpus
// (@wanwu-v2/prompts/corpus, sound-hints.v1.json): the line for this kind of sound first, and the next line when the
// same choice is made again. A model-backed provider (sound-hint prompt, closed for now) can implement the same
// interface later — the page won't change. Nothing the child typed (names, places) is part of a request.
import type {SoundDimension,SoundKind,SoundShape} from '@wanwu-v2/contracts/sound';
import {presetHint} from '@wanwu-v2/prompts/corpus';

/** `kind` is the 声音体检 result of the current sound (null before it is known). */
export type HintRequest={dimension:SoundDimension;value:string;shape:Partial<SoundShape>;kind:SoundKind|null};
export type SoundHint={text:string;origin:'preset'|'model'};
export type SoundHintProvider={hint(request:HintRequest,signal?:AbortSignal):Promise<SoundHint|null>};

/** The corpus provider; it counts how often each choice was made while the site is open, so a repeat says something new. */
export function corpusHintProvider():SoundHintProvider{
 const turns=new Map<string,number>();
 return {
  async hint({dimension,value,kind}){
   const key=`${dimension}:${value}`,turn=turns.get(key)??0;
   turns.set(key,turn+1);
   const text=presetHint(dimension,value,kind,turn);
   return text?{text,origin:'preset'}:null;
  },
 };
}
export const presetHintProvider=corpusHintProvider();
