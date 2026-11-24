# 谁控制什么：提示词 · 程序与音乐规则 · 系统语料

更新：2026-10-24。路径都相对 `wanwu-shengpu-v2/`。

## 一、先看这张图

页面上每一句话、每一段声音，都出自下面四种控制方式之一：

| 方式 | 管什么 | 谁来改 | 在哪 |
| --- | --- | --- | --- |
| **① 程序与音乐规则** | 所有事实和数字：声音体检、五个维度、背景音乐、混音、匹配、小发现“数出了什么” | 音乐角色改 JSON；研发改算法 | `packages/sound-rules/` |
| **② 系统语料** | 孩子和老师看到的固定内容：联想、小发现、课本讲解、用词规范 | 音乐、产品 | `packages/prompts/corpus/` |
| **③ 提示词（模型）** | 发给千问的指令：只换说法、从选项里挑、写一句动机 | 音乐、产品；研发管格式 | `packages/prompts/prompts/` |
| **④ 模型自由创作** | Fun-Music 生成背景音频 | 只能靠描述词引导 | 描述词在 `prompts/background-audio.v1.json` |

一句话：**事实和数字由程序给；孩子操作后的反馈用语料；模型只做“换个说法”和“音乐创作”。** 没有联网或模型失败时，都退回 ①②，孩子照样用。

---

## 二、① 程序与音乐规则 `packages/sound-rules/`

改数值只动 `rules/*.json`；每个参数的含义和“出问题查哪个参数”见 [`packages/sound-rules/README.md`](../../packages/sound-rules/README.md)。填错（超范围、拼错、关系不对）`npm test` 会报中文错误，不会上到网页。

### 规则文件（音乐角色调这里）

| 文件 | 管什么 |
| --- | --- |
| `rules/analysis.v2.json` | 声音体检：怎么找单个声音、分“单个声音 / 一串声音 / 连成一片”、一声多长、偏高偏低 |
| `rules/shaping.v3.json` | 五个维度（高低、长短、变化、轻响、出现方式）每一档怎么变；一个声音最多响 45 秒 |
| `rules/background.v1.json` | 本地背景：心情配色表、调式、旋律只在空档、结尾、课本歌曲的几种样子（压短、慢一倍…）、碰一碰的判定 |
| `rules/mix.v1.json` | 混音：孩子声音和背景的音量、背景让位、总线限幅 |
| `rules/textbook-match.v1.json` | 帮我找找：课本歌曲怎么匹配 |

### 算法（纯函数，研发维护）

| 文件 | 做什么 |
| --- | --- |
| `src/rules.ts`、`src/schema.ts` | 读取规则并检查范围和关系；`RULE_VERSIONS` 汇总版本 |
| `src/analysis.ts`、`src/spectrum.ts` | 声音体检 |
| `src/shaping.ts`、`src/arrange.ts` | 五维度塑形、时间线（声场、曲谱、渲染共用） |
| `src/background.ts` | 本地背景音符、碰一碰（`backgroundMeeting`）、谁演奏哪个声部 |
| `src/textbookVariation.ts` | 课本歌曲换样子（`shapeOf`）和系统挑哪两个样子 |
| `src/textbookMatch.ts` | 帮我找找的相似度 |
| `src/mix.ts` | 背景让一让（避让曲线）、限幅 |

### 网页里执行声音的地方（没有任何数值，只执行规则给的计划）

| 文件 | 做什么 |
| --- | --- |
| `apps/web/src/shared/audio/renderShaped.ts`、`grains.ts` | 按塑形计划发声 |
| `apps/web/src/shared/audio/renderBackground.ts` | 演奏本地背景音符 |
| `apps/web/src/shared/audio/SequencePlayer.ts` | 分层音量播放和限幅 |
| `apps/web/src/shared/audio/soundAnalysis.ts` | 按录音缓存体检结果 |
| `apps/web/src/shared/background/backgroundLayer.ts` | 从作品算出背景输入，和发给 AI 的匿名摘要 `BackgroundBrief` |
| `apps/web/src/shared/background/instruments.ts`、`library.ts` | 乐器和分工 |
| `apps/web/src/shared/creation/arrangementTiming.ts` | 作品时长、行、先后 |
| `apps/web/src/shared/talk/discoveries.ts` | 音乐小发现：从摆放数出“谁先出现、重复几次、一问一答…”（只找事实，不写话） |

