// 提示词台 wording. A tool for the music and product roles in development and preview builds only.
import type {TaskId} from '@wanwu-v2/prompts/tasks';

export const promptCopy={
 title:'提示词台',
 subtitle:'只在开发 / 预览环境出现。看一项 AI 任务：程序给模型的匿名摘要、模型不在时孩子看到的语料、拼好的提示词；再贴一段模型回复，看哪些句子能用。',
 readme:'改文字：packages/prompts/corpus/（语料）和 prompts/（提示词）。说明见 packages/prompts/README.md。',
 toRules:'去调音台',
 tasks:{
  'work-talk':'作品讲解 · 音乐小发现','textbook-talk':'课本讲解润色','background-notes':'AI 写音符','background-audio':'AI 生成背景',
  'mood-words':'心情“自己写”','sound-hint':'向导联想','textbook-words':'课本歌曲的文字',
 } satisfies Record<TaskId,string>,
 status:{open:'开放',closed:'暂不开放（只用语料）'},
 when:{runtime:'孩子使用时',development:'开发期，一次'},
 meta:(model:string,version:string,when:string,fallback:string)=>`${model} · ${version} · ${when} · 不在时：${fallback}`,
 inputs:'这首作品',mood:'心情',noMood:'不选',song:'课本歌曲',noSong:'不用',variation:'样子',attempt:'第几次生成',
 hint:'选项',kind:'体检分类',noKind:'未知',moodText:'孩子写的心情',
 brief:'程序给模型的（匿名摘要）',local:'模型不在时（语料 / 本地规则）',prompt:'拼好的提示词',system:'共用的系统提示词',
 noPrompt:'这一项现在没有可发的内容。',
 reply:'贴一段模型回复',fillExample:'填入示例回复',clear:'清空',
 replyNote:'只在这台设备上检查，不会发出去。',
 repairs:'读取时修补',shown:'页面会显示',
 verdict:{accepted:'全部能用',partly:'部分能用，其余用语料',rejected:'不能用，全部用语料'},
 notes:{
  needEvents:'声场里还没有声音：先摆几个，或用示例作品。',
  needSong:'先在上面选一首课本歌曲。',
  audio:'音频由模型自由生成：页面只能检查时长和格式（parseBackgroundResult），音量由混音规则压在孩子的声音下面。',
  hintClosed:'向导联想现在只用语料：每次点选都发请求太慢，也不划算。端口和提示词草稿已留好。',
  moodOff:'还没开放：小青蛙请孩子选一个预设心情。孩子写的话原样保留，模型只负责选最接近的预设。',
  example:'示例卡片（不是真的课本歌曲）',
 },
 kinds:{one:'单个声音',series:'一串声音',texture:'连成一片'},
} as const;
