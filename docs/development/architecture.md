# 模块与后续接入边界

## 当前选择

一套响应式 H5，React + TypeScript + Vite。此阶段不需要服务端渲染、数据库或模型调用；构建产物可作为静态站点部署。依赖精确锁定在 `package-lock.json`，不引用旧工程的依赖目录。

首页组件只接收用户操作回调。动画控制器只管理自己的空前景容器；场景图片、导航、文案由 React 管理。页面卸载、切后台、跳过和减少动态都会清理动作与音频，避免切页后继续播放。音频必须由用户点击触发，同一时刻一个声音。

## 已建立的边界

| 层 | 负责 | 后续扩展方式 |
| --- | --- | --- |
| app | 页面入口、无依赖的 history 路由（`router.ts`）、主流程四步与入口类型（`navigation.ts`）、全局错误反馈 | 新页面验收后在 `navigation.ts` 打开对应入口，并在路由里加一条 |
| pages/<页面> | 页面布局、页面内组件与流程状态 | 每个页面独立验收，避免在首页追加全流程 |
| config | 图片、坐标、透明度、动画参数 | 视觉调整不改播放与开场状态逻辑 |
| shared/ui、media、audio、markers、scene、creation、inspiration、platform | 基础组件与图标（含工作页弹窗 `WorkSheet`、顶栏入口 `WorkHeaderActions`、工作页标题行 + 向导 `WorkIntro`、心情脸 `MoodFace`）、资源加载、声音录放 / 塑形 / 排程（工作页统一 `SequencePlayer`）、声音标记、首页场景素材与工作页背景、当前作品 / 书架 / 本机来源档案 / 示例声音与示例作品 / 时间与行 / 五项与心情文案 / 本地 ID、课本灵感、设备提示 | 后续页面按需复用；页面之间不互相引用内部实现；两页以上用到的东西放这里，只保留一份 |
| packages/contracts（`@wanwu-v2/contracts`） | 前后端共同的数据契约；已有 `sound-v1`（含声音体检结果 `SoundAnalysis`）、`arrangement-v1`、`work-v1`、`textbook-v1`、`background-request-v1`、`talk-v1`（音乐小发现事实、讲解的匿名摘要与回复形状） | 以包名引用，新增领域先写类型和校验，再加存储 |
| packages/sound-rules（`@wanwu-v2/sound-rules`） | 声音体检、五维度塑形、本地背景、混音、课本匹配：数值在 `rules/*.json`（带版本、范围校验），算法是纯函数；页面和渲染器只读这里，自己不写数值 | 音乐角色改 JSON + `npm test`；听感变化上线后另存新版本文件。说明见包内 README |
| packages/prompts（`@wanwu-v2/prompts`） | 语料（`corpus/*.json`：向导联想、音乐小发现、课本讲解、用词规范）与提示词（`prompts/*.json`，只在服务端拼装）；回复检查 `accept.ts` 前后端共用 | 页面只引用 `corpus` / `style` / `accept`（`tests/structure.test.ts` 守着）；改文字 + `npm test`；上线后改提示词另存新版本。说明见包内 README |
| 后端（未开发） | 身份、音源与作品、文件存储、AI 网关 | 接在仓库 / 服务端口之后，页面不直接访问云资源 |

没有为了预留而实现假的服务器、数据库、账号或空 API。当前首页只使用本站静态资源，不收集个人信息，不向模型发送内容。

## 升级与接入原则（2026-10-24 结构审核）

