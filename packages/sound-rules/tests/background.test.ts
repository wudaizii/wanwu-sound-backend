import test from 'node:test';
import assert from 'node:assert/strict';
import {ORIGINAL_PLAYER,assignParts,backgroundMeeting,backgroundPlan} from '../src/background.ts';
import {suggestVariations} from '../src/textbookVariation.ts';
import type {BackgroundInput} from '../src/background.ts';
import {duckPoints,mergeSpans} from '../src/mix.ts';
import {BACKGROUND_RULES,MIX_RULES,backgroundProblems,mixProblems} from '../src/rules.ts';

const input=(extra:Partial<BackgroundInput>={}):BackgroundInput=>({seconds:30,sounding:[{start:2,end:6},{start:10,end:12},{start:20,end:27}],mood:null,textbook:null,seed:'work:1',...extra});
const lullaby={id:'tb:mock:lullaby',tempoBpm:66,meter:3 as const,rhythmCell:[2,1],mode:'major' as const,mood:'calm' as const};
const lullabyV:typeof lullaby&{variation?:'original'|'stretch'|'squeeze'|'offset'|'higher'|'lower'}=lullaby;

test('the background and mix rule files load and pass their checks',()=>{
 assert.deepEqual(backgroundProblems(BACKGROUND_RULES),[]);
 assert.deepEqual(mixProblems(MIX_RULES),[]);
 const broken=structuredClone(BACKGROUND_RULES);broken.modes.minor.scale=[0,2,3,5,7,8];
 assert.match(backgroundProblems(broken).join('\n'),/background\.modes\.minor\.scale 应该是 7–7 个数字的列表/);
 const word=structuredClone(BACKGROUND_RULES);(word.moods.sad as {mode:string}).mode='sadder';
 assert.match(backgroundProblems(word).join('\n'),/background\.moods\.sad\.mode = "sadder"，只能是 major \/ minor \/ pentatonic \/ dorian/);
});

test('the same work always gets the same background; another work gets another melody',()=>{
 assert.deepEqual(backgroundPlan(input()),backgroundPlan(input()));
 const melody=(seed:string)=>backgroundPlan(input({seed})).notes.filter(note=>note.part==='melody').map(note=>note.midi);
 assert.notDeepEqual(melody('work:1'),melody('work:2'));
});

test('the mood colours the background: sad is minor and slower, lively is quicker; the textbook lends its rhythm',()=>{
 const plain=backgroundPlan(input()),sad=backgroundPlan(input({mood:'sad'})),lively=backgroundPlan(input({mood:'lively'}));
 assert.equal(plain.mode,'major');assert.equal(sad.mode,'minor');assert.equal(sad.colour,'sad');
 assert.ok(sad.tempo<plain.tempo&&lively.tempo>plain.tempo);
 const borrowed=backgroundPlan(input({textbook:lullaby}));
 assert.deepEqual([borrowed.tempo,borrowed.metre,borrowed.colour,borrowed.textbook],[66,3,'calm','tb:mock:lullaby'],'no mood: the song gives rhythm and colour');
 const both=backgroundPlan(input({textbook:lullaby,mood:'sad'}));
 assert.deepEqual([both.tempo,both.metre,both.mode,both.colour],[66,3,'minor','sad'],'the child\'s mood decides the colour, the song the rhythm');
 // The melody follows the song's rhythm cell: long, short, long, short…
 const melody=borrowed.notes.filter(note=>note.part==='melody'),beat=60/66;
 for(const note of melody.slice(0,-1))assert.ok([2,1].some(beats=>Math.abs(note.length-beats*beat*BACKGROUND_RULES.melody.noteLengthPortion)<1e-9));
});

test('the melody only plays in the gaps between the child\'s sounds',()=>{
 const plan=backgroundPlan(input()),{marginSeconds}=BACKGROUND_RULES.melody;
 const melody=plan.notes.filter(note=>note.part==='melody');
 assert.ok(melody.length>0);
 for(const note of melody)for(const sound of input().sounding)
  assert.ok(note.at+note.length<=sound.start-marginSeconds+1e-9||note.at>=sound.end+marginSeconds-1e-9,`${note.at} overlaps ${sound.start}–${sound.end}`);
 const filled=backgroundPlan(input({sounding:[{start:0,end:30}]}));
 assert.equal(filled.notes.filter(note=>note.part==='melody').length,0,'no gap, no melody');
 assert.ok(filled.notes.some(note=>note.part==='chord'),'chords and bass stay under the child\'s sounds');
});

test('the ending stays inside the piece: dominant, then the tonic on a bar line with room to ring',()=>{
 for(const seconds of [20,22.4,30,45,47.3])for(const mood of [null,'sad','lively','curious'] as const){
  const plan=backgroundPlan(input({seconds,mood})),bar=60/plan.tempo*plan.metre;
  assert.ok(Math.abs(plan.cadenceAt/bar-Math.round(plan.cadenceAt/bar))<1e-9,'on a bar line');
  assert.ok(seconds-plan.cadenceAt>=BACKGROUND_RULES.ending.minRingSeconds-1e-9&&seconds-plan.cadenceAt<bar+BACKGROUND_RULES.ending.minRingSeconds+1e-9);
  assert.ok(plan.notes.every(note=>note.at+note.length<=seconds+1e-9),'never longer than the piece');
  const scale=BACKGROUND_RULES.modes[plan.mode].scale,feel=BACKGROUND_RULES.moods[plan.colour];
  const last=plan.notes.filter(note=>note.part==='chord'&&Math.abs(note.at-plan.cadenceAt)<1e-9).map(note=>note.midi);
  assert.deepEqual(last,[feel.tonic,feel.tonic+scale[2]!,feel.tonic+scale[4]!],'the last chord is the tonic');
  assert.ok(plan.notes.filter(note=>note.part==='chord'&&Math.abs(note.at-plan.cadenceAt)<1e-9).every(note=>Math.abs(note.at+note.length-seconds)<1e-9),'and holds to the end');
  const before=plan.notes.filter(note=>note.part==='chord'&&Math.abs(note.at-(plan.cadenceAt-bar))<1e-9).map(note=>note.midi);
  if(plan.cadenceAt>=2*bar)assert.equal(((before[0]!-(feel.tonic+scale[4]!))%12+12)%12,0,'the bar before is the dominant');
 }
});

