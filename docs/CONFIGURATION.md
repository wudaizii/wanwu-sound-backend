# 配置表：先分清谁持有秘密

前端维护者只需要仓库、站点、API 代理和测试邀请；不需要 RAM／OSS AccessKey、数据库密码或生产会话密钥。所有示例环境值都是空值或非秘密目标名称，不能直接当作可运行生产配置。

## 后端运行配置

| 配置 | 用途／约束 |
| --- | --- |
| `WANWU_DATABASE_URL` | 独立 `wanwu_app` 角色、`wanwu_sound` 数据库；不用旧 Supabase URL |
| `WANWU_SESSION_SECRET` | 新项目独立随机秘密，至少 32 字符，不进前端 |
| `WANWU_APP_ORIGIN` | 精确 HTTPS Origin，当前正式目标为 `https://wanwu.proterm.ink` |
| `WANWU_CLOUD_AUTH_MODE` | 初始 `disabled`；由后端维护者获准联调后设为 `session` |
| `WANWU_TRUSTED_PROXY_ADDRESSES` | 实测最后代理的精确 IP，不能填 true、跳数、域名或整个 CIDR |
| `WANWU_API_HOST`／`PORT` | 容器内监听 0.0.0.0:3100，宿主只映射 127.0.0.1:3100；旧 3000 不动 |
| `WANWU_OSS_BUCKET`／`REGION`／`PREFIX` | 现有私有 Bucket、上海地域、本项目隔离前缀 |
| `WANWU_OSS_ACCESS_KEY_ID`／`SECRET` | 受限运行身份，仅音频前缀读写；不具备备份／删除权限 |

模板：根 `.env.api.example`、`deploy/runtime/api.env.example`、`worker.env.example`。真实环境文件由后端维护者保管，不通过仓库交接。

## 管理配置单独保管

`WANWU_MIGRATION_DATABASE_URL` 使用独立 `wanwu_owner`；`WANWU_APP_DB_PASSWORD` 只供初始化；运维 OSS 身份单独用于受限备份、版本列举和清理。API 明确拒绝带管理数据库凭据启动。

备份服务器只持 `WANWU_BACKUP_PUBLIC_KEY_FILE` 指向的公钥；备份私钥留在独立安全位置，不能传 ECS 或放在镜像里。管理员初始密码不上传服务器文件，通过经批准的受保护 stdin 命令创建。

## 新本机开发环境，不是现有 ECS

1. 安装 Node 24.21 及本机 PostgreSQL 17 或本机 Docker。`npm ci` 后执行 `npm test`、`npm run build`。
2. `npm run config:prepare` 只在不存在 `.secrets/` 时生成新的私密配置，拒绝覆盖；不要在别人的既有工作区重复运行。
3. 该工具的数据库主机名针对隔离 Compose，不能当作宿主本机连接地址；本机独立配置、账号、端口由维护者明确设置。
4. 只在新的独立数据库执行 `npm run db:bootstrap`，按受保护 stdin 创建管理员，再准备内置音源与媒体任务。不能对线上库反复 bootstrap 或用测试脚本迁移旧数据库。
5. 会话只接受 HTTPS；前端本机 `npm run dev` 的 HTTP 页面不等于完整账号联调环境。真实网站联调用正式 HTTPS Origin，或单独经授权的本机 HTTPS 代理／独立测试 Origin。

Argon2 是本地原生依赖；如果 npm 安装时跳过脚本，在部分平台需要运行 `npm rebuild argon2`，缺少预编译包时还需要本机编译工具。开发媒体测试需要 FFmpeg／ffprobe，可使用项目开发依赖，或显式设置 `FFMPEG_PATH`／`FFPROBE_PATH`；生产镜像使用 Linux 系统工具。

## 模型与资源限制

API 的 Compose 明确加载 `.env.api` 和 `.env.models`；后者只允许模型字段，空文件合法，缺文件则停止配置检查。不要把 `.env.models` 中的密钥传给 media、database 或前端，也不要用它覆盖数据库／认证设置。已有环境升级须由管理员审核后创建这个独立私有文件，不能重跑 `config:prepare` 旋转原密钥。模板默认全部模型关闭，具体模型由现有配置决定。

账号默认预留 1 GiB 媒体额度、最多 5 个待处理音源、3 个待处理渲染，全站最多 50 个媒体任务。`WANWU_ACCOUNT_STORAGE_BYTES`、`WANWU_ACCOUNT_PENDING_SOURCES`、`WANWU_ACCOUNT_PENDING_RENDERS`、`WANWU_MEDIA_MAX_PENDING` 只在 API 配置中调整。播放件按 12 MiB、未完成成品按 2 MiB 保守预留，未真正回收的文件仍计入；不是实际账单或已压测容量承诺。细节见 [P1 修复记录](P1_HARDENING.md)。

## 正式 H5 与 OSS

正式 H5 为 ECS 上的静态构建（前端仓库的 `apps/web/dist`），`/api/v1/` 由 Nginx 同源代理。历史 Netlify 不是当前必配项；前端始终不配置持久云密钥。Nginx 两入口必须包含同一组路由限制文件，参考 [运维说明](OPERATIONS.md)。

OSS：保持私有、阻止公共访问；精确允许目标 H5 的 GET／HEAD／PUT 和实际签名上传头。已有当前 Origin 的规则与权限验证记录，不要因为尚未启用登录就重买资源或放开全桶权限。后续新增 Origin 必须前后端共同确认，不能用 `*` 解决带凭据请求。

现有生产配置不随本仓库分发。缺少值时联系后端维护者，不能从旧项目、其他账号或浏览器缓存中搜密钥，也不能填假值宣称已接通。
