import test from 'node:test';
import assert from 'node:assert/strict';
import {isSoundAnalysis} from '@wanwu-v2/contracts/sound';
import {analyseSamples} from '../src/analysis.ts';
import {ANALYSIS_RULES} from '../src/rules.ts';
import {RATE,join,pulsing,silence,tone} from './helpers.ts';

const frameMs=ANALYSIS_RULES.frameSeconds*1000*3;

test('one sound: silence around it is trimmed and it is the only unit',()=>{
 const result=analyseSamples([join(silence(1),tone(.9,800),silence(.5))],RATE);
 assert.equal(result.kind,'one');assert.equal(result.units.length,1);
 assert.ok(Math.abs(result.main!.startMs-1000)<=frameMs,'starts at the sound, not at 0');
 assert.equal(result.lengthBand,'medium');
 assert.ok(isSoundAnalysis(result));
});

test('a series: separate sounds with quiet between them, each found in order',()=>{
 const croak=tone(.25,600);
 const result=analyseSamples([join(silence(.3),croak,silence(.6),croak,silence(.6),croak,silence(.4))],RATE);
 assert.equal(result.kind,'series');assert.equal(result.units.length,3);
 assert.equal(result.lengthBand,'short');
 assert.ok(result.units.every((unit,i)=>i===0||unit.startMs>result.units[i-1]!.endMs));
});

test('sound that runs together is a texture, and its chirps are still found at the dips',()=>{
 const result=analyseSamples([pulsing(4,2500,8)],RATE);
 assert.equal(result.kind,'texture');
 assert.ok(result.units.length>=12,'found the swells inside the continuous sound');
 assert.equal(result.lengthBand,'short');
});

test('brightness puts low, middle and high sounds in their bands',()=>{
 assert.equal(analyseSamples([tone(1,300)],RATE).band,'low');
 assert.equal(analyseSamples([tone(1,1800)],RATE).band,'mid');
 assert.equal(analyseSamples([tone(1,5000)],RATE).band,'high');
});

test('an empty recording is reported as silent, never invented',()=>{
 const result=analyseSamples([silence(2)],RATE);
 assert.equal(result.silent,true);assert.equal(result.main,null);assert.deepEqual(result.units,[]);
 assert.equal(result.durationMs,2000);
});

test('loudness ignores the silence around the sound',()=>{
 const alone=analyseSamples([tone(1,800,.5)],RATE).loudnessDb;
 const padded=analyseSamples([join(silence(3),tone(1,800,.5),silence(3))],RATE).loudnessDb;
 assert.ok(Math.abs(alone-padded)<.5);
});
