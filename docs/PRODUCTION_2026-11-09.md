# 2026-11-09 生产部署与接手说明

本批已按用户授权更新 ECS 的万物声谱后端。前端源码、页面产物及旧 ProTerm／Supabase 未修改。生产仍为 **0 账号、0 管理员**；基础设施部署完成不代表老师登录后的完整业务已验收。

本文日期均为北京时间。它记录本次实际操作，不向其他开发者或 AI 授予新的生产权限。

## 运行版本与数据路径

| 项目 | 当前状态 |
| --- | --- |
| 正式 H5 | `https://wanwu.proterm.ink`，继续使用原页面产物 |
| 浏览器 API | 正式 H5 的同源 `/api/v1`，Nginx 转发本机 API |
| 独立 API | `https://wanwu-api.proterm.ink/api/v1` |
| 运行提交 | `c05580e4a17907a78f755eca26ef2d391212dc94`，`dirty=false` |
| 运行源码摘要 | `a2995f77c628cd638a96c991aaf232e9527c6eb1db76fb221184f0ed39ee17c9`，315 个构建／运行文件 |
| 发布 ID | `c05580e4a179-a2995f77c628` |
| 代码／本批交接分支 | `codex/p0-backend-hardening`；文档提交可晚于镜像内置提交 |
| 数据库 | 独立 PostgreSQL 17.11；已有命名卷／容器未替换、未发布宿主端口；0001–0009 指纹一致 |
| 认证 | 保持原有 `session`；未创建账号、重置密码或修改既有模型设置／凭据 |
| 容器限制 | API 0.25 CPU／256 MiB，媒体 0.5 CPU／1 GiB，PG 0.25 CPU／512 MiB；原有 PID、只读根、能力限制及日志上限保留 |

账号／Argon2 密码散列／邀请／会话、作品与快照、素材归属／确认、任务、文件登记和备份保护关系在 PostgreSQL。原始音频、播放衍生件、成品和加密数据库备份在私有 OSS。Docker 业务容器可更换，数据库依靠命名卷持久化，不把所有业务 JSON 放到 OSS。

登录链路为 H5 → 同源 Nginx → API → PostgreSQL 会话。Cookie 为 `__Host-wanwu`，Secure、HttpOnly、SameSite=Lax、Path=/、无 Domain；写操作要求来源与 CSRF。音频在取得服务端限定授权后直传 OSS；媒体和 AI 分别使用 `media` 与 `ai-background` 队列。

既有正式配置在 root 保护的 `/etc/wanwu-sound`，应用仍属于 `/srv/wudaizii/wanwu-sound` 和 Compose 项目 `wanwu-sound`。本次用户另行授权了专用管理员 SSH 入口；普通 `ecs-dev` 仍是无 Docker socket 权限的普通账号。私钥不在仓库、镜像或服务器中。

## 本批实际通过的检查

| 检查 | 本批证据与边界 |
| --- | --- |
| 配置与发布一致性 | 新旧有效环境在服务器内比较，包含镜像默认值；账号、模型、数据库凭据保持一致。两个公开 version 均返回上述提交和摘要 |
| 数据库基础 | 9 条迁移、专属库／owner、应用角色无继承和高权限、敏感表列授权通过；审计的唯一 attention 为没有管理员 |
| 队列与进程 | 显式安装／核对两个 pg-boss 队列；新版 API 的 AI 心跳与媒体心跳均新鲜 |
| Chromium 沙箱 | 在实际媒体容器中以 UID 1000 启动 Chromium，版本 `156.0.8078.4`，Linux sandbox verified；未放宽资源或隔离 |
| 网关和匿名安全 | 两个 HTTPS host 共用 routes／proxy；23 项真实探测通过，含版本、伪造身份拒绝、Cookie／CSRF、四类请求限额及正式 Origin 的 OSS PUT 预检 |
| 网关变更 | 全量 `nginx -t` 后平滑 reload，保留证书、H5 静态路由／目录；H5 HTML 前后摘要相同。H5 访问日志采用不含 URI、query、Cookie 的格式 |
| 私有文件对账 | 当前 16 个活跃登记对象全部 present，无 missing／invalid／unavailable／未登记项 |
| 新备份与回收 | 加密备份 116,280 字节，上传核对成功、保护 16 个媒体对象；过期备份删除 0、本次音频清理删除 0 |
| 升级后实际恢复 | 从 OSS 取回上述密文，在本机独立空 PG 库解密恢复，核对 9 条迁移及 16 个真实音频 SHA-256；临时资源已清理，未向生产执行恢复 |
| 历史镜像回滚 | 在 0 账号、无待处理任务时实际启动原 API／媒体镜像，API 健康及媒体启动后的新心跳通过；随后恢复本批新版。数据库容器不变，保留新迁移及维护工具，未运行旧清理器 |
| 运维健康 | status 为 pass，队列无积压、两心跳新鲜，备份／清理／对账均成功、文件无陈旧项，未执行付费 AI 调用 |
| 共享旧站 | 升级前后及回滚期间 `https://proterm.ink/` 均为 200；未操作其业务容器、数据库、密钥或证书 |

