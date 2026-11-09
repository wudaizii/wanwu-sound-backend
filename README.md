# 万物声谱 · 后端

这是后端维护仓库，不是新的前端站点。前端由原作者维护，后端由 wudaizii 维护。

- 前端仓库：[guohaha777/voice_atalas_v2](https://github.com/guohaha777/voice_atalas_v2)
- 前端正式站点：[wanwu.proterm.ink](https://wanwu.proterm.ink)
- 后端接口入口：[wanwu-api.proterm.ink/api/v1/health](https://wanwu-api.proterm.ink/api/v1/health)
- 本仓库：[wudaizii/wanwu-sound-backend](https://github.com/wudaizii/wanwu-sound-backend)

## 明天接手先看这里

1. 人先读 [交接总览](handoff/START_HERE.md)，分清谁负责哪些配置。
2. 前端接入包已在前端提交 `2823401`（分支 `integrate/wanwu-backend-v1`）合入；正式域名、同源代理与联调见 [前端接入](handoff/FRONTEND.md)。
3. 负责后端的开发者读 [配置表](docs/CONFIGURATION.md)、[运维边界](docs/OPERATIONS.md)、[验收状态](docs/STATUS.md)。

需要查接口时先读 [接口速查](docs/API_QUICKSTART.md)，再按链接查完整协议与实际契约。

根目录 `CLAUDE.md` 是 AI 入口，`AGENTS.md` 是项目边界。共享包指纹、命令和验收标准都在仓库内；不依赖聊天记录或这台 Mac 的私密配置。

## 现在做到哪了

北京时间 2026-11-09：P0/P1 后端已按授权部署到 ECS，两个 HTTPS 入口均核对到运行提交 `c05580e4a179`，数据库已应用 9 条迁移。API／媒体进程、两个任务队列、Chromium 沙箱、统一 Nginx 限额、定时维护、真实备份恢复及历史镜像回滚均已有本批次证据，详见 [当前生产交接](docs/PRODUCTION_2026-11-09.md)。前端代码及页面文件未改。

首个网站管理员 `wudaizii` 已按用户单独授权创建。正式 HTTPS／私有 OSS 的后台链路已通过：登录、上传与处理、个人／共享素材确认、多草稿与冲突、成品生成、匿名分享及撤销。验收发现并修复了 API 压缩改写 ETag、导致合法保存失败的问题；前端静态资源压缩保留。每日备份已有实际自动触发，含管理员的新备份也已独立恢复并校验密码。真实浏览器页面、邀请码成功注册、手机和音乐听感仍待协作验收，不能用后台接口通过代替这些项目。

P1 加固与职责分离见 [P1 修复记录](docs/P1_HARDENING.md) 和 [人／AI 对接说明](handoff/BACKEND_BOUNDARY.md)。新 facts／额度接口仍待前端以后接入。代码及本批部署记录在 `codex/p0-backend-hardening` 分支；应用镜像固定为 `c05580e4a179`，后续网关配置修订单独记录，不把它冒称为新应用镜像。普通 `ecs-dev` 权限未提升，发布使用另获用户授权的管理入口。

2026-10-29 的旧验收及 2026-11-08 的准备记录仍保留其日期和范围，不代表当前部署状态；入口见 [验收状态](docs/STATUS.md)、[发布准备记录](docs/RELEASE_2026-11-08.md)。Git 推送本身仍不会自动部署 ECS。

## 仓库里有什么

| 目录 | 用途 |
| --- | --- |
| `apps/api` | Fastify 业务接口、账号／会话、数据库迁移、私有 OSS、管理与备份命令 |
| `apps/worker` | 音源校验、FFmpeg、Chromium 沙箱离线混音与队列 |
| `packages` | 前后端共用契约、声音规则、Web Audio 算法；从前端同步，逐文件指纹在 `handoff/manifest.json` |
| `data/catalogue` | 后端自己的内置示例目录、试听衍生件和来源记录；不再读取前端目录 |
| `assets-source/audio` | 8 份已有公开使用记录的示例原件，不是用户上传的录音 |
| `deploy` | 隔离容器、Compose、Nginx 与最小权限配置示例，不含真实密钥 |
| `handoff` | 交接总览、共享包指纹清单、前端发布与联调步骤、验收清单 |
| `scripts` | 同步与核对共享包、探测入口、构建镜像、独立本机测试等工具 |

## 后端本机检查

需要 Node.js 24.21 或更新的兼容版本。先做无需生产账号的检查：

```sh
npm ci
npm test
npm run build
```

`build` 检查类型、内置素材和共享包指纹（`check:shared`）；Node 24 直接执行 TypeScript，不生成前端页面。运行 API 还需要独立 PostgreSQL、私密环境配置；不能直接拿生产库跑测试。新环境准备步骤见 [配置表](docs/CONFIGURATION.md)。

可选检查：`npm run test:media`、`npm run test:api`、`npm run test:worker:runtime`、`npm run test:operations`、`npm run test:p1`、`npm run test:gateway`。后几项需要本机 Linux Docker；缺环境时记录未验证，不去共享 ECS 压测。

## 前端对接不需要云密钥

前端接入补丁已在前端提交 `2823401` 原样合入（2026-10-31 核对：91 个文件逐一与补丁预期相同），补丁和应用工具已从本仓库删除，原文见提交 `4c6a996`。

之后共用包只在前端改，再同步到本仓库（先 `--dry-run` 看差异），然后 `npm run build` 核对指纹：

```sh
node scripts/sync-shared.mjs /absolute/path/to/voice_atalas_v2
```

同步只复制 `packages/` 下五个共用包并更新指纹，不提交、不推送、不发布。正式 H5 发布与联调见 [前端接入](handoff/FRONTEND.md)。

发布前端以后，可运行只读探测：

```sh
node scripts/probe-deployment.mjs
```

HTTP 200 的 HTML 不算接口成功；`503 not-open` 表示后端尚未开放登录，需要后端维护者处理，不是让前端伪造身份。

## 安全与来源

不把 AccessKey、数据库密码、会话密钥、备份私钥、真实用户录音或带签名的播放地址提交到本仓库，也不发给前端或写进 Issue。

本仓库从现有开发快照整理，保留 [代码来源](PROVENANCE.md) 和 [音频来源／许可](data/catalogue/SOURCES.md)，没有擅自为全部代码新增开源许可证。