test('背景让一让: down by the rule\'s depth while the child\'s sounds play, back up after',()=>{
 const points=duckPoints([{start:2,end:6},{start:6.2,end:7}],30),low=10**(-MIX_RULES.duck.depthDb/20);
 assert.deepEqual(mergeSpans([{start:2,end:6},{start:6.2,end:7}],30,.48),[{start:2,end:7}],'close sounds count as one');
 assert.equal(points.find(point=>point.at===2)!.gain,low);
 assert.equal(points.at(-1)!.gain,1);assert.ok(Math.abs(points.at(-1)!.at-(7+MIX_RULES.duck.releaseSeconds))<1e-9);
 assert.ok(points.every((point,i)=>i===0||point.at>=points[i-1]!.at),'in time order');
});

test('who plays which part: lead first, then whoever can; pitched parts nobody can play keep the original voice',()=>{
 const organ={id:'organ',lead:['chord','bass'] as const,can:['melody'] as const},xylophone={id:'xylophone',lead:['melody'] as const,can:['chord','bass'] as const},drum={id:'drum',lead:['rhythm'] as const,can:[] as const};
 assert.deepEqual(assignParts([]),{chord:[ORIGINAL_PLAYER],bass:[ORIGINAL_PLAYER],melody:[ORIGINAL_PLAYER],rhythm:[]},'nothing chosen: as generated');
 assert.deepEqual(assignParts([drum]),{chord:[ORIGINAL_PLAYER],bass:[ORIGINAL_PLAYER],melody:[ORIGINAL_PLAYER],rhythm:['drum']},'a drum alone joins the original');
 assert.deepEqual(assignParts([organ]),{chord:['organ'],bass:['organ'],melody:['organ'],rhythm:[]});
 assert.deepEqual(assignParts([organ,xylophone,drum]),{chord:['organ'],bass:['organ'],melody:['xylophone'],rhythm:['drum']},'each does its own job');
});

test('换几种样子: the song\'s rhythm cell is stretched or squeezed, starts half a beat late, or moves up or down',()=>{
 const melody=(variation?:typeof lullabyV.variation)=>backgroundPlan(input({sounding:[],textbook:{...lullabyV,variation}})).notes.filter(note=>note.part==='melody');
 const beat=60/66,{stretchFactor,squeezeFactor,offsetBeats,registerSemitones}=BACKGROUND_RULES.variations,portion=BACKGROUND_RULES.melody.noteLengthPortion;
 assert.ok(Math.abs(melody('stretch')[0]!.length-2*stretchFactor*beat*portion)<1e-9,'stretched: twice as long');
 assert.ok(Math.abs(melody('squeeze')[0]!.length-2*squeezeFactor*beat*portion)<1e-9,'squeezed: half as long');
 assert.ok(Math.abs(melody('offset')[0]!.at-offsetBeats*beat)<1e-9,'half a beat late');
 const pitch=(notes:ReturnType<typeof melody>)=>notes.slice(0,-1).reduce((sum,note)=>sum+note.midi,0)/(notes.length-1);
 assert.ok(pitch(melody('higher'))-pitch(melody())>registerSemitones/2&&pitch(melody())-pitch(melody('lower'))>registerSemitones/2,'moved up / down');
 assert.equal(backgroundPlan(input({textbook:lullabyV})).variation,'original');
 assert.equal(backgroundPlan(input()).variation,null);
 assert.deepEqual(suggestVariations({density:'busy',register:'high'},{brightness:'mid'}),['stretch','lower']);
 assert.deepEqual(suggestVariations({density:'sparse',register:'low'},{brightness:'mid'}),['squeeze','higher']);
 assert.deepEqual(suggestVariations({density:'medium',register:'medium'},{brightness:'bright'}),['offset','lower']);
});

test('碰一碰: together on the beat, call and answer between sounds, filling the gaps, or carrying them',()=>{
 const beat=60/76;
 const onBeats=[0,4,8,12].map(b=>({start:b*beat,end:b*beat+.5}));
 assert.equal(backgroundMeeting(backgroundPlan(input({sounding:onBeats})),onBeats).kind,'together');
 const offBeat=[{start:.4,end:3},{start:6.3,end:9},{start:12.3,end:15},{start:18.3,end:21}];
 assert.equal(backgroundMeeting(backgroundPlan(input({sounding:offBeat})),offBeat).kind,'answer');
 const once=[{start:.4,end:3}];
 assert.equal(backgroundMeeting(backgroundPlan(input({sounding:once})),once).kind,'fill');
 const wall=[{start:.4,end:30}];
 assert.equal(backgroundMeeting(backgroundPlan(input({sounding:wall})),wall).kind,'under');
});
