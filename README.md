# 万物声谱 · 正式 H5 前端

正式项目根目录，与比赛 demo、旧 `wanwu-shengpu` 工程分开。现在完成：首页、声音诞生、万物声场、万物成曲、作品书架（前端 + mock），以及声音规则、提示词和语料。仓库 `guohaha777/voice_atalas_v2`，推送到 `v2` 会更新 Netlify 线上。

- 协作约定：[AGENTS.md](AGENTS.md)
- 新对话接续：[当前交接 HANDOFF5](../万物声谱_视觉过程稿/handoff/HANDOFF5.md)（项目外）
- 谁控制什么（规则 · 语料 · 提示词 · 模型）：[control-map](docs/development/control-map.md)
- 模块边界和以后怎么接后端：[architecture](docs/development/architecture.md)

## 本机运行

需要 Node.js ≥ 22.22，建议使用 Node 24。

```sh
npm ci
npm run dev
```

打开 http://127.0.0.1:5290/。`npm run build` 生成 `apps/web/dist/`；`npm run preview` 在 http://127.0.0.1:5291/ 验收构建产物。调音台 `/lab/sound-rules` 和提示词台 `/lab/prompts` 只在开发或 `VITE_ENABLE_LAB=1` 的预览构建里有。

## 文件怎么分

| 目录 | 内容 | 进入网页构建 |
| --- | --- | --- |
| `apps/web/src/` | React + TypeScript 前端：页面、组件、交互、端口（`app/services.ts` 选择每个接口的实现） | 是 |
| `apps/web/src/mocks/` | 接后端前的内存替身，接后端时整体删除 | 是（临时） |
| `apps/web/public/media/` | 首页图、声音标记、首页短音效、声音库示例录音的压缩衍生件 | 是 |
| `apps/web/public/legal/` | 公开的声音来源与许可 | 是 |
| `packages/contracts/` | 前后端共用的数据契约 | 是，按需 |
| `packages/sound-rules/` | 声音体检、塑形、本地背景、混音、课本匹配；数值在 `rules/*.json` | 是，按需 |
| `packages/prompts/` | 语料 `corpus/`（网页用）和提示词 `prompts/`（服务端用，不进网页） | 语料是 |
| `assets-source/` | 首页、声音标记的透明 PNG 原件，原始授权录音，测试声音集 | 否 |
| `scripts/` | 资源重建、预算、样式结构检查 | 否 |
| `docs/development/` | 现行说明：模块边界、页面状态、部署、控制关系 | 否 |
| `docs/assets/` | 来源、许可、压缩配方、资源哈希清单 | 否 |

不参与运行的资料都放在项目外的相邻目录 [万物声谱_视觉过程稿](../万物声谱_视觉过程稿/README.md)，正式项目不依赖它：开发交接 `handoff/`（当前一份 + `history/`）、验收和调整记录 `records/`、需求原文快照 `product/`、视觉过程稿、定稿参考、生成记录、验收截图和已停用功能的原件。

`node_modules/`、`apps/web/dist/` 可重新生成。Git 纳入源码、锁文件、原件、公开压缩资源和必要文档，忽略依赖、构建产物、环境密钥和临时文件。

## 检查与资源更新

```sh
npm test                # 全部测试，必须全过
npm run build           # 类型检查 + 资源检查 + 样式结构检查（单文件 ≤ 220 行）+ 构建
# 仅在替换原件、修改压缩配方后执行：
npm run assets:build
# 只更新声音库示例声音（新增 / 替换原件后；需要 ffmpeg）：
npm run assets:library
```

`check:assets` 校验资源实际字节和 SHA-256，阻止原件、文档和源录音进入公开目录。重建工具只读取项目内已归档资源。

## 首页

- `pages/home/components/` 场景、导航、主文案；`config/` 资源清单、透明度、动画参数（改视觉优先在这里）；`model/` 开场和角色点击。
- 草木透明度和开场参数在 `pages/home/config/scene.ts`，角色动作在 `config/motions.ts`，手机 / 平板定位在 `HomePage.module.css`。图片裁切、尺寸和基准坐标改 `docs/assets/build-recipe.json` 后执行 `npm run assets:build`，不要手改 `shared/scene/home-assets.generated.json`。
- 视觉基准：白底、中轴黑体、左下重右下轻的纸贴景色；草木不透明度左上 32%、右上树冠 46%、左侧中景 56%、右下 58%、左下近景 75%，开场近景 94%。
- 约 1.5 秒开场，等待资源超过 1800 ms 直接静态展示；减少动态、弱设备和返回访问跳过自动开场。手绘标题在丛林结束后约 1.45 秒逐字轻弹入场，之后只有音符和泡泡循环。
- 首页导航：作品书架 · 登陆 · API 输入。“开始成曲”直接进入声音诞生。

页面逐页状态见 [pages](docs/development/pages.md)，验收细节见项目外的 `万物声谱_视觉过程稿/records/`，素材来源见 [SOURCES](docs/assets/SOURCES.md)。
