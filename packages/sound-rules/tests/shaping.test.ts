import test from 'node:test';
import assert from 'node:assert/strict';
import type {ChosenShape,PitchChoice,SoundAnalysis} from '@wanwu-v2/contracts/sound';
import {SOUND_CHOICES} from '@wanwu-v2/contracts/sound';
import {analyseSamples} from '../src/analysis.ts';
import {SHAPING_RULES} from '../src/rules.ts';
import {clipHeardSeconds,defaultClipFor,originalGain,pitchMove,planCard,planClip,shapeKey,stretchFor,unchangedBy} from '../src/shaping.ts';
import {RATE,join,pulsing,silence,tone} from './helpers.ts';

const croak=tone(.25,600);
const series=analyseSamples([join(silence(.3),croak,silence(.6),tone(.25,600,.3),silence(.6),croak,silence(.4))],RATE);
const one=analyseSamples([join(silence(.2),tone(.9,800),silence(.3))],RATE);
const texture=analyseSamples([pulsing(4,2500,4)],RATE);
const withBand=(band:PitchChoice):SoundAnalysis=>({...series,band});
const ends=(plan:{events:{at:number;length:number}[]})=>plan.events.map(event=>[event.at,event.at+event.length]);

test('the test sounds are sorted into the three kinds',()=>{
 assert.deepEqual([one.kind,series.kind,texture.kind],['one','series','texture']);
});

test('unchosen dimensions keep the original: own pitch, own lengths, sounds where they are, common loudness',()=>{
 const plan=planCard({},series,'s');
 assert.equal(plan.semitones,0);assert.equal(plan.stretch,1);assert.equal(plan.grainSeconds,null);
 assert.equal(plan.events.length,3,'one event per sound');
 assert.equal(plan.events[0]!.from,series.units[0]!.startMs/1000,'starts where the sound starts, not at second 0');
 assert.ok(Math.abs(plan.gain-originalGain(series))<1e-12,'same level as 听原声');
 assert.notEqual(shapeKey({}),shapeKey({pitch:'mid'}));
});

test('高低 moves toward the band the child heard; already there means no change',()=>{
 assert.equal(pitchMove('high',withBand('high')).semitones,0);
 assert.equal(pitchMove('high',withBand('mid')).semitones,SHAPING_RULES.pitch.semitonesPerStep);
 assert.ok(pitchMove('high',withBand('low')).shelfDb>0&&pitchMove('low',withBand('high')).shelfDb<0,'brighter up, darker down');
 const high=planCard({pitch:'high'},withBand('low'),'s');
 assert.ok(high.grainSeconds,'pitch changes keep the length');
 assert.equal(high.totalSeconds,planCard({},withBand('low'),'s').totalSeconds);
});

test('长短 is how long each sound lasts: every sound is stretched, none is cut',()=>{
 assert.equal(series.lengthBand,'short');
 assert.equal(stretchFor('short',series),1,'already short: unchanged');
 const long=planCard({duration:'long'},series,'s'),plain=planCard({},series,'s');
 assert.equal(long.events.length,plain.events.length,'the same sounds, none dropped or cut');
 const factor=Math.min(SHAPING_RULES.duration.maxStretch,SHAPING_RULES.duration.stretchPerStep**2);
 long.events.forEach((event,i)=>assert.ok(Math.abs(event.length-plain.events[i]!.length*factor)<1e-9));
 long.events.forEach((event,i)=>assert.ok(event.at>=plain.events[i]!.at-1e-9,'each sound keeps its moment unless the one before now runs into it'));
 assert.equal(long.events[0]!.at,plain.events[0]!.at);
 assert.ok(stretchFor('short',one)<1,'a medium sound gets shorter');
 const slower=stretchFor('long',texture);
 assert.ok(slower>1&&slower<=SHAPING_RULES.duration.textureMaxStretch,'sound that runs together slows down, within its own limit');
});

