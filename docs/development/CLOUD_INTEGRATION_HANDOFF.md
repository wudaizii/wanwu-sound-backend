# 云端用量、作品事实与 AI 讲解：合并交接

本次交付给前端维护者及其 Claude Code。用户已同意在现有本地代码上改造、提交新分支，由前端维护者合并。本次没有部署，也没有修改生产配置、账号或用户数据。

## 先确认源码基线

原前端仓库为 [guohaha777/voice_atalas_v2](https://github.com/guohaha777/voice_atalas_v2)。本次核对时，公开 main 为 `35000af3005609b6b02356023dba680233d69cd8`。本地已有账号及云端创作适配器，来自本地 `codex/backend-v1` 的 `536cc4f`；这些功能中的账号接入是此前我们实施的内容。

线上另有后续 AI／音乐交互，其最新可编辑源码不在上述 main 或本次本地基线中。本分支没有改造那些拿不到源码的模块。请把本次适配合进你实际维护的最新前端，保留后续功能和视觉，不要整站用本分支覆盖线上。

交付分支：

- 前端：[codex/frontend-cloud-integration-20261124](https://github.com/wudaizii/wanwu-sound-backend/tree/codex/frontend-cloud-integration-20261124)。分支内仅有前端及共享包。原仓库拒绝当前 `wudaizii` 账号推送，GitHub 浏览器连接也未成功，故借个人仓库的独立分支传递，不是已创建的 fork。
- 后端配套：[codex/backend-cloud-ai-integration-20261124](https://github.com/wudaizii/wanwu-sound-backend/tree/codex/backend-cloud-ai-integration-20261124)。独立后端，不依赖 `apps/web`。

为控制历史图片传输量，交付分支以 `fd40eb1` 作为独立快照起点，其内容树与原 main `35000af` 完全相同，随后有两个增量提交：`0d3c2c5` 恢复已存在的本地账号／云端适配器，并整理为前端独立工作区；分支顶端提交提供本次用量／事实／讲解改造。`0d3c2c5` 的内容树也与原本地恢复提交 `3d4965a` 相同。原完整来源历史保留在本地 `codex/frontend-source-history-20261124`，没有删除旧分支或改原 main。

由于快照起点不携带原仓库的 Git 祖先，请按下面步骤在作者自己的集成分支 cherry-pick，再正常提交 PR／合并；不要直接 merge 整条交付历史。若实际最新前端已有账号和云端文件，优先只取顶端功能提交，按当前模块结构处理冲突，跳过恢复提交。

在**原前端的干净工作区**中取回分支，先检查差异，再选择合并方式：

```sh
git fetch https://github.com/wudaizii/wanwu-sound-backend.git \
  codex/frontend-cloud-integration-20261124:refs/remotes/wanwu-handoff/frontend-cloud-integration
git log --reverse --oneline refs/remotes/wanwu-handoff/frontend-cloud-integration
git diff --exit-code 35000af fd40eb1
git switch -c codex/merge-cloud-insights
```

如果当前前端已有账号／云端基线，只取本次顶端提交：

```sh
git cherry-pick refs/remotes/wanwu-handoff/frontend-cloud-integration
```

如果当前分支确实只有旧 main、需要恢复提交与本次增量，则审阅后依次取两个增量，跳过内容相同的根快照：

```sh
git cherry-pick 0d3c2c5 refs/remotes/wanwu-handoff/frontend-cloud-integration
```

两种方式选一种，不要重复执行。不得将这条前端交付分支合入后端 main；个人仓库只是代码传输位置。

**只取功能提交时还要检查依赖基线：** `0d3c2c5` 包含独立前端工作区和浏览器测试工具。如果你的较新前端尚无 `packages/audio-engine` workspace、`esbuild@0.28.2`、`playwright@1.64.1`，请先审阅恢复提交的 `package.json`／锁文件与 `apps/web/tests/browser/`，仅把缺少的工作区、开发依赖和独立浏览器助手合进当前配置，更新并提交你自己的锁文件。不要直接用旧锁文件覆盖新前端，也不要引入 `apps/api`／`apps/worker` 的测试导入。依赖添加可在前端根目录使用 `npm install --save-dev esbuild@0.28.2 playwright@1.64.1`；保留作者现有其他 workspace／依赖，使用 Node 24 完成下面的测试和构建。

## 实际改了什么

1. 登录后从后端读取账号音频空间预留、待处理声音和成品数，在老师工具栏显示。它是本项目的保守预留值，包含处理中预留，不是 OSS 账单或全站统计。失败显示不可用，编辑不受影响。
2. 草稿保存成功后，用明确的 `workId + revision` 获取服务端作品事实，同时核对 ETag。显示云端修订、声音出现次数与成品时长；不会把旧草稿覆盖本地未保存的修改。
3. 作品的“音乐小发现”可使用后端生成的匿名讲解简报。AI 请求只提交修订号和输入摘要；事实、时序、提示词及输出检查在后端完成。孩子给声音起的名字只在浏览器还原。
4. 编辑、切换账号和版本冲突立即使旧事实／AI 失效；排队但已取消的请求不会发出，迟到响应不显示。同一绑定的已成功讲解在当前页面复用，不重复计费调用。
5. 草稿保存失败、未完成上传或服务端版本冲突时，保留本地创作，继续使用本地语料并明确来源。不会把本地结果标成 AI 成功。

保留录音权限、原始 Blob、交互、即时试听、本地测量与语料降级。只是把云端事实与 AI 权威输入接回服务端，没有删除即时体验，也没有修改声音塑形、背景配方、乐器参数或既定视觉素材。发现计数函数从本地现有实现抽为共享函数，阈值和顺序不变。

## 接口约定与顺序

使用现有 `CookieAccountClient` 请求同源 `/api/v1`，保留 `credentials: same-origin`、HttpOnly Cookie、CSRF 和账号切换保护。不要改成跨域登录、localStorage token，或让页面读取云密钥。

| 步骤 | 请求 | 要点 |
| --- | --- | --- |
| 账号用量 | `GET /api/v1/account/usage` | 验证 `accounting: conservative-reservations`；账号变更丢弃旧响应 |
| 模型开放状态 | `GET /api/v1/guest/status` | 只读能力，不取密钥；未开放时使用本地语料 |
| 草稿事实 | `GET /api/v1/works/{id}/facts?revision=N` | 先成功保存；响应必须匹配作品、修订与 ETag |
| 云端讲解 | `POST /api/v1/works/{id}/talk` | body 只有 `{revision: N, inputDigest}`，两者来自已核对 facts |

写讲解请求还须有 `X-CSRF-Token`、`If-Account-Match` 和 `If-Match: workEtag(id, N)`。这些由账号适配器和共享契约生成，不手写 Cookie，不把姓名、录音、素材地址或完整 facts 放进请求。

讲解响应为 `{workId, revision, inputDigest, briefVersion, reply, model, promptVersion}`。`briefVersion` 为 `work-talk-brief-v1`，`reply` 为原来的 `WorkTalkReply`；前端再次匹配绑定并运行原有逐句检查，才显示 AI 来源。不要直接把旧 `/talk/work` 的平铺响应当成本接口响应。

配套后端允许对**当前已保存的草稿修订**读取 facts；指定其他修订时读取已冻结快照。没有对应旧快照返回 `409 version-conflict`，已有冻结快照的规则／渲染器版本不匹配也返回冲突。跨账号仍为 404；缺少 If-Match 为 428，不匹配为 412；模型关闭、限流或失败沿用既有错误约定。

## 文件与后续适配入口

| 文件 | 职责 |
| --- | --- |
| `apps/web/src/shared/cloud/cloudInsights.ts` | 用量、facts、绑定、取消、AI 缓存和迟到响应保护 |
| `apps/web/src/shared/cloud/cloudTalk.ts` | 现有 `TalkPolisher` 的云端适配器 |
| `apps/web/src/shared/cloud/CloudInsightsPanel.tsx` | 用量和云端修订展示 |
| `apps/web/src/shared/cloud/cloudWorkspace.ts` | 登录／保存／编辑触发与账号隔离 |
| `apps/web/src/shared/account/accountClient.ts` | 同源 Cookie 请求队列与 AbortSignal |
| `apps/web/src/pages/compose/model/useTalk.ts` | 订阅绑定，过期 AI 立即离开视图 |
| `packages/contracts/src/cloudStatus.ts` | 用量、facts、绑定讲解响应的可验证契约 |
| `packages/audio-engine/src/discoveries.ts` | 原有发现计数的共享实现 |

**给维护较新页面的 Claude Code：** 先找到其真实云端保存入口，把成功后的 workId／revision 接到这里；保留新页面外观，复用本次取消和版本绑定。不要从页面提交自己的 facts 冒充服务端结果。较新 `/discovery/work` 音频发现、教材特征／讲解、AI 背景等流程不属于本次本地旧模块接入，不应宣称它们都已改为快照驱动。当前基线的教材讲解仍保留已有本地语料。

共享包的新文件以此前端为源，同步到后端；后端已有较新契约和音乐代码，不能把本分支的整套旧 `packages/` 覆盖过去。本次只同步两个新源码文件及对应 export，另外 125 个共享文件的实现保持后端原版本。未来先合到实际最新共享包，再 dry-run 同步并检查指纹；不得回退后端新契约。

## 验证记录与复现

```sh
npm ci
npm test
npm run build
npm run test:ui
```

本次前端 170 项既有测试、9 项新增契约／并发测试通过；构建的类型、资源、样式检查通过。Playwright 检查首页、声音诞生、声场、成曲和书架在 390／700／701／900／901／1440px 的 30 个组合，全部通过。浏览器测试需安装锁定版本 Chromium（`npx playwright install chromium`）；本机缺少该浏览器时，Mac 测试助手可使用已装 Chrome，报告须保留真实版本。

配套后端本机 `npm test` 199 项、`npm run build`、独立 PostgreSQL 的 `npm run test:api` 18 项通过。跨仓库真实浏览器联调由后端测试入口读取显式指定的前端构建：

```sh
# 在后端配套分支根目录；指向你刚构建的独立前端
WANWU_FRONTEND_DIST=/absolute/path/to/frontend/apps/web/dist npm run test:frontend
```

该命令只创建本机临时 PostgreSQL、HTTPS 测试入口和合成音频，不加载生产环境文件。5 个场景通过：真实 Cookie 登录与用量、打开指定草稿与绑定讲解、编辑后丢弃迟到 AI、窄屏及临界宽度、退出／换账号后清除私有事实。测试模型是确定性替身，付费模型调用为 0；音频预置为已处理的合成文件，本测试不声称覆盖 FFmpeg 全链路或新音乐听感。

没有执行真实手机录音、真实弱网、多浏览器、线上 H5 或真实模型语义验收。合并后先部署后端配套，再联调最新前端；生产发布由双方另行安排，不凭这些本机记录自动发布。
