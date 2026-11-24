import test from 'node:test';
import assert from 'node:assert/strict';
import {pcm16Wave,readPcm16Wave,pcmMetrics} from '../src/pcm.ts';

test('canonical PCM roundtrips stereo without changing sample count or channels',()=>{
 const source=[new Float32Array([0,.2,-.2,1,-1]),new Float32Array([.5,0,-.5,.1,-.1])];
 const result=readPcm16Wave(pcm16Wave(source));
 assert.equal(result.sampleRate,48000);assert.equal(result.channels.length,2);
 for(let c=0;c<2;c++)for(let i=0;i<5;i++)assert.ok(Math.abs(result.channels[c]![i]!-source[c]![i]!)<=1/32767);
 assert.equal(pcmMetrics(result.channels).frames,5);
});

test('reject truncated RIFF, unsupported PCM and non-finite samples',()=>{
 const good=pcm16Wave([new Float32Array(100)]);
 assert.throws(()=>readPcm16Wave(good.subarray(0,good.length-1)),/invalid-pcm/);
 const floating=good.slice();new DataView(floating.buffer).setUint16(20,3,true);
 assert.throws(()=>readPcm16Wave(floating),/invalid-pcm/);
 assert.throws(()=>pcm16Wave([new Float32Array([NaN])]),/non-finite/);
 assert.throws(()=>pcm16Wave([new Float32Array(2),new Float32Array(1)]),/invalid-pcm/);
});
