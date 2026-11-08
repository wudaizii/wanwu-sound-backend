# 前后端职责边界与接入增量

2026-11-08。本轮只改独立后端仓库并本机验证，未修改／发布前端。实施阶段未提交／推送或部署；随后用户已授权发布，当前部署门槛见 [发布记录](../docs/RELEASE_2026-11-08.md)。本文供维护者和 Claude Code 使用，不是供其他接手者直接执行生产操作的授权。

## 已确定的分工

前端在 `guohaha777/voice_atalas_v2`，由原作者维护。后端为本仓库的 `apps/api`、`apps/worker` 和独立 PostgreSQL。两端独立构建／发布；即使同一台 ECS、同一个 HTTPS 域名，也仍是前后端分离。暂不拆成微服务、不新增 Redis／Supabase，不把 H5 再搬回旧 Next.js demo。

| 留在前端 | 归后端 | 共用且版本锁定 |
| --- | --- | --- |
| 录音权限、原始 Blob、编辑交互、即时试听、取消操作、本地暂存、冲突时保留本地修改 | 身份与权限、归属、最终音频校验／体检、元数据持久化、成品任务、预算、存储额度、AI 提示与输出校验、入库／发布确认记录 | 契约、五维塑形、背景及混音算法、乐器参数、提示验收语料 |

浏览器测量与参数检查是即时反馈，不是授权依据。服务端保存作品时已用数据库中处理完成的真实音源体检覆盖客户端的 `analysis`；成品只读冻结快照。不要删除前端本地检查／试听去制造网络依赖，也不要把老师试听确认改成自动审核。

共用包仍在前端修改、后端按明确版本同步；本轮 125 个文件指纹不改。不要为这轮接入在两边分别复制／重写音乐算法。

## 既有页面不需要改动的后端增量

- Cookie／CSRF 和已有 API 请求／响应继续兼容，没有新身份头。
- 内置 AI 调用限额、全局调用并发和后台任务状态进入 PG；新增 `ai-background` 队列，不占媒体队列。
- `POST /backgrounds` 仍返回 `202 {jobId}`，GET 仍为 pending／ready／unavailable。任务现在绑定创建者的**服务端会话**，另一个会话查询同一 ID 返回 404；登录／登出更换会话后应重建请求，不能复用前一身份任务。
- 同一会话、相同输入／模型／尝试次数 10 分钟内去重；“换一首”继续递增 attempt。已发出但结果未知的计费调用不自动重放；自带密钥不持久化，重启后不会恢复其请求。
- 云存储／媒体任务配额不足返回既有错误 `413 too-large` 或 `429 rate-limited`，不会假保存成功。未来前端可细化说明，但不要自动清空本地作品。
- AI 发现增加时间证据检查：无法支持“结尾”等事实时，允许一次剩余预算内修复，否则保留其他合格条目／返回失败，由既有本地降级接管；不能将本地结果标成“AI 已听过”。

## 新增可接入接口（当前页面尚未接入）

### GET /api/v1/works/{workId}/facts?revision=N

需正常 Cookie 登录，沿用 `If-Account-Match`；只能访问自己未删除的作品。revision 缺省表示当前草稿，指定时表示该修订的已存快照，不会自动选择账号唯一草稿。

主要返回：`version: wanwu-facts-v1`、`provenance: server-work`、`workId`、`revision`、`rules`、`renderer`、`inputDigest`、`fieldSeconds`、`seconds`、`cutSeconds`、`events`、`background`，并有该作品修订的 ETag。

每个 event 为 `{eventId, token, start, end, seconds, clip, chosen, measured}`。token 是按首次出现顺序的“声音1”等；没有孩子昵称、素材名、采集地点、OSS 地址或密钥。chosen 仍是孩子选择的原值，measured 来自已保存的服务端体检；时间沿用当前共享音频引擎，不另定一套截尾规则。

接入顺序：先等待当前草稿成功保存 → 用其修订获取 facts → 校验响应 `workId/revision` 是否仍是当前编辑版本 → 使用派生数据；用户继续编辑时丢弃旧结果。不要把服务器的旧草稿反向覆盖浏览器尚未保存的创作。旧快照／规则迁移另作设计，不无提示地重算音乐。

已冻结修订的音乐规则／渲染器版本与当前不一致时，此 facts 接口返回 `409 version-conflict`，不拿新规则假装描述旧成品；旧成品的既有播放接口不因此改变。

**边界**：本接口是可信的作品事实读取入口，不是已经完成的“所有 AI 请求自动绑定云端快照”。现有匿名 `/discovery/work`／`talk/work` 请求仍是临时浏览器简报，只能做格式与内部一致性检查，不得将其内容写成云端真相。下一次前端改造如需云端事实驱动 AI，应先约定 workId＋revision 的专用生成接口；不得在旧请求上偷偷改用可能过期的服务端草稿。

### GET /api/v1/account/usage

需正常会话。返回当前账号 `reservedBytes`、`pendingSources`、`pendingRenders`、`limits`、`accounting: conservative-reservations`。是本项目保守预留值，不是 OSS 账单，也不是全站用户统计。删除库条目不一定立即减额度：作品／快照／备份保护／清理宽限期仍可能引用音频。

## 验证与交付要求

后端先跑 `npm test`、`npm run build`、`test:api`、`test:p1`、`test:operations`、`test:gateway`；镜像按发布脚本构建、烟测。前端未来仅接新接口时跑自己的类型、页面、冲突与异常路径测试，不重做视觉。

正式入口为 `https://wanwu.proterm.ink` 同源 `/api/v1`。外部 API 域名仍为 `wanwu-api.proterm.ink`，但不要把浏览器登录改成跨域 fetch 或 localStorage token。OSS 私有直传／短期播放，PG 存账号、作品和状态；三者职责不混淆。

交付记录必须区分“代码存在、测试通过、镜像构建、线上部署、真人完整闭环”。下一位 AI 不得仅凭本地测试或 GitHub 有代码就标为已上线；具体验证与未执行项见 [P1 修复记录](../docs/P1_HARDENING.md)。
