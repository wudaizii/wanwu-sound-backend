// Every AI task, for the server (and the dev-only prompt lab): build the request from an anonymous brief, read the reply
// with the same acceptance the page uses. Pages never import this module (tests/structure.test.ts): keys, requests and
// prompt wording stay on the server.
import {BACKGROUND_AUDIO_PROMPT,BACKGROUND_NOTES_PROMPT} from './background.ts';
import {SYSTEM_PROMPT} from './files.ts';
import type {PromptFile} from './files.ts';
import {TEXTBOOK_TALK_PROMPT,WORK_TALK_PROMPT} from './talk.ts';
import {MOOD_WORDS_PROMPT,SOUND_HINT_PROMPT,TEXTBOOK_WORDS_PROMPT} from './words.ts';

export * from './background.ts';
export * from './talk.ts';
export * from './words.ts';
export {readReply} from './reply.ts';
export {SYSTEM_PROMPT,promptProblems} from './files.ts';
export type {BuiltPrompt,PromptFile,PromptSpec} from './files.ts';

export type TaskId='background-audio'|'background-notes'|'work-talk'|'textbook-talk'|'sound-hint'|'mood-words'|'textbook-words';
/**
 * Who answers when the model does not: every task has a fallback that needs no network. `runtime` tasks run while a
 * child uses the site; `development` ones once, before a textbook card ships (and a person checks the result by ear).
 */
export type TaskInfo={file:PromptFile;model:'千问'|'Fun-Music';when:'runtime'|'development';fallback:string};
export const TASKS:Record<TaskId,TaskInfo>={
 'background-audio':{file:BACKGROUND_AUDIO_PROMPT,model:'Fun-Music',when:'runtime',fallback:'下一步：AI 写音符'},
 'background-notes':{file:BACKGROUND_NOTES_PROMPT,model:'千问',when:'runtime',fallback:'本地生成的背景'},
 'work-talk':{file:WORK_TALK_PROMPT,model:'千问',when:'runtime',fallback:'语料 discoveries.v1（逐句替换）'},
 'textbook-talk':{file:TEXTBOOK_TALK_PROMPT,model:'千问',when:'runtime',fallback:'语料 textbook-talk.v1（逐句替换）'},
 'sound-hint':{file:SOUND_HINT_PROMPT,model:'千问',when:'runtime',fallback:'语料 sound-hints.v1（现在只用语料）'},
 'mood-words':{file:MOOD_WORDS_PROMPT,model:'千问',when:'runtime',fallback:'如实提示“还没开放”，请孩子选一个预设心情'},
 'textbook-words':{file:TEXTBOOK_WORDS_PROMPT,model:'千问',when:'development',fallback:'老师或音乐角色手写'},
};
export const TASK_IDS=Object.keys(TASKS) as TaskId[];

/** Versions of the shared system prompt and every task prompt; an AI result carries the one it was made with. */
export const PROMPT_VERSIONS={system:SYSTEM_PROMPT.version,...Object.fromEntries(TASK_IDS.map(id=>[id,TASKS[id].file.version]))} as Readonly<Record<'system'|TaskId,string>>;
