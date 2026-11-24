// 声音体检 for decoded audio on this device: the rules package does the measuring; this only caches one result per buffer
// (a buffer is never changed, so its analysis never goes stale).
import type {SoundAnalysis} from '@wanwu-v2/contracts/sound';
import {analyseSamples} from '@wanwu-v2/sound-rules/analysis';
import {originalGain} from '@wanwu-v2/sound-rules/shaping';

const results=new WeakMap<AudioBuffer,SoundAnalysis>();

export function analysisOf(buffer:AudioBuffer):SoundAnalysis{
 let result=results.get(buffer);
 if(!result){
  result=analyseSamples(Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i)),buffer.sampleRate);
  results.set(buffer,result);
 }
 return result;
}
/** Level for hearing a recording as it is (听原声, library previews, a fresh take): the common loudness, unchosen level. */
export const originalGainOf=(buffer:AudioBuffer)=>originalGain(analysisOf(buffer));