test('变化 moves within each sound, and across sound that runs together',()=>{
 const rising=planCard({contour:'rising'},series,'s');
 assert.ok(rising.events.every(event=>event.bendCents===SHAPING_RULES.contour.unit.bendCents&&event.sweep));
 const flowing=planCard({contour:'falling'},texture,'s');
 assert.equal(flowing.events.length,1);
 assert.deepEqual(flowing.events[0]!.rampDb,[0,-SHAPING_RULES.contour.texture.rampDb],'falling = farther away');
});

test('出现方式 lays out whole sounds: repeat is the same sound on a beat, bursts are groups; nothing cut mid-sound',()=>{
 const {minCount}=SHAPING_RULES.pattern.repeat,{minGroups,hitsPerGroup}=SHAPING_RULES.pattern.bursts;
 const repeat=planCard({pattern:'repeat'},series,'s');
 assert.ok(repeat.events.length>=minCount);
 assert.ok(repeat.events.every(event=>event.from===series.units[0]!.startMs/1000),'the loudest sound, every time');
 const gaps=ends(repeat).slice(1).map(([start],i)=>start!-ends(repeat)[i]![1]!);
 assert.ok(gaps.every(gap=>Math.abs(gap-gaps[0]!)<1e-9),'on a steady beat');
 const bursts=planCard({pattern:'bursts'},series,'seed');
 assert.ok(bursts.events.length>=minGroups*hitsPerGroup&&bursts.events.length%hitsPerGroup===0,'whole groups only');
 const starts=new Set(series.units.map(unit=>unit.startMs/1000));
 assert.ok(bursts.events.every(event=>starts.has(event.from)),'every hit is one of the real sounds');
 assert.deepEqual(planCard({pattern:'bursts'},series,'seed'),bursts,'repeatable');
 const waves=planCard({pattern:'repeat'},texture,'s');
 assert.ok(waves.events.every(event=>event.swell),'sound that runs together comes and goes in waves');
});

test('重复 and 一阵一阵 fill the excerpt: its length (with 长短) decides how long, never fewer than the minimum',()=>{
 const {waveSeconds,waveGapSeconds,minCount}=SHAPING_RULES.pattern.repeat;
 // A long running sound cut to 30 s comes and goes all through those 30 s, from different places in it.
 const long=analyseSamples([pulsing(40,2500,4)],RATE),clip={startMs:0,endMs:30_000};
 const waves=planClip({pattern:'repeat'},clip,long,'s');
 assert.equal(waves.events.length,Math.floor((30+waveGapSeconds)/(waveSeconds+waveGapSeconds)));
 assert.ok(waves.totalSeconds<=30+1e-9&&waves.totalSeconds>30-(waveSeconds+waveGapSeconds));
 assert.ok(new Set(waves.events.map(event=>event.from)).size>1,'not the same two seconds again and again');
 const gusts=planClip({pattern:'bursts'},clip,long,'s');
 assert.ok(gusts.totalSeconds<=30+1e-9&&gusts.totalSeconds>25);
 // Separate sounds: the loudest one on a beat, and groups of the sound's own sounds, as long as the excerpt.
 const croaks=analyseSamples([join(...Array.from({length:12},(_,i)=>join(silence(.5),tone(.25,600,i%3?.3:.5))),silence(.4))],RATE);
 assert.equal(croaks.kind,'series');
 const seriesClip={startMs:0,endMs:Math.round(croaks.durationMs)},seconds=croaks.durationMs/1000;
 for(const pattern of ['repeat','bursts'] as const){
  const plan=planClip({pattern},seriesClip,croaks,'s');
  assert.ok(plan.totalSeconds<=seconds+1e-9,pattern);
  assert.ok(plan.totalSeconds>seconds-2.5,pattern);
 }
 // 长长的 makes the filled length longer too.
 const stretched=planClip({pattern:'repeat',duration:'long'},seriesClip,croaks,'s');
 assert.ok(stretched.totalSeconds>planClip({pattern:'repeat'},seriesClip,croaks,'s').totalSeconds);
 // A very short excerpt still repeats at least the minimum number of times.
 assert.equal(planClip({pattern:'repeat'},{startMs:300,endMs:600},series,'s').events.length,minCount);
});

