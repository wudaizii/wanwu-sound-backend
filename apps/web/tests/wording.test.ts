// How long the words on screen may be. Guide lines (frog, squirrel, sound marker) stay within two lines of the bubble
// on every screen: at most 36 characters, a child's sound name counted as four. Hints on pages and in dialogs say one
// thing in at most 30 characters. Lines the program puts together are checked with the longest real pieces.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MOODS} from '@wanwu-v2/contracts/arrangement';
import {TEXTBOOK_VARIATIONS} from '@wanwu-v2/contracts/textbook';
import type {TextbookVariation} from '@wanwu-v2/contracts/textbook';
import {charCount,wordProblems} from '@wanwu-v2/prompts/style';
import {BACKGROUND_RULES} from '@wanwu-v2/sound-rules/rules';
import {shapeOf} from '@wanwu-v2/sound-rules/textbook-variation';
import {rhythmWords} from '@wanwu-v2/prompts/corpus';
import type {BackgroundMode} from '@wanwu-v2/sound-rules/rules';
import {backgroundCopy} from '../src/shared/background/copy.ts';
import {exampleTracks} from '../src/mocks/exampleTracks.ts';
import {guideLines as squirrel} from '../src/pages/compose/config/guideLines.ts';
import {guideLines as frog} from '../src/pages/sound-world/config/guideLines.ts';

/** A typical sound name: four characters, as the style rules count a name. */
const NAME='小雨点点';
const PAGE_HINT_MAX=30;

/** Every line of a guide object: plain strings, and functions called with a name and numbers (lines that need other
 *  arguments are put together below with real pieces). */
function lines(guide:Record<string,unknown>):string[]{
 return Object.entries(guide).flatMap(([key,value])=>typeof value==='string'?[value]
  :typeof value==='function'?(SPECIAL.has(key)?[]:[String(value(NAME,12,30))])
  :value&&typeof value==='object'?lines(value as Record<string,unknown>):[]);
}
const SPECIAL=new Set(['inspirationSong','volume','shapeTap']);
const longest=<T,>(items:readonly T[],text:(item:T)=>string)=>items.map(text).sort((a,b)=>charCount(b)-charCount(a))[0]!;

test('guide lines fit two lines of the bubble: at most 36 characters, child words only',()=>{
 const titles=exampleTracks.map(track=>track.title);
 const shapes=TEXTBOOK_VARIATIONS.filter(shape=>shape!=='original');
 const pairs=shapes.flatMap(a=>shapes.filter(b=>b!==a).map(b=>['original',a,b] as TextbookVariation[]));
 const moods=['none',...MOODS] as const,modes=Object.keys(BACKGROUND_RULES.modes) as BackgroundMode[];
 const describe=longest(moods.flatMap(colour=>modes.flatMap(mode=>[2,3,4].flatMap(metre=>[null,...titles].map(title=>({colour,mode,metre:metre as 2|3|4,title}))))),
  ({title,...plan})=>backgroundCopy.describe(plan,title));
 const composed=[
  longest(titles.flatMap(title=>pairs.map(pair=>({title,pair}))),({title,pair})=>squirrel.inspirationSong(title,pair)),
  longest(exampleTracks,track=>frog.inspirationSong(track.title,track.childLine)),
  squirrel.backgroundOn(describe),frog.backgroundOn(describe),
  ...(['soft','medium','loud'] as const).map(level=>squirrel.volume(level)),
  ...exampleTracks.flatMap(track=>TEXTBOOK_VARIATIONS.map(shape=>squirrel.shapeTap(shape,rhythmWords(track.rhythmCell),rhythmWords(shapeOf(track.rhythmCell,shape).cell)))),
  squirrel.instruments(backgroundCopy.parts({chord:['organ'],bass:['organ'],melody:['marimba'],rhythm:['drum']},{organ:'风琴',marimba:'木琴',drum:'小鼓'})),
 ];
 const said=[...lines(squirrel),...lines(frog),...composed];
 assert.ok(said.length>50);
 for(const line of said)assert.deepEqual(wordProblems(line,'guide'),[],line);
});

/** `key:'text'` pairs written in a source file (template slots read as a typical name). */
function texts(path:string){
 const source=readFileSync(new URL(`../src/${path}`,import.meta.url),'utf8').replace(/^\s*(\/\/|\/?\*).*$/gm,'');
 return [...source.matchAll(/(\w+):\s*(?:\([^)]*\)=>)?(?:'([^'\n]*)'|`([^`\n]*)`)/g)]
  .map(match=>({key:match[1]!,text:(match[2]??match[3]!).replace(/\$\{[^}]*\}/g,NAME)}))
  .filter(({text})=>/[一-鿿]/.test(text));
}

test('hints on pages and in dialogs say one thing in at most 30 characters; the sound marker\'s lines stay within 36',()=>{
 // Read by screen readers only (never shown as a hint), so they may be longer.
 const spoken=new Set(['itemLabel','eventLabel','keyboardHint','instrumentsLabel','tailLabel','placeInRow','backgroundToggle','classroomLabel']);
 for(const path of ['pages/compose/config/copy.ts','pages/sound-world/config/copy.ts','pages/works/config/copy.ts','shared/inspiration/copy.ts','shared/ui/WorkHeaderActions.tsx'])
  for(const {key,text} of texts(path))if(!spoken.has(key))assert.ok(charCount(text)<=PAGE_HINT_MAX,`${path} ${key}: ${text}（${charCount(text)} 字）`);
 // 声音诞生's notices are said by the sound marker in its bubble.
 for(const {key,text} of texts('pages/sound-birth/config/copy.ts'))assert.deepEqual(wordProblems(text,'guide'),[],`${key}: ${text}`);
});