1. **一份素材一个入口。** 页面要的数据都通过 `app/services.ts` 里的端口取，接后端只换这一个文件里的实现：
   | 端口 | 谁用 | 今天的实现 |
   | --- | --- | --- |
   | `soundLibrary`（`shared/creation/soundLibrary.ts`） | 声音诞生的声音库、万物声场的“找更多声音 · 示例” | 随网页提供的示例录音（真实内容，不是 mock） |
   | `inspirationCatalog`（`shared/inspiration/catalog.ts`） | 万物声场、万物成曲、作品书架 | 示例课本歌曲（mock） |
   | `teachingMusic`（`shared/inspiration/teachingMusic.ts`） | 课本灵感的教学音乐 | 未开放 |
   | `backgroundLibrary`、`backgroundGenerator`、`talkPolisher`、`soundHints`、`moodInterpreter` | 背景、AI 背景、讲解润色、联想、心情 | 示例乐器 / 未开放 / 语料 |
   | 各页 `*Repository` | 作品、设置、书架 | 本次打开期间的内存（mock） |
   页面不直接读示例声音清单或课本卡片（`apps/web/tests/structure.test.ts` 检查）。
2. **两页以上用的逻辑只留一份，放 `shared/`。** 例：课本灵感的加载、帮我找找、弹窗先开哪一页（`shared/inspiration/useInspirationCatalog.ts`、`tabs.ts`），背景层（`shared/background/`），讲解（`shared/talk/`）。两页只留各自的布局。
3. **数值、文字、提示词各在自己的包里。** 数值 `packages/sound-rules/rules/`，语料和提示词 `packages/prompts/`，数据格式 `packages/contracts/`；页面不写数值，不写模型指令。改动有测试校验，上线后改听感或提示词另存新版本。
4. **只在开发时用的工具不进正式构建**（调音台、提示词台），由 `VITE_ENABLE_LAB` 控制。
5. **非运行文件不放进项目。** 开发交接、验收和调整记录、需求原文快照、已停用功能的原件都在项目外的 `万物声谱_视觉过程稿/`（`handoff/`、`records/`、`product/`、`已停用素材/`）；项目里只留运行、构建和现行说明需要的文件。
6. **新功能接入的顺序：** 先在 `packages/contracts` 定数据格式和校验 → 在 `shared/` 或页面 `services/` 定端口（文件头写好预留的接口路径）→ 在 `app/services.ts` 选实现（离线时如实说“未开放”，不造假成功）→ 页面只调端口。

## 首页进入声音诞生与弹窗基础层

- 首页“开始成曲”直接跳转 `/create`（2026-10-23 删除了开始方式弹窗与 `?from=` 入口参数；录音、上传、声音库、拍照读声卡都在声音诞生页上选）。
- 下一步页面的代码用 `app/prefetch.ts` 的 `prefetchWhenIdle` 预取：等当前页加载完、页面图片到齐（最多等 20 秒）、再过一段延时（首页 3 秒，其余 1.5 秒）并在浏览器空闲时才取；省流量模式或 2G 网络下不预取，进入页面时照常加载。
- `shared/ui/Dialog.tsx` 复用原生 modal 的焦点约束、Esc 与背景关闭，管理滚动锁和关闭后的焦点恢复；`NoticeDialog`（首页未开放入口）与工作页的 `WorkSheet` 复用该基础层。打开弹窗时暂停首页试听与当前角色动作，不在关闭后自动续播。

## 声音诞生页

