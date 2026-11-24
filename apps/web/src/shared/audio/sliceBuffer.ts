import {getAudioContext} from './audioContext';

/** A new buffer holding [startMs, endMs) of `buffer`. The input is only read, never changed. */
export function sliceBuffer(buffer:AudioBuffer,startMs:number,endMs:number):AudioBuffer{
 const rate=buffer.sampleRate;
 const from=Math.max(0,Math.min(buffer.length,Math.round(startMs/1000*rate)));
 const to=Math.max(from+1,Math.min(buffer.length,Math.round(endMs/1000*rate)));
 const out=getAudioContext().createBuffer(buffer.numberOfChannels,to-from,rate);
 for(let channel=0;channel<buffer.numberOfChannels;channel++)out.copyToChannel(buffer.getChannelData(channel).subarray(from,to),channel);
 return out;
}