### 调试工具

`apps/web/src/pages/lab/`：调音台 `/lab/sound-rules`（逐项滑块、试听、校验后导出规则文件）。只在开发或预览构建里有。

---

## 三、② 系统语料 `packages/prompts/corpus/`

这是孩子和老师**现在实际看到**的内容，也是所有 AI 任务失败时的降级。改文字不改代码，`npm test` 检查字数、用词、占位符和覆盖是否齐全。

| 文件 | 内容 | 谁看到 |
| --- | --- | --- |
| `style.v1.json` | **用词规范**：每类句子的读者和字数上限（动物台词和联想 36 字、小发现 45 字、试一试 35 字、课本一句话 16 字、老师讲解 80 字）；给孩子避开的术语；对谁都不说的评价话 | 所有语料和模型回复都用它检查 |
| `sound-hints.v1.json` | 声音诞生：选完一项后声音标记的联想；每个选项 2–3 句，按体检分类先说专用的一句 | 孩子 |
| `discoveries.v1.json` | 万物成曲：音乐小发现（孩子的一句、音乐知识、可以问孩子、试一试） | 孩子 + 老师（灯泡面板） |
| `textbook-talk.v1.json` | 课本讲解四句：特点、这次的样子、碰一碰、试一试；拍子名和节奏字（嗒 / 嘀） | 孩子 + 老师 |

读取和检查的代码：

| 文件 | 做什么 |
| --- | --- |
| `src/corpus.ts` | 加载、检查，按事实填空（`discoveryText`、`textbookTalk`、`presetHint`） |
| `src/style.ts` | 字数和用词检查 |
| `src/fill.ts` | 填 `{占位符}` |
| `src/accept.ts` | 判断模型回复能不能显示（前端和服务端共用） |

### 页面上写在各页的话（操作反馈，和页面状态一一对应）

| 文件 | 内容 |
| --- | --- |
| `apps/web/src/pages/sound-world/config/guideLines.ts` | 小青蛙说的话（≤36 字，两行内） |
| `apps/web/src/pages/compose/config/guideLines.ts` | 小松鼠说的话，含课本样子的前后变化 |
| `apps/web/src/pages/sound-birth/config/copy.ts` | 声音标记的气泡和声音诞生页的提示 |
| `apps/web/src/pages/*/config/copy.ts`、`apps/web/src/shared/inspiration/copy.ts`、`apps/web/src/shared/background/copy.ts` | 页面、弹窗上的说明（一句、≤30 字，只引导不讲策略）和背景的描述 |
| `apps/web/src/shared/talk/talkView.ts` | 把语料句子和（将来的）AI 句子逐句合并 |

`apps/web/tests/wording.test.ts` 守着这些话的长度；动物台词全部过用词检查。

---

## 四、③④ 提示词 `packages/prompts/prompts/`

只在服务端拼装，前端不打包；每个任务一份文件，带版本。结构：`lines`（发给模型的指令，一行一行）、`words`（词表）、`example`（示例回复）、`status`（open / closed）。

| 文件 | 给谁 | 任务 | 回复怎么处理 |
| --- | --- | --- | --- |
| `system.v1.json` | 千问各任务共用 | 读者是乡村低年级孩子和非音乐专业老师；只看匿名摘要；不评价孩子；数字照抄；用词规范；只返回 JSON | — |
| `work-talk.v1.json` | 千问 | 作品讲解：把每条“小发现”换成更爱听的一句，再写一句试一试 | 逐句检查，不合格的退回语料 |
| `textbook-talk.v1.json` | 千问 | 课本讲解润色：把四句说得更连贯，意思不变 | 逐句检查，歌名必须保留 |
| `background-notes.v1.json` | 千问 | AI 写音符：只写一句动机、四段疏密和音区、低音律动；程序再发展成伴奏 | 取整、补齐、少于 2 个音就不用 |
| `background-audio.v1.json` | Fun-Music | AI 生成背景：时长、情绪、速度、能量、留白、“不要人声不要主旋律” | 只能查时长和格式；音量由混音规则压在孩子下面 |
| `mood-words.v1.json` | 千问 | 心情“自己写”：从 7 种预设里挑最接近的一个 | 只认预设或 null；孩子的字原样保留 |
| `sound-hint.v1.json` | 千问 | 向导联想（`closed`：现在只用语料） | 字数和用词 |
| `textbook-words.v1.json` | 千问（开发期） | 课本歌曲的心情和一句给孩子的话，再人耳核对 | 只认预设心情，一句话 ≤16 字 |