- 路由 `/create`，代码单独分包，弹窗打开时预取。`pages/sound-birth/` 分为 `components/`（声音条、我的声卡、声卡信息、五行选择、录音 / 声音库 / 纸卡对话框）、`model/`（纯 reducer `soundBirthState.ts`；编排 hook `useSoundBirth.ts`，拆出 `useRecording`（录音）、`useTrimUpload`（长文件截取）、`useLibraryItems`（声音库加载与试听）、`useShapedPreview`（塑形渲染与对比试听）和 `localSource.ts`）、`config/`（文案、示例声音条目、向导动物、提示文案）、`services/`（声音库分组、向导提示端口）。五项文案、本机来源档案、背景层、弹窗面板和顶栏入口都在 shared，与万物声场共用。
- 数据走 `@wanwu-v2/contracts/sound`：来源与溯源信息、五项、交给声场的 `SoundUnitDraft`。原声只读：先做声音体检、再按卡片塑形，规则在 `packages/sound-rules`（2026-10-24 起 `shaping-v3`），浏览器只负责离线渲染（`shared/audio/renderShaped.ts`、`grains.ts`）和按缓冲区缓存体检结果（`shared/audio/soundAnalysis.ts`）。本机来源档案和示例声音清单在 `shared/creation/`，与万物声场共用。
- 向导提示走 `services/soundHints.ts` 的 `SoundHintProvider` 接口，当前是本地预设文案；接模型时实现同一接口即可。
- 一次做多个声音（2026-10-24）：“做好了”旁边的“再做一个”把当前声音放进作品（和“做好了”同样的检查），页面清空、换下一个编号接着做；做完点“做好了”一起进声场，空页面点“做好了”也会带着已放进的声音进声场。交接逻辑在 `model/useFinish.ts`，`App` 的 `finishSound` 负责放进作品；作品最多 12 个声音，满了会提示。手机上两个按钮并排，360px 以下上下排。
- 首页场景的素材清单放在 `shared/scene/`（`homeScene.ts` + 生成的 JSON），首页、弹窗和声音诞生页都通过它取同一批已缓存的文件。
- 图标：`shared/ui/PaperIcon.tsx` 里的 `PaperIcon`（彩色纸片图标，按色卡上色）和 `Glyph`（实心小图标，跟随文字颜色）；心情脸是 `MoodFace.tsx`。作品书架保留原版的 `KidIcon` 与 `shared/scene/WorkBackdrop`（首页灌木淡背景）。
- 屏幕档位只有一份：`styles/breakpoints.ts`（`phone / tiny / one-column / narrow / narrow-compose / short / shorter / tablet-short / header-compact / sheet-narrow / reduced-motion`）。CSS 写 `@media(--short)`，构建时由 `vite.config.ts` 的小插件展开；代码里用 `media.phone` 等。`scripts/check-styles.mjs`（随 `npm run build` 运行）拒绝写死像素的媒体查询、未知档位，以及超过 220 行的源文件。组件内部按容器宽度的 `@container` 仍写在组件里。
- 每个组件的外观和它的响应式规则放在同名 `components/Xxx.module.css`；页面级 `XxxPage.module.css` 只放页面布局。页面内多个组件共用的少量样式放在 `components/controls.module.css`（声音诞生）、`components/sheet.module.css`（万物声场）。
- 样式分三层：`styles/global.css` 的 `--wk-*` 令牌（颜色、阴影、胶带、页面底色、`wk-rise` 入场动画，cascade layer `wk-base`）；`shared/ui/controls.module.css` 的共用外观（胶囊按钮 `pill` + `go / outline / back`，胶带绿卡 `limeCard + tape`，layer `wk-ui`，在代码里用 `ui.*`）；各页、各组件的模块只管尺寸和位置。页面样式不在任何 layer 里，所以总能覆盖共用外观，与 CSS 加载顺序无关。

## 万物声场页

- 路由 `/world`，代码单独分包，在声音诞生页时预取。声音诞生“做好了”经 `App` 把 `SoundUnitDraft` + 来源交给 `shared/creation/workSession.ts`（本次打开期间的当前作品），再打开本页；标记编号由作品分配。
- `pages/sound-world/` 分为 `components/`（左栏声音、声场、浮动工具、心情、找更多声音）、`model/`（纯 reducer `soundWorldState.ts`、几何换算 `fieldGeometry.ts`、拖动 `useFieldDrag.ts`、编排 hook `useSoundWorld.ts`，拆出 `useFieldSound`（声音库、单个试听、整段试听与游标）和 `useMood`（心情））、`config/`（文案、mock 示例单元与示例摆放、青蛙向导）、`services/`（`SoundWorldRepository` 端口，文件头列出预留 REST 路径；mock 在 `src/mocks/`）。
- 数据走 `@wanwu-v2/contracts/arrangement`：事件只存 0–1 先后位置与行号（行只管错开摆放，不改变声音；默认 3 行可加到 5 行），不存像素；声音身份 `unitId` 与事件身份分开。整段试听用 `shared/audio/SequencePlayer.ts` 在同一音频时钟上排程，游标、高亮读同一时间，万物成曲可复用。
- 详见项目外的 `万物声谱_视觉过程稿/records/sound-world-acceptance.md`。

