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

管理员现已通过手动 root 命令接管发布准备：修正版镜像已导入，真实加密备份和独立本机恢复已通过（16 个 OSS 对象实字节校验），普通 SSH 权限不变。业务容器尚未替换，生产迁移、Nginx、timer 和管理员配置仍待执行；详见 [发布记录](docs/RELEASE_2026-11-08.md)。下文早期权限门槛属于历史检查。

P1 加固与职责分离见 [P1 修复记录](docs/P1_HARDENING.md) 和 [人／AI 对接说明](handoff/BACKEND_BOUNDARY.md)。本轮新增持久 AI 预算／任务、事实检查、统一网关配置、运行监测、存储对账和账号配额；保持前端接口兼容，未改前端源码，新事实／额度接口仍待前端以后接入。发布分支为 `codex/p0-backend-hardening`；本机验收和 ECS 部署门槛见 [2026-11-08 发布记录](docs/RELEASE_2026-11-08.md)。提交／推送不代表已部署。

2026-11-08 的 P0 加固、验证方式和生产待办见 [P0 修复记录](docs/P0_HARDENING.md)。实施阶段按用户要求只改后端、只做本机验证。随后用户授权提交、推送和部署；本次核查发现现有 SSH 没有 Docker／sudo 管理权限，尚未更新 ECS、创建生产账号或启用生产定时任务。下面的 2026-10-29 状态为历史记录，不代表当前线上状态。

截至 2026-10-29：核心业务代码已有，原单仓库的本机前后端闭环曾验证通过；ECS 已运行此前构建的 API、独立 PostgreSQL 和音频任务，真实 OSS 音源处理、单次备份／恢复也有记录。

**截至该历史日期，真实前端全链路联调未完成、生产登录关闭。** 2026-11-08 的线上只读检查已看到正式站点同源 API 正常、未登录 `/auth/me` 返回 401，但这不证明生产管理员或登录创作全链路已经验收。当前 P0 加固构建尚未部署；推送也不等于上线。旧验收记录见 [验收状态](docs/STATUS.md)。

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