拼装与读取的代码（服务端和提示词台用，页面不能引用，`apps/web/tests/structure.test.ts` 守着）：

| 文件 | 做什么 |
| --- | --- |
| `src/tasks/files.ts` | 加载提示词文件并检查，拼出系统提示词 + 任务提示词 |
| `src/tasks/talk.ts`、`background.ts`、`words.ts` | 各任务拼提示词、读回复、修补 |
| `src/tasks/reply.ts` | 去 Markdown、多余的话、多余的逗号 |
| `src/tasks/index.ts` | 任务清单（模型、什么时候用、降级到哪）和 `PROMPT_VERSIONS` |

### 接口和契约

| 文件 | 内容 |
| --- | --- |
| `packages/contracts/src/talk.ts` | 讲解的匿名摘要（声音只用「声音1」编号）和回复形状 |
| `packages/contracts/src/background.ts` | AI 背景请求 `BackgroundBrief` 和结果 `BackgroundResult` |
| `packages/contracts/src/work.ts` | `rendering.prompt` 记录 AI 背景用的提示词版本 |
| `apps/web/src/shared/talk/polisher.ts` | 讲解润色端口（现在如实“未开放”，不发请求） |
| `apps/web/src/shared/talk/briefs.ts` | 把事实变成匿名摘要 |
| `apps/web/src/shared/background/generator.ts` | AI 背景端口和降级链：AI 音频 → AI 写音符 → 本地 → 只听孩子的声音 |
| `apps/web/src/pages/sound-birth/services/soundHints.ts` | 联想端口（现在读语料） |
| `apps/web/src/pages/sound-world/services/moodInterpreter.ts` | 心情“自己写”端口（现在如实“未开放”） |
| `apps/web/src/shared/creation/soundLibrary.ts` | 声音库端口：声音诞生和万物声场取示例声音都走它（今天是随网页提供的示例录音） |
| `apps/web/src/shared/inspiration/catalog.ts`、`useInspirationCatalog.ts`、`tabs.ts` | 课本曲库端口；两页共用的加载、帮我找找、弹窗先开哪一页 |
| `apps/web/src/shared/inspiration/teachingMusic.ts` | 教学音乐端口（上传分析未开放） |
| `apps/web/src/app/services.ts` | 唯一选择每个端口用哪个实现的地方；接后端时换这里 |

### 调试工具

`apps/web/src/pages/lab/PromptLabPage.tsx`（`/lab/prompts`）：每个任务三栏——程序给模型的匿名摘要 · 模型不在时的语料 · 拼好的提示词；可以贴一段模型回复，看哪些句子能用。

---

## 五、两类模型各控制哪些板块、怎么控制

模型只出现在 5 个板块，都只做“换说法”或“音乐创作”，从不碰孩子的声音、摆放和选择。服务端尚未开发，下面是已定的设计；前端现在全部走降级（如实显示未开放，不发请求）。

### 语言模型（千问，阿里云百炼，OpenAI 兼容接口）

| 板块 | 控制什么 | 靠什么控制 | 输出怎么管 | 失败时 |
| --- | --- | --- | --- |
| 万物成曲 · 音乐小发现 | 把程序数出来的每条事实换成更爱听的一句，再写一句“试一试” | `system.v1.json` + `work-talk.v1.json`；输入是匿名事实，声音只用「声音1」编号；每条附本地说法 | `accept.ts` 逐句检查：条数、顺序、种类一致；只能提这条事实里的声音和数字；字数和用词 | 不合格的那一句退回语料，其余照用 |
| 万物成曲 · 课本讲解 | 把四句讲解说得更连贯 | `system.v1.json` + `textbook-talk.v1.json`；输入是歌曲特征、这次的样子、碰一碰、本地四句 | 逐句检查；feature 必须保留歌名；不能加数字 | 逐句退回语料 |
| 万物成曲 / 声场 · AI 写音符（背景） | 只写“一句动机 + 四段疏密音区 + 低音律动”，不写音符表 | `system.v1.json` + `background-notes.v1.json`；输入是 `BackgroundBrief`（长度、孩子何时在响、速度、拍子、调式、心情、课本节奏特征）；重新生成时要求换动机 | `acceptMusicIdea`：取整、补齐四段、少于 2 个音就不用；之后由程序（规则包）发展成伴奏、只放进空档、逐音校验 | 退到本地生成的背景 |
| 声场 · 心情“自己写” | 从 7 种预设心情里挑最接近的一个 | `system.v1.json` + `mood-words.v1.json` | 只认预设或 null；孩子写的字原样保留 | 如实提示还没开放，请孩子选预设 |
| 声音诞生 · 向导联想 | 一句联想（`closed`，暂不开放） | `system.v1.json` + `sound-hint.v1.json` | 字数和用词 | 语料 `sound-hints`（现在只用语料） |
| 开发期 · 课本歌曲的文字 | 歌曲的心情和一句给孩子的话 | `textbook-words.v1.json`；数值由代码算，不让模型判断速度和调式 | 只认预设心情，一句话 ≤16 字；再由人耳核对 | 老师或音乐角色手写 |