## 万物成曲页与作品书架

- 路由 `/compose`（在声场时预取）和 `/works`（在成曲时预取），各自分包。`pages/compose/` 分为 `components/`（曲谱卡、播放条、右栏三卡、底栏与特征面板、弹窗）、`model/`（纯 reducer `composeState.ts`、曲谱派生 `scoreLayout.ts`、编排 hook `useCompose.ts`，拆出 `usePiecePlayback`（同一时钟的播放 / 暂停 / 跳转 / 拖动）和 `useTalk`（音乐小发现与课本讲解））、`config/`（文案、松鼠向导）、`services/`（`ComposeRepository` 端口，文件头列出预留 REST 路径；mock 在 `src/mocks/`）。`pages/works/` 同样分层，端口 `ShelfRepository`。
- **mock 统一放在 `src/mocks/`**（2026-10-24）：各页仓库、乐器库、示例课本歌曲、作品书架内存实现都在这里；`src/app/services.ts` 是唯一选择实现的地方（页面 hook 的默认参数从这里取），接后端时在这里换成服务端适配器、删掉 `mocks/` 即可。`tests/structure.test.ts` 检查除 `app/services.ts` 外没有文件引用 `mocks/`。声音库示例声音、示例摆放是给访客的真实内容，如实的离线实现（AI 未开放、预设提示、心情自己写要模型）也不算 mock。
- 课堂大屏 `shared/ui/classroom.ts`：声场、成曲两页打开时在 `<html>` 上设 `data-classroom`，字号课堂档在 `styles/typography.css`，各组件自己的课堂规则写在各自的 CSS 里。
- 调音台 `pages/lab/`（`/lab/sound-rules`）和提示词台（`/lab/prompts`，2026-10-24）：只在开发环境或 `VITE_ENABLE_LAB=1` 的预览构建里打包（`app/App.tsx`），正式站没有（已核对产物里没有提示词文字）。
- 讲解两页共用（2026-10-24）：`shared/talk/`（音乐小发现的事实 `discoveries.ts`、发给模型的匿名摘要 `briefs.ts`、讲解润色端口 `polisher.ts`（离线实现如实未开放）、语料与 AI 句子的合并 `talkView.ts`）。文字都在 `@wanwu-v2/prompts/corpus`；声音诞生的联想端口 `pages/sound-birth/services/soundHints.ts` 也读语料。
- 背景层两页共用（2026-10-24）：`shared/background/`（示例乐器与分工、`BackgroundLibrary` 端口 + mock、从作品算规则输入、`useBackgroundLayer` 渲染缓存与音量、来源说明文案）和 `shared/audio/renderBackground.ts`（只演奏规则给的音符）。音符、结尾、让位、限幅都来自 `packages/sound-rules`。AI 背景端口 `shared/background/generator.ts`（降级链与超时，mock 未开放），成曲页 `model/useAiBackground.ts` 只在孩子选择时换上 AI 背景。
- 课本灵感是共用模块 `shared/inspiration/`（特征模板目录端口 `InspirationCatalog` 与示例模板、帮我找找 `matches.ts`、试听合成、教学音乐本机选择与后端流程说明、`InspirationDialog`），万物声场摆放前就能选，万物成曲沿用同一个选择。模板契约是 `@wanwu-v2/contracts/textbook`。
- 曲谱只从 `arrangement-v1` 派生，不存储。声场与成曲共用 `shared/creation/arrangementTiming.ts`（开始秒、听到的长度、整首长度、行整理、切换长度）、`exampleWork.ts`（示例单元与示例摆放）、`workSounds.ts`（音源加载与塑形缓存）。
- 播放只有一个时间：`shared/audio/SequencePlayer` 支持从任意秒开始、整首长度和分层音量；竖线、进度条、时钟、高亮都读它。背景是独立的 `background` 层。
- 背景音乐本身总是存在（今天是本地规则生成，以后可换成 AI 背景、失败时退回本地），乐器按分工演奏，不选 = 原始背景；只有开关让背景静音。万物声场的“听听这段声音”也带同一层背景。
- 作品契约 `@wanwu-v2/contracts/work`（`work-v1`）。当前作品设置存在 `workSession`，书架是 `shared/creation/workShelf.ts`（本次打开期间，内存）。详见 `compose-acceptance.md`、`works-acceptance.md`。

