# 管理员全站配置

本功能由独立后端提供页面和 API，不依赖 H5 的发布包，也不修改既定 H5 视觉。

已于 2026-11-22 部署并完成 15 项真实浏览器检查，当前版本、证据和恢复范围见 [生产记录](PRODUCTION_2026-11-22.md)。这份说明不代表后续操作者获得新的生产操作授权。

- 正式入口：`https://wanwu.proterm.ink/admin/settings`。
- 后端直接入口：`/api/v1/admin/settings/page`，须通过正式 H5 同源访问。
- 使用网站管理员账号；普通老师、匿名访客不能读取或修改配置。
- 业务云端模式关闭时，专用管理登录仍要求 HTTPS、真实管理员 Session、Origin、CSRF 和限流。

## 配置源和生效方式

服务器主文件为 `/srv/wudaizii/wanwu-sound/configuration/config.json`，目录 UID/GID 1000、权限 0700，文件 0600。容器内为 `/run/wanwu-config/config.json`。API 只挂载此目录可写；media、ops 只读挂载。不给应用 Docker socket、sudo、宿主配置目录或 root 权限。

`apps/api/src/settings/schema.ts` 是完整字段目录，包含中文名称、说明、默认值、环境变量映射、范围和生效方式。管理员 GET 返回实际启动环境、文件覆盖值及当前生效值，不能只把模板默认值当作线上值。

| 类别 | 行为 |
| --- | --- |
| `live` | 新请求、新任务读取；模型外呼总量、并发、接口限流、账号额度、上传／播放授权、会话期限、新邀请／重置期限、密码散列参数、任务、清理、巡检和告警阈值 |
| `restart` | 进程启动时固定：Origin、云端模式、代理 IP、应用 DB URL、Session 密钥、OSS 连接、数据库连接池；保存后点击“应用重启与部署设置”，由应用器生成私密启动环境并受控替换进程 |
| `deployment` | Docker／PostgreSQL 资源、日志轮转、定时器和 Nginx 超时。文件保存部署意图；宿主应用器校验并成功执行后写入签名回执，页面据此显示当前值 |
| `release` | 用户名／编排／采样率／媒体并发等契约边界及 10 份共用音乐规则。页面可编辑并保存发布草稿，但必须前后端同步发版，不能静默改变已保存作品听感 |

优先级为：经校验的文件覆盖 → 当前进程的项目专用环境 → 源码默认值。源文件没有设置的项继续继承已有环境；不重跑初始化工具旋转旧密钥。重启项保存前必须先核对连接和外部依赖；保存并不自动完成 DNS、证书、OSS CORS、RAM 授权或数据迁移。

## 页面功能与安全

按类别分组，支持搜索、生效方式过滤、字段范围、未保存修改提示、当前版本、来源、待应用状态、字段错误、历史恢复和发布草稿读取。音乐及契约发布草稿默认折叠。

- `GET /api/v1/admin/settings` 返回元数据、脱敏值、修改记录、ETag。
- `PATCH /api/v1/admin/settings` 请求 `{ changes: { "ai.dailyLimit": 1000 } }`，必须携带 `If-Match: "settings:N"` 和 CSRF。`null` 表示删除文件覆盖、继承启动默认值；密钥省略表示不改，空串表示清除（必要字段或模型组合仍须通过校验）。
- `POST /api/v1/admin/settings/restore` 请求 `{ revision: N }`，恢复生成新版本，不倒退修订号。
- `GET /api/v1/admin/settings/release-plan` 只读、管理员专用，导出协议和音乐规则发布草稿及接手要求，不包含运行密钥。
- `POST /api/v1/admin/settings/apply` 请求 `{}`，须管理员 Session、CSRF、当前 If-Match，返回 202 和请求 ID。只创建带签名的固定格式申请，不接受命令、路径或脚本。
- `GET /api/v1/admin/settings/apply-status` 只读、管理员专用，返回应用器心跳、申请 ID、进度及成功／失败；不返回命令输出或私密值。
- 文件写入使用独占锁、修订检查、0600 临时文件、fsync、原子 rename；冲突返回 412，不清空页面输入。
- `history/N.json` 保存此前版本，主文件审计记录由服务端写入确认操作者、时间和字段名，不记录明文密钥。
- 密钥使用独立 `WANWU_CONFIG_ENCRYPTION_KEY`（32 字节、64 位十六进制）AES-256-GCM 加密。页面不返回密钥、数据库 URL 或 AccessKey 明文；不是把星号当作真实密钥写回。
- 加密主密钥只在 API 的私密启动环境中，不放入可编辑 JSON、Git、前端、media 或 ops。必须在现有私密配置管理中保留它；丢失后不能解密历史配置中的凭据。密钥轮换另行实施，不能随意重新生成覆盖。
- 文件读取失败或新版本损坏：运行中的进程保留最后一个已验证版本，并在管理页报告异常；冷启动拒绝无效文件，不悄悄回退默认值。
- 未登录的受保护读取可能按现有安全策略清除匿名 Cookie；页面在每次登录提交前重新获取 CSRF，不复用旧令牌，也不放宽服务端验证。

## 首次部署

先通过本机 `npm test`、`npm run build`、`npm run test:settings`、`test:api`、`test:p1`、`test:operations`、`test:gateway` 和发布镜像检查。镜像仅本机／CI 构建，不能在共享 ECS 构建或压测。