语言模型的共同约束（都在 `system.v1.json`）：读者是乡村低年级孩子和非音乐专业老师；只看匿名摘要，不猜孩子是谁；不评价孩子；事实和数字照抄；用词遵守 `style.v1.json`；只返回 JSON。

### 音乐模型（Fun-Music，阿里云百炼 `fun-music-preview`）

| 板块 | 控制什么 | 靠什么控制 | 输出怎么管 | 失败时 |
| --- | --- | --- | --- | --- |
| 万物成曲 / 声场 · AI 生成背景 | 一段无人声、无歌词的纯音乐垫音 | `background-audio.v1.json`：程序用固定模板从 `BackgroundBrief` 拼出一段文字描述（长度、情绪、速度和拍子、调式、能量、孩子的声音占多少、音区、课本节奏、“只做陪衬、不要主旋律和人声、不要已知旋律”）。**描述词由程序拼，不由模型写** | 模型听不到孩子的声音，只按描述生成，**无法精细控制**。页面只检查：https、时长不超过整首（`parseBackgroundResult`）；音量由 `mix.v1.json` 压在孩子声音下面并让位 | 下一步 AI 写音符，再不行用本地背景，再不行只听孩子的声音；从不自动替换，由孩子决定换不换 |

### 降级链（程序控制，`shared/background/generator.ts`）

AI 音频（超时 60 秒）→ AI 写音符（超时 8 秒）→ 本地动态音符（规则，不联网）→ 只听孩子的声音。每一步失败立即走下一步，本地背景一直在响；AI 做好后只出现一个“AI”按钮，孩子点了才换上。

### 模型完全不碰的板块

声音体检、五个维度塑形、声场摆放和时长、本地背景、混音、课本匹配和换样子、碰一碰、音乐小发现的事实、所有操作反馈台词。这些全由 ① 控制。

---

## 六、出问题查哪里

| 现象 | 查 |
| --- | --- |
| 声音听着不对（太快、太高、重复太密） | ① `rules/shaping.v3.json`，调音台里试 |
| 鸟鸣被分错类 | ① `rules/analysis.v2.json` |
| 背景太吵、盖住孩子的声音 | ① `rules/mix.v1.json` |
| 背景某种心情听着不合适 | ① `rules/background.v1.json` 的 `moods` |
| 小动物或声音标记说的话不顺、太长 | ② `corpus/*.json`，或 `pages/*/config/guideLines.ts` |
| 老师讲解看不懂 | ② `corpus/discoveries.v1.json` 的“音乐知识”“可以问孩子” |
| AI 写的句子总被退回 | ③ `prompts/work-talk.v1.json`；在提示词台贴回复看原因 |
| AI 背景太抢戏、有人声 | ④ `prompts/background-audio.v1.json` 的约束句 |
| AI 写的动机总是一个调 | ③ `prompts/background-notes.v1.json`，加“换动机”的要求 |
| 改了提示词怎么记录 | 上线前不升版本；上线后另存新版本文件，作品的 `rendering.prompt` 会记下用的是哪一版 |

## 七、改完怎么验

```sh
npm test          # 语料、提示词、规则、回复样本、字数全部检查
npm run build     # 类型检查 + 构建（正式构建里没有提示词和提示词台）
```

详细说明：[`packages/prompts/README.md`](../../packages/prompts/README.md)、[`packages/sound-rules/README.md`](../../packages/sound-rules/README.md)、[`packages/contracts/README.md`](../../packages/contracts/README.md)。