test('the renderer\'s length always equals what the field and score compute',()=>{
 const shapes:ChosenShape[]=[{}];
 for(const duration of SOUND_CHOICES.duration)for(const pattern of SOUND_CHOICES.pattern)for(const contour of SOUND_CHOICES.contour)shapes.push({duration,pattern,contour});
 for(const analysis of [one,series,texture,null])for(const shape of shapes)for(const clip of [{startMs:0,endMs:300},{startMs:500,endMs:2500},{startMs:0,endMs:3400}]){
  const plan=planClip(shape,clip,analysis,'s');
  assert.ok(Math.abs(plan.totalSeconds-clipHeardSeconds(shape,analysis,clip))<1e-9,JSON.stringify({shape,clip,kind:analysis?.kind}));
 }
 for(const shape of shapes)for(const analysis of [one,series,texture])assert.ok(planCard(shape,analysis,'s').totalSeconds<=SHAPING_RULES.limits.cardMaxSeconds+1e-9);
});

test('one sound never lasts longer than the longest field; past the limit it ends between sounds',()=>{
 const {clipMaxSeconds}=SHAPING_RULES.limits;
 assert.equal(clipMaxSeconds,45);
 const long=analyseSamples([pulsing(46,2500,4)],RATE),clip={startMs:0,endMs:45_000};
 for(const pattern of SOUND_CHOICES.pattern)assert.ok(planClip({duration:'long',pattern},clip,long,'s').totalSeconds<=clipMaxSeconds+1e-9,pattern);
 const one=planClip({duration:'long'},clip,long,'s');
 assert.equal(one.events.length,1);assert.ok(one.events[0]!.releaseSeconds>1,'a single long sound is cut with a long fade');
 const croaks=analyseSamples([join(...Array.from({length:40},()=>join(silence(.8),tone(.3,600))),silence(.4))],RATE);
 const stretched=planClip({duration:'long'},{startMs:0,endMs:Math.round(croaks.durationMs)},croaks,'s');
 assert.ok(stretched.totalSeconds<=clipMaxSeconds+1e-9);
 assert.ok(stretched.events.every(event=>event.at+event.length<=clipMaxSeconds+1e-9&&event.releaseSeconds<1),'whole croaks only, none cut');
});

test('no analysis yet: the excerpt plays as it is',()=>{
 assert.equal(clipHeardSeconds({duration:'long',pitch:'high'},null,{startMs:0,endMs:2000}),2);
});

test('轻响 goes soft < medium < loud after the common loudness; peaks stay under the ceiling',()=>{
 const level=(intensity:'soft'|'medium'|'loud')=>planCard({intensity},series,'s').gain;
 assert.ok(level('soft')<level('medium')&&level('medium')<level('loud'));
 for(const pitch of SOUND_CHOICES.pitch)for(const band of SOUND_CHOICES.pitch){
  const plan=planCard({intensity:'loud',pitch},withBand(band),'s');
  assert.ok(series.peakDb+20*Math.log10(plan.gain)+Math.max(0,plan.highShelfDb)<=SHAPING_RULES.level.peakCeilingDb+1e-9);
 }
});

test('a choice that keeps the sound as it is is reported, so the page can say so',()=>{
 assert.equal(unchangedBy('pitch',series.band,series),'already');
 assert.equal(unchangedBy('duration','short',series),'already');
 assert.equal(unchangedBy('duration','long',series),null);
 assert.equal(unchangedBy('contour','flat',series),'keeps');
 assert.equal(unchangedBy('pattern','once',series),'keeps');
 assert.equal(unchangedBy('pattern','bursts',series),null);
});

test('placing in the field starts with the whole sound without the silence around it',()=>{
 assert.deepEqual(defaultClipFor(series,200),{startMs:series.main!.startMs,endMs:series.main!.endMs});
});