回滚证明的是本次空闲条件下历史进程可在新结构上重新启动；不是旧版所有业务／音频场景的兼容承诺。线上沙箱启动也不替代完整成品听感验收。匿名探测未创建账号、上传音频、生成作品或调用付费模型。

本机仍保留 189 项单测、build、独立 Linux 发布烟测的既有记录，详见 [构建准备](RELEASE_2026-11-08.md)。本次只更新交接文档，315 个运行／构建文件仍逐一匹配已部署清单。

## 定时维护现在怎样运行

专用维护入口为 root 持有的 `/usr/local/sbin/wanwu-maintenance`，固定读取 `/etc/wanwu-sound/maintenance`，调用摘要锁定的非 root ops 容器；不需要宿主 Node、不授予普通开发账号 sudo 或 Docker 权限。配置和秘密均为 0600，公开加密公钥为 0644 只读挂载，备份私钥不上 ECS。

| 定时器 | 频率 | 本次观察 |
| --- | --- | --- |
| `wanwu-backup.timer` | 每日约 04:00–04:02 北京时间 | 已启用，手动调用对应 service 已成功；首次日历触发计划为 2026-11-09 04:01:34，发布记录时尚未发生 |
| `wanwu-cleanup.timer` | 每小时 | 已启用，已自动触发且维护成功 |
| `wanwu-storage.timer` | 每 15 分钟 | 已启用，已自动触发且 16 个对象全部核对成功 |
| `wanwu-health.timer` | 每 5 分钟 | 已启用，已自动触发且 pass |

每日 timer 的首次和后续跨日执行仍需观察，不将一次手动成功写成每天均已执行。失败会在 systemd／journal 中体现，尚未配置手机、短信或邮件推送。RPO 24 小时／RTO 4 小时是运行目标，本次恢复不是长期可用性保证。

获授权的维护者可只读检查：

```sh
systemctl list-timers --all 'wanwu-*' --no-pager
systemctl show wanwu-backup.service wanwu-cleanup.service wanwu-storage.service wanwu-health.service --property=Id,Result,ExecMainStatus
/usr/local/sbin/wanwu-maintenance status </dev/null
/usr/local/sbin/wanwu-maintenance foundation </dev/null
```

foundation 因 `administratorPresent=false` 返回 attention／非零目前符合事实；不要为了让报告变绿自行创建账号或改密。status 检查的是运行健康，管理员配置另行处理。

只删除了本次 incoming 目录内已与正式归档逐字节 SHA-256 核对的重复镜像包，回收 778,207,744 字节，磁盘约剩 9.2 GiB。root 保护的正式归档及历史／当前 Docker 镜像均保留，没有 Docker 全局 prune。

## 下一位人或 AI 应该做什么

1. 核实自己读的是本批分支和本文；先查两入口的 `/api/v1/version`，不把早期“未部署”记录当作当前事实。
2. 由负责人单独授权首个管理员的登录名及创建操作。使用受保护 stdin 的 `admin-cli.ts`，密码不放命令参数、聊天、Git 或交接包；不重跑 `db:bootstrap`、不旋转既有数据库／模型密钥。
3. 从真实 H5 完成 [验收清单](../handoff/ACCEPTANCE.md)：邀请注册／登录、改密／恢复／停用、原件直传、草稿与冲突、入库确认、异步成品、匿名分享／撤销。当前只有匿名入口及基础设施生产证据，没有认证后的整条业务证据。
4. 前端维护者确认当前页面的源码提交，按需接 `/works/{id}/facts`、`/account/usage`；本轮未替前端改 UI。参考 [职责边界](../handoff/BACKEND_BOUNDARY.md)。音乐和手机／弱网验收仍由相应协作者参与。
5. 观察每日备份首次自动触发与持续覆盖；后续再安排带受控老师数据的恢复演练和外部告警，不把本次 0 账号／0 作品恢复当作这些检查已完成。

后续回滚只切换 Wanwu API／媒体，保留新数据库迁移和识别备份保护的新维护工具。生产有 AI／媒体任务时先安排停止新提交和排空；本次空闲演练不能直接套用。不得使用旧 GC、回退数据库、重置生产账号或操作旧 ProTerm／Supabase。

工作区保留了匿名探测、升级前／后恢复及部署检查的脱敏证据；它们不含密钥、Cookie、分享令牌或原始用户录音。最新升级后恢复证据为 `restore-proof-7be5e987-cd22-4f86-9d62-130b604df31c.json`，其 SHA-256 为 `05547acdf60fdf56e038e60c32bfa2053a578075cbc830af4a59688f17cf5ae9`。私密配置和备份密文本体未上传 GitHub。
