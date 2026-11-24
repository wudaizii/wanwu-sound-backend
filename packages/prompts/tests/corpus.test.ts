import test from 'node:test';
import assert from 'node:assert/strict';
import {SOUND_CHOICES,SOUND_DIMENSIONS} from '@wanwu-v2/contracts/sound';
import {DISCOVERIES,SOUND_HINTS,TEXTBOOK_TALK,discoveriesProblems,discoveryText,hintLines,localTryThis,presetHint,songFeature,soundHintsProblems,textbookTalk,textbookTalkProblems} from '../src/corpus.ts';
import {charCount,wordProblems} from '../src/style.ts';
import {pageFacts} from './fixtures/briefs.ts';

test('the corpus files load and pass every coverage, placeholder, length and word check',()=>{
 assert.deepEqual(soundHintsProblems(SOUND_HINTS),[]);
 assert.deepEqual(discoveriesProblems(DISCOVERIES),[]);
 assert.deepEqual(textbookTalkProblems(TEXTBOOK_TALK),[]);
});

test('a bad corpus edit is reported in plain words, naming the line',()=>{
 const hints=structuredClone(SOUND_HINTS);
 hints.hints.pitch.low!.lines[0]='低低的声音真棒，这个声音的音域很低，像青蛙在池塘边一直一直一直一直一直一直一直叫。';
 const problems=soundHintsProblems(hints).join('\n');
 assert.match(problems,/sound-hints\.pitch\.low\.lines\[0\]：有 \d+ 个字，超过上限 36/);
 assert.match(problems,/不对任何人说的话「真棒」/);assert.match(problems,/术语「音域」/);
 delete (hints.hints.pattern as Record<string,unknown>).once;
 assert.match(soundHintsProblems(hints).join('\n'),/sound-hints\.pattern\.once 至少要有一句/);
 const discoveries=structuredClone(DISCOVERIES);discoveries.kinds.repeat.line='「{nmae}」出现了 {times} 次。';
 assert.match(discoveriesProblems(discoveries).join('\n'),/discoveries\.repeat\.line 用了不认识的占位符 \{nmae\}/);
 const talk=structuredClone(TEXTBOOK_TALK);delete (talk.shapes as Record<string,unknown>).offset;
 assert.match(textbookTalkProblems(talk).join('\n'),/textbook-talk\.shapes\.offset 应该是一句话/);
});

test('teacher sentences may use music terms; child sentences may not; a placeholder counts as a typical name',()=>{
 assert.deepEqual(wordProblems('两个声音同时响，音乐里叫声部。','explain'),[]);
 assert.match(wordProblems('两个声部一起响。','discovery').join(),/术语「声部」/);
 assert.equal(charCount('「{name}」来了'),8);
 assert.deepEqual(wordProblems('不选乐器，背景用原始的柔和声音。','guide'),[],'柔和声音 is not 和声');
});

test('hints: every choice has lines; the line for this kind of sound comes first, a repeated tap hears the next one',()=>{
 for(const dimension of SOUND_DIMENSIONS)for(const value of SOUND_CHOICES[dimension])assert.ok(hintLines(dimension,value,null).length>=2,`${dimension}.${value}`);
 assert.equal(presetHint('pitch','high','series',0),SOUND_HINTS.hints.pitch.high!.byKind!.series);
 assert.equal(presetHint('pitch','high',null,0),SOUND_HINTS.hints.pitch.high!.lines[0]);
 assert.notEqual(presetHint('pitch','high',null,1),presetHint('pitch','high',null,0));
 assert.equal(presetHint('pitch','high',null,SOUND_HINTS.hints.pitch.high!.lines.length),presetHint('pitch','high',null,0),'it cycles');
});

test('discoveries: every fact fills its sentences, the same wording the page showed before the move',()=>{
 for(const fact of pageFacts){
  const text=discoveryText(fact);
  for(const value of Object.values(text))assert.doesNotMatch(value,/[{}]/);
 }
 assert.equal(discoveryText({kind:'repeat',name:'蛙鸣',times:3}).line,'「蛙鸣」出现了 3 次，像在重复一句歌词。');
 assert.equal(discoveryText({kind:'opening',first:'蛙鸣',next:null}).line,'「蛙鸣」先出现。');
 assert.equal(discoveryText({kind:'ending',name:'蛙鸣',same:true}).idea,'首尾呼应');
 assert.equal(discoveryText({kind:'busier',half:'second'}).line,'后半段声音更多，越往后越热闹。');
 assert.equal(localTryThis(pageFacts),'拿走一个「小林家的狗」，听听少一次有什么不一样。','the first fact that suggests a change');
 assert.equal(localTryThis([{kind:'opening',first:'蛙鸣',next:null}]),'换一个声音放在最前面，听听开头有什么不同。');
});

test('textbook talk: four sentences from the song card and what the rules found',()=>{
 const lullaby={title:'摇篮曲',meter:3 as const,rhythmCell:[2,1],childLine:'像摇篮轻轻晃'};
 assert.equal(songFeature(lullaby),'「摇篮曲」是三拍子，节奏是「嗒— 嗒」，像摇篮轻轻晃。');
 const talk=textbookTalk(lullaby,'lower','together','蛙鸣');
 assert.equal(talk.meeting,'你的「蛙鸣」正好落在拍子上，和背景一起用力。');
 assert.equal(textbookTalk(lullaby,'lower','together',null).meeting,'你的声音落在拍子上，和背景一起用力。');
 assert.match(talk.shape,/唱低了一点/);
});
