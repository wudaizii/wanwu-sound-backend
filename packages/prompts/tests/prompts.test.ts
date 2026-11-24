import test from 'node:test';
import assert from 'node:assert/strict';
import {STYLE} from '../src/style.ts';
import {PROMPT_VERSIONS,TASKS,TASK_IDS,buildBackgroundAudio,buildBackgroundNotes,buildMoodWords,buildSoundHint,buildTextbookTalk,buildTextbookWords,buildWorkTalk,promptProblems,sectionCounts,soundingPercent} from '../src/tasks/index.ts';
import type {BuiltPrompt,PromptFile} from '../src/tasks/index.ts';
import {WORK_TALK_PROMPT} from '../src/tasks/talk.ts';
import {BACKGROUND_BRIEFS,PERSONAL_NAMES,calmLullaby,textbookBrief,workBrief} from './fixtures/briefs.ts';

/** Every request built from the fixed samples. */
const built:[string,BuiltPrompt][]=[
 ...BACKGROUND_BRIEFS.flatMap((brief,i)=>[[`background-audio#${i}`,buildBackgroundAudio(brief)],[`background-notes#${i}`,buildBackgroundNotes(brief)]] as [string,BuiltPrompt][]),
 ['work-talk',buildWorkTalk(workBrief)],['textbook-talk',buildTextbookTalk(textbookBrief)],
 ['sound-hint',buildSoundHint({dimension:'pattern',value:'repeat',kind:'texture'})],['mood-words',buildMoodWords({text:'有点想家'})],
 ['textbook-words',buildTextbookWords(calmLullaby.textbook!)],
];

test('every prompt file loads; each task has a version and a fallback',()=>{
 for(const id of TASK_IDS){
  assert.ok(TASKS[id].file.version.endsWith('-v1'),id);
  assert.ok(TASKS[id].fallback,id);
 }
 assert.equal(new Set(Object.values(PROMPT_VERSIONS)).size,TASK_IDS.length+1,'versions are distinct');
 assert.equal(TASKS['sound-hint'].file.status,'closed','向导联想 answers from the corpus for now');
});

test('a bad prompt edit is reported in plain words',()=>{
 const spec={task:'work-talk',model:'language' as const,placeholders:['seconds'],tables:{'words.mood':['none','happy']}};
 const file={...structuredClone(WORK_TALK_PROMPT),lines:['长 {second} 秒'],words:{mood:{none:'没选',hapy:'开心'}}} as PromptFile;
 const problems=promptProblems(file,spec).join('\n');
 assert.match(problems,/work-talk\.lines\[0\] 用了不认识的占位符 \{second\}/);
 assert.match(problems,/words\.mood\.happy 缺少/);assert.match(problems,/words\.mood\.hapy 不认识/);
 assert.match(promptProblems({...file,task:'x',temperature:3},spec).join('\n'),/task 应该是 work-talk[\s\S]*temperature 应该在 0–1.5/);
});

test('built prompts: every placeholder filled, nothing personal, within budget',()=>{
 for(const [name,prompt] of built){
  const text=`${prompt.system??''}\n${prompt.prompt}`;
  assert.doesNotMatch(text,/\{[A-Za-z]+\}/,`${name} left a placeholder`);
  for(const person of PERSONAL_NAMES)assert.ok(!text.includes(person),`${name} carries a child's sound name`);
  assert.ok(!text.includes('work:fixture'),`${name} carries the work id`);
  assert.ok(prompt.prompt.length<2200,`${name} is ${prompt.prompt.length} characters`);
 }
});

test('language tasks share the system prompt with the style words; the music model gets a plain description',()=>{
 const talk=buildWorkTalk(workBrief),audio=buildBackgroundAudio(calmLullaby);
 for(const word of [...STYLE.childAvoid,...STYLE.neverSay])assert.ok(talk.system!.includes(word),word);
 assert.match(talk.system!,/只返回一个合法的 JSON 对象/);
 assert.equal(audio.system,null);assert.doesNotMatch(audio.prompt,/\n/);
 assert.match(audio.prompt,/长度 30 秒/);assert.match(audio.prompt,/不要人声/);assert.match(audio.prompt,/约占全曲 27%/);
});

test('work talk: each fact with its local sentence, sounds only as tokens',()=>{
 const {prompt}=buildWorkTalk(workBrief);
 assert.match(prompt,/1\. kind=opening｜first=声音1，next=声音2｜本地说法：「声音1」先出现，「声音2」随后跟上。/);
 assert.match(prompt,/kind=long-short｜long=声音2，longSeconds=6\.2/);
 assert.match(prompt,/课本歌曲：「摇篮曲」/);assert.match(prompt,/不超过 45 个字/);
});

test('AI notes: four sections counted from the sounding spans; asking again asks for a different motif',()=>{
 assert.deepEqual(sectionCounts(calmLullaby).map(section=>section.count),[2,0,1,0]);
 assert.equal(soundingPercent(calmLullaby),27);
 assert.doesNotMatch(buildBackgroundNotes(calmLullaby).prompt,/第 \d 次/);
 assert.match(buildBackgroundNotes(calmLullaby,2).prompt,/这是第 3 次/);
 assert.match(buildBackgroundNotes(calmLullaby).prompt,/借「课本歌曲」的节奏：三拍子，节奏型 \[2, 1\]/);
 assert.ok(!buildBackgroundNotes(calmLullaby).prompt.includes('摇篮曲'),'the brief carries features, not the song');
});

test('AI backgrounds take the colour the local rules take: the child\'s mood, else the song\'s, else none',()=>{
 const songOnly={...calmLullaby,mood:null};
 assert.match(buildBackgroundAudio(songOnly).prompt,/情绪：平静、舒展/);
 assert.match(buildBackgroundNotes(songOnly).prompt,/【心情】平静/);
 assert.match(buildBackgroundAudio({...songOnly,textbook:null,variation:null}).prompt,/情绪：自然、中性/);
});