## 合并与不合并（2026-10-23 结构整理）

- 合并：万物声场、万物成曲、作品书架的标题行 + 向导（`shared/ui/WorkIntro`，各页颜色和尺寸用 CSS 变量传入）；心情文案与“取预设心情”（`shared/creation/moodCopy`）；示例声音加载超时（`shared/creation/exampleSounds` 的 `EXAMPLE_TIMEOUT_MS`）。整理前后 24 组页面 × 尺寸测量完全一致。
- 不合并：声音诞生（已验收）的标题行——尺寸、断点、动画不同，且矮屏下会把向导气泡一起隐藏，强行合并会改画面；各页的时间格式小函数（含义不同）、按钮与入场动画样式（只是相似）。

## 产品原则与字段预留方向

后续音源、声卡、作品的数据模型应保留稳定 ID、来源与贡献记录、原件引用、可见范围、所属个人 / 班级 / 学校 / 地域、创建和更新时间、数据版本。作品还需保存编排、孩子确认的参数、背景层来源与版本、音乐发现和可选课本映射。此处是接入约束，不是已经建表。

可见范围：个人、班级、学校、地域、公开。前端组件问权限端口，不在页面中散写角色判断；真实访问控制和查询过滤由服务端完成。后续保留授权 / 同意版本、审核状态、删除状态等扩展位置，具体规则需到该阶段确认。

账号方式在参考文件中存在不同设想（微信、手机号等），此阶段不替用户决定。原始录音不覆盖、默认不过度公开、不收真实儿童姓名 / 人脸 / 精确地点的方向保留。离线数据与待同步队列在功能阶段设计，当前没有宣称支持 PWA 或离线业务。

## 需求优先顺序

用户当前约定 > 最新确认首页 > `万物声谱_视觉过程稿/product/` 两份文件。指南中的“沿用现有视觉”、十天排期、旧 Next.js 目录和已有库路径属于旧工程背景，不约束本次独立 React 工程。指南与使用流程存在缓存 / PWA 口径差异，后续功能设计前明确，不在首页迁移时悄悄实现。

## 手绘标题资源与动画边界

`HandwrittenTitle` 负责组合字形及后方装饰，`TitleSprite` 只渲染透明图集。位置、角度、尺寸比例和时序集中在 `config/title.ts`。`titleMotionState.ts` 决定 waiting / entering / settled / fallback 状态，`useTitleMotion.ts` 负责入场计时、轻量策略及页面可见性；文字完成入场后没有持续动画，循环只作用于装饰。

`shared/media/useDecodedImage.ts` 单独处理响应式资源、解码、兼容回退、超时与取消；文字不等待装饰资源。加载时不逐帧请求资源，不在网页里提取轮廓或处理像素。图集与 SVG 泡泡由独立构建脚本生成，有原件、配方、来源和哈希记录。整个标题资源组合各规格不得超过 120 KiB。
