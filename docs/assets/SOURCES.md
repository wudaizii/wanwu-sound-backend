# 首页定稿 V1声音来源与修改记录

这份记录随预览和声音文件一同保留。声音点击后加载，无背景自动播放。所有交付片段均转为单声道 32 kHz / MP3 48 kbps，做短淡入淡出和响度处理，具体来源与授权如下。

| 文件 | 内容、来源与作者 | 许可 | 本次修改 |
| --- | --- | --- | --- |
| `bird.mp3` | 鸟鸣，沿用旧 demo 的 `forest-bird.mp3` | 用户提供；旧项目 [旧授权记录](legacy-audio-authorization.md) 记录用户于 2026-08-10 授权公开使用。非公共领域或 CC 声明。 | 从第 8 秒截取 3.2 秒，转码、淡入淡出、响度处理 |
| `leaves.mp3` | 风与树叶环境声，沿用旧 demo 的 `wind.mp3` | 同上 | 从第 6 秒截取 2.8 秒，转码、淡入淡出、响度处理 |
| `frog.mp3` | [Single Frog Croak](https://commons.wikimedia.org/wiki/File:Single_Frog_Croak.oga)，MichaeltheFox8621 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)，修改片段沿用此许可 | 从第 0.4 秒截取 3.2 秒，转码、淡入淡出、响度处理 |
| `cicada.mp3` | [Chorus Cicada singing](https://commons.wikimedia.org/wiki/File:Chorus_Cicada_singing.ogg)，Siobhan Leachman / Ambrosia10 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 从第 5 秒截取 3.2 秒，转码、淡入淡出、响度处理 |
| `drop.mp3` | [Water drops dripping](https://commons.wikimedia.org/wiki/File:Water_drops_dripping.ogg)，ZooFari | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)，修改片段沿用此许可 | 从第 3 秒截取 2.8 秒，转码、淡入淡出、响度处理 |

水滴来源为室内水滴落入容器的录音，交互提示标为“滴水声”。松鼠使用树叶环境声，没有将其标为松鼠叫声。蜗牛只做动作，不配虚构叫声。

## 声音库示例声音（2026-10-24）

声音诞生、万物声场、万物成曲用到的示例声音来自 `docs/assets/library-recipe.json`：**整段原件**只转为单声道 32 kHz / MP3 48 kbps，不截取、不淡入淡出、不改响度，节选由孩子在页面里自己做（超过 45 秒的鸟鸣在声音诞生里会弹出选段框）。首页角色点击用的仍是上面的短片段，两套互不影响。

| id | 原件 | 名称 | 作者 / 许可 |
| --- | --- | --- | --- |
| `bird` | `bird.mp3`（约 59 秒） | 鸟鸣 | 用户提供，2026-08-10 授权公开使用 |
| `frog` | `frog.oga` | 蛙鸣 | MichaeltheFox8621，CC BY-SA 4.0 |
| `cicada` | `cicada.ogg` | 蝉鸣 | Siobhan Leachman / Ambrosia10，CC0 1.0 |
| `drop` | `drop.ogg` | 滴水声 | ZooFari，CC BY-SA 3.0 |
| `leaves` | `leaves.mp3` | 风吹树叶 | 用户提供，2026-08-10 授权公开使用 |
| `cow` | `cow.mp3` | 牛叫 | 用户提供（旧 demo `voicedemo`），2026-08-10 授权公开使用，见 [旧授权记录](legacy-audio-authorization.md) |
| `apple` | `falling apple.mp3` | 苹果落地 | 同上 |
| `bicycle` | `bicycle.mp3` | 自行车 | 同上 |

交付文件、原件的 SHA-256 与字节数记录在 [library-release-manifest.json](library-release-manifest.json)，`npm run check:assets` 会核对；原件变了而没重新生成会报错。

**新增一段示例声音**：① 确认来源和许可；② 把原件放进 `assets-source/audio/`；③ 在 `library-recipe.json` 的 `sounds` 里加一条（id、文件、名称、作者、许可，五项预设可选）；④ 运行 `npm run assets:library`（需要本机有 ffmpeg）；⑤ 在本文件和公开的 `legal/sound-sources.html` 补上来源。页面代码不用改。

公开来源原文件保存在 `assets-source/audio/home/`。原件和交付文件的 SHA-256 见 [audio-provenance.json](audio-provenance.json)。CC BY-SA 对相应改编声音文件继续适用，不表示整个程序改用该许可。

## 图片

13 张 PNG 为本次调用内置 imagegen、以用户确认的 V12 视觉为参考重新生成的分层资产，保留原文件于 `assets-source/home/`。不是从 V12 无损抠出的原图层；不能承诺角色与原图逐像素一致。完整生成及修正提示词已移入项目外的视觉档案：`万物声谱_视觉过程稿/资产生成记录/imagegen-prompts.json`。该档案仅用于过程溯源，不是构建依赖。

网页衍生版本仅作透明边界裁紧、尺寸缩小与 WebP / PNG 压缩，没有人工绘制或遮罩去底。所有 PNG 原件均具有 alpha 通道；部分纸贴边缘有浅色柔边，需结合最终白底画面审美验收。

正式网页文件使用内容哈希命名；逻辑声音名与网页文件路径见 `apps/web/src/shared/scene/home-assets.generated.json`。该目录仅归档旧记录中的鸟鸣和风声来源，未引入旧项目其他素材。

## 2026-10-22 五官修订

使用内置 imagegen 对现有透明 PNG 做局部编辑：蝉的嘴移至头部前缘；蜗牛移除面部重复眼睛，仅保留触角眼。修订前原件及完整两条编辑提示词保存在项目外 `万物声谱_视觉过程稿/资产修订/2026-10-22-五官与落点修订/`。正式原件仍在 `assets-source/home/characters/`，已同步源文件 SHA-256、裁切配方和全部网页衍生图。松鼠及其他角色原图未重绘，落点通过场景组合坐标修正。

## 2026-10-22 黑色手绘标题 · 当前 v2

用户确认的草稿图为 `exec-cdb46959-b19e-4065-95c2-46162af1886e.png`。使用内置 imagegen 生成独立字形图集 `assets-source/home/title/lettering-atlas.png` 及手绘装饰图集 `doodles-atlas.png`；提示词和最新决策见 `title-generation.json`。不使用外链字体。

字形及音符保留透明位图纹理，按配方提取、缩放、压缩为 WebP / PNG 图集；简单泡泡由 `scripts/lib/trace-bubbles.mjs` 沿生成素材的不规则轮廓提取原生 SVG，文件未嵌入 PNG。公开资源哈希见 `title-release-manifest.json`，原件哈希见 `source-manifest.json`。字的浅弧排布、比例和独立入场动作在 `config/title.ts` 中配置。

v1 的整句标题原件和旧生成记录保存在项目外 `万物声谱_视觉过程稿/资产修订/2026-10-22-手绘标题弧度与动效/`。v1 遮罩和代码图案已由当前实现替代；字体入场后静止，只循环播放后方装饰上升淡出。
# 2026-10-22 · 后续页面透明源素材整理

用户确认四步页面设计，并重新指定首页入口弹窗使用原 A 版。页面参考单独归档至项目外 `万物声谱_视觉过程稿/定稿页面参考/2026-10-22-四步流程/`，不进入 public。

新增 6 张弹窗透明 PNG、4 张无编号通用声音标记及 1 张标记图集母版，均以已确认生成图为参考，由内置 imagegen 透明分离 / 边缘补全。不是逐像素无损抠图。图集只做无损整格切片；未改旧原件、未生成或发布网页衍生图。

用途与复用边界见 `approved-ui-assets.md`，完整生成提示词、参考图来源、原文件路径、尺寸、透明检查与哈希见 `approved-ui-assets-manifest.json`。所有新 PNG 已加入 `source-manifest.json`。当前应用源码和资源构建脚本未修改。

## 2026-10-22 开始方式弹窗 · 网页衍生图

上述弹窗 6 张透明 PNG 仅做透明边界裁紧、等比缩小与 WebP / 调色板 PNG 压缩，未重绘。2026-10-23 开始方式弹窗删除：网页衍生图（`public/media/start/`）、配方与发布清单已移除；6 张原件仍留在 `assets-source/start/` 备查。