1. 保留已有项目环境，单独给 API 的 `.env.api` 增加新加密主密钥，不输出该值。`config:prepare` 只供全新私密目录使用，不能对当前 ECS 重跑。
2. root 创建 `/srv/wudaizii/wanwu-sound/configuration`，UID/GID 1000、0700；放入 UID/GID 1000、0600 的初始文件 `{"format":1,"revision":0,"values":{},"audit":[]}`。
3. 使用本版 Compose 新增专用目录挂载，API 可写、media/ops 只读。更新 root 保护的 maintenance Compose 副本。不要把加密主密钥传给 worker/ops。
4. 应用向后兼容迁移 `0010_configuration_snapshots.sql`；原有迁移不得修改。
5. 仅替换 Wanwu API／media 与维护镜像。数据库卷、旧项目 Compose 和全局 Docker 设置保留。
6. 安装本目录下说明的 root 保护应用器和独立 systemd 服务。生成与实际资源、定时器、代理一致的初始签名回执；不能仅通过模板猜测已生效值。
7. Nginx 两个 Wanwu HTTPS 入口继续使用同一组路由文件；新增 `/admin/settings` 的精确转发。完整 `nginx -t` 通过后平滑 reload。
8. 用真实浏览器验证管理员读取、编辑、保存、刷新、恢复、冲突、受控应用及老师拒绝访问；单独确认 ECS 文件、实际消费者及旧站健康。不能以本机通过代替线上验收。

## 应用部署级设置

将 `apply-configuration.py`、`configuration-controller.py`、`controller_codec.py` 安装到 `/etc/wanwu-sound/`，root 所有、0700；将 `wanwu-config-controller.service` 安装到 `/etc/systemd/system/`。首次安装经审核后启用此独立服务，不改变 Docker daemon、旧站服务或既有应用的权限。

页面先保存文件，再点击“应用重启与部署设置”。应用器在私密目录读取经过签名的申请，以固定程序和固定参数调用受控应用步骤；不暴露 root HTTP、Shell 或 Docker socket。申请绑定修订号、操作者、时间及不可重复的 ID，五分钟过期，默认两次应用至少相隔 60 秒。主进程重启不重放已领取的申请。心跳超过 35 秒页面判定离线，不能提交新的应用申请。

应用器只操作 Wanwu 三个容器、独立环境覆盖文件、独立 Nginx 路由和四个 `wanwu-*` 定时器；不提供任意命令／路径执行。它检查实际空闲资源和活动媒体／模型任务、保留本地回滚配置、校验 Compose 和完整 Nginx，再进行 Wanwu 的受控替换。没有资源变化时不替换数据库；代理设置单独变化不应重建容器。维护进程读取同一份配置及启动环境覆盖。签名回执仅在资源、入口和健康检查通过后写入，普通进程重启不会把部署草稿显示为已应用。

受控启动配置写入 root 保护的 `/etc/wanwu-sound/.env.site-{api,media,ops}`，不修改原有环境文件。没有解密主密钥的 media／ops 只接收必要的启动连接配置；ops 的独立备份、删除身份不会被运行 OSS 身份覆盖。主 JSON 中的连接草稿只有经过该流程才成为启动环境，程序崩溃重启不会意外激活未应用的连接草稿。

`applied.json` 与 `controller-status.json` 使用从主密钥派生的 HMAC 校验，前者记录已验证的数值，后者仅记录状态；API 不依赖任意未签名的文件来宣告成功。应用器的领取记录在 `/etc/wanwu-sound/.configuration-controller.json`，root 0600。服务自身的 CPU／内存／PID 有独立上限。

已有 root SSH 管理员仍可生成脱敏计划，或在页面不可用时人工执行同一受控步骤：

```sh
python3 /etc/wanwu-sound/apply-configuration.py
```

审核计划后应用：

```sh
python3 /etc/wanwu-sound/apply-configuration.py --apply
```

修改 Bucket／地域／前缀、正式 Origin 或数据库目标须另行核对迁移或 DNS/TLS/CORS；自动应用器拒绝直接切换。更换同一目标的 DB／运行身份凭据时，需要先确保云端及数据库凭据已存在有效，再受控同步 API／media／ops 的正确身份；不得把运行 OSS 凭据覆盖备份删除身份。

## 历史数据与边界

新上传登记冻结 `upload_policy`，处理中改变长度上限不会追溯拒绝已接收文件。成品快照冻结 MP3 编码设置并纳入输入摘要，重试沿用原快照参数。已有音频、原件和已签发播放链接不被追溯改写。

配置恢复和数据库恢复独立。现有 SQL 备份不自动包含配置主文件／历史或配置解密主密钥；完整恢复配置需保留这些文件及对应主密钥。本功能没有改变现有数据库备份格式。

改变备份保留期不会缩短已有媒体保护；GC 同时考虑持久保护和当前保留设置，不能因配置延长而先删掉恢复所需文件。既有文件仍依照引用和保护判断回收。

当前前后端契约的硬边界仍由版本化代码共同执行；低于这些硬上限的运营限制可以直接调。音乐发布草稿不写入正在使用的共用包，不绕过 `handoff/manifest.json`。接手者应读取 `/release-plan`，在前端仓库修改、更新版本并同步后端，跑音频对照后再分别发布；不得把“草稿已保存”解释成“孩子试听已采用新规则”。
每个 HTTP 请求及后台任务使用开始时捕获的不可变配置快照。管理员在中途保存新版本时，不把一次上传、配额核算或密码校验的前后两步混用不同设置；后续请求／任务读取新版本。成品的预留空间同时参考已冻结的编码设置，调低全站码率不会低估仍在等待的高码率成品。
