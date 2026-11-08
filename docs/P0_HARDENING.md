# P0 后端加固与验收记录

日期：2026-11-08。基线：`guest-trial/ai-gateway` 的 `86c3b847d22a89ab698df94f894f5f21467a85b6`；工作分支：`codex/p0-backend-hardening`。

范围：前两轮审查中的五个 P0；不改前端、共享契约、音乐规则或旧 ProTerm/Supabase。以下为实施阶段记录：该阶段只做代码和本机验证，没有提交／推送、生产部署、生产账号变更、真实录音处理或云端备份／删除。随后获授权的提交／推送与部署门槛另见 [发布记录](RELEASE_2026-11-08.md)，不反向更改下文历史验证结果。

## 状态如何理解

“代码已补”“本机验证通过”“生产验收通过”是三个独立状态。本机使用一次性 Linux Docker、独立 PostgreSQL 和合成音频；不是生产 ECS 或真实 OSS 验收。

| P0 | 代码交付 | 本机验收 | 仍需生产操作 |
| --- | --- | --- | --- |
| 1 外联地址校验 | `ipaddr.js` 严格解析，映射 IPv6 按 IPv4 规则校验；保留连接时 DNS 公网校验、HTTPS、无重定向 | 映射／规范化私网、链路本地、过渡及保留地址拒绝；正常公网保持可用 | 部署受测镜像，核对线上源码标识；不向真实内网发送探测 |
| 2 账号、权限、持久化 | 增加只读 `ops:foundation`；扩展真实 PG 账号／草稿／会话测试和容器替换测试 | 账号套件、迁移／权限检查；发布测试验证命名卷随 PG 容器替换保留数据 | 只读确认真实管理员、当前迁移、卷和权限；真实 H5 会话验收。不得猜测或自动重置生产账号 |
| 3 定时备份与恢复 | 增加无宿主 Node 的受限 root 维护入口；调整 systemd 模板；恢复必须校验媒体字节 | 加密 pg_dump/pg_restore、缺文件和字节不符负例；Shell 语法检查 | 审核安装专用单元、观察每日执行和失败状态，实际云备份恢复。模板存在不等于已运行 |
| 4 备份与音频回收一致性 | 新增迁移 0006；备份对象保护、备份／GC 互斥、保守保护近期历史备份 | 保护期内不删除、过期后重新进入宽限、运行角色不能修改保护记录 | 迁移前暂停旧 Wanwu 清理，确认历史备份可恢复，安装新维护工具；已丢失的旧文件不会凭迁移重现 |
| 5 源码／镜像／配置对齐 | 发布构建向镜像注入提交、内容摘要、dirty 标记及标签；`GET /api/v1/version`；源码不符拒绝启动 | 发布镜像与清单核对、镜像切换／回滚、数据库容器重建、旧站哨兵检查 | 取得线上运行摘要及对应配置；前端匹配源码仍需协作者提供，只核验不修改前端 |

实际测试结果与生成的证据路径见文末；未运行的检查不能凭此表标为通过。

## 1. 地址校验

`apps/api/src/guest/net.ts` 先用 Node `isIP` 拒绝非标准 IP 与 zone ID，再用固定版本 `ipaddr.js` 规范化 IPv4-mapped IPv6，仅接受公网 unicast 分类。`parseOverride` 与 HTTPS 连接的 DNS 查找复用同一策略；不跟随重定向，不在日志记录请求头／密钥。没有增加前端限制，也没有默认取消自定义公网模型功能。

不要用生产 SSRF 探测来验收。新增测试在本机验证 `::ffff:127.0.0.1` 及其 URL 规范化结果、私网、云元数据地址映射等被拒绝，不实际访问这些目标。

## 2. 只读基础审计

在专用 owner 配置环境内运行：

```sh
npm run ops:foundation
```

该命令使用只读事务核验数据库／owner 身份、PG 17、应用角色和继承权限、敏感表列授权、迁移数量及 SHA-256、有效管理员数量。只返回布尔检查和计数，不返回用户名、密码散列、会话、对象键或连接串。返回 attention／失败时不创建账号、不迁移、不改权限。

容器卷与宿主端口需要管理员入口额外核验：`wanwu-maintenance foundation` 限定 Compose 项目和 database 服务、持久 volume、无宿主端口，然后调用只读数据库审计。

测试中的管理员、邀请码、两位老师和恢复库均为随机／合成的一次性本机数据。真实管理员状态仍未知。

## 3. 定时维护安装边界

`deploy/runtime/wanwu-maintenance.sh` 仅允许 Linux root 和固定的 backup／cleanup／status／foundation 动作。它清空外部环境，固定本机 Docker socket、Compose 项目、维护目录及 Node 命令；不执行宿主 Node、不接受任意脚本路径，不授予普通 SSH 账号 sudo/Docker 权限。

未来管理员先审核受测发布包，再安装：

1. root 私有目录 `/etc/wanwu-sound/maintenance`，不是执行普通用户可替换的发布脚本。
2. 受审查的 Compose、seccomp、公钥，以及本项目现有 `.env.api`、`.env.worker`、`.env.database`、`.env.ops`、`.env.release`。普通文件 root:root 0600；不要读取／复制旧项目配置，不生成或旋转已有密码。
3. 脚本安装为 root 持有的 `/usr/local/sbin/wanwu-maintenance`。先核实 `/usr/bin/docker` 和 Compose 实际路径。
4. 审核三个 service/timer，以 `systemd-analyze verify` 检查；确认不与已有 Wanwu 任务重复后再安装。不能修改旧项目或 Docker daemon。
5. 先执行 foundation 和一次受控 backup；用离线私钥在隔离环境恢复，再启用／观察 timer。`systemctl list-timers`、对应 journal、备份年龄检查三者都要核对。定时检查失败可在 systemd/journal 中发现；尚未配置外部推送告警，不宣称会自动通知手机。

清理只操作本项目已登记对象，不能对桶使用盲目生命周期／批量删除规则。root 配置副本升级也必须审核，不自动覆盖现有云端文件。

## 4. 备份与媒体一致性

迁移 0006 仅新增 `backup_object_pins`、索引和受限 SELECT 授权，不改旧迁移。运行身份不能插入、修改或删除保护记录。

备份期间持有与清理器相同的独占 advisory lock；pg_dump 和加密上传结束后，对仍未删除的对象建立保护，涵盖 dump 期间新出现的对象。只有保护写入成功才报告备份成功。保护保留 30 天备份窗口加 7 天恢复缓冲；保护到期后重新开始原有 7 天回收宽限。成功备份会清理过期保护记录。

迁移对最近 30 天内已记录成功的历史备份做保守保护。不能解决升级前已丢失的文件，因此上线前必须做实际恢复。保护会增加存储留存，不能将 OSS 存储包理解为流量／请求／存储无限免费。

恢复 CLI 仍只允许空的 `wanwu_sound_restore_<随机8位>` 目标，不执行 drop/clean、不连接旧库。恢复后验证媒体登记关系，再逐个下载核对 SHA-256，顺序处理并立即删除临时下载。不把用户录音放进仓库或报告。

真实恢复期间先暂停本项目清理；恢复后先生成并验证一份新的备份、确认对象保护，再恢复清理调度。恢复出来的数据库不一定包含该备份完成后才写入的维护记录，不能直接把历史 running 状态当成当前成功／失败。

## 5. 发布可追溯与回滚

`npm run release:build` 记录真实 commit、源码文件指纹与 dirty；构建中源码变化则拒绝产生最终清单。`commit` 只表示基线，未提交修改依靠 `sourceDigest`／sourceFiles 明确标识，不得将 dirty 构建冒称为纯 Git 提交。

镜像内置 `WANWU_BUILD_*` 并标注内容摘要；API 运行配置里的 `WANWU_SOURCE_DIGEST` 与镜像内容不符时拒绝启动。`GET /api/v1/version` 只暴露提交、摘要、dirty 和基础契约版本，不暴露路径、环境变量、密钥、用户数据或迁移明细。维护入口也检查镜像摘要标签。

本机 `test:release` 只操作 UUID 命名的一次性项目，验证镜像标识、资源隔离、Worker 心跳、API 镜像切换／回滚、PG 容器替换及独立旧站哨兵。镜像回滚是 label-only 后继的冒烟验证，不冒充历史业务／迁移兼容性验证。

真实 ECS 运行版本和前端源码对齐仍需要后续授权核查。前端可见构建指纹不能替代匹配的源码提交；这一缺口不能通过编造版本号解决。

## 本机验证记录

最终复核结果：

| 命令／检查 | 结果与范围 |
| --- | --- |
| `npm test` | 182 项通过；包含新增 SSRF、备份锁／保护期、恢复文件完整性、只读审计、版本标识和维护入口检查 |
| `npm run build` | 类型、8 份原件／试听目录和 125 个共享文件指纹全部通过 |
| `npm run test:api` | 16 项真实 PostgreSQL 17 测试通过，包含 API／连接池重建保留会话、多账号隔离、另一客户端读取草稿、版本冲突、改密／停用／恢复撤销会话 |
| `npm run test:operations` | 4 项通过；真实 pg_dump／加密／pg_restore，备份保护、缺文件和错误字节均有验证 |
| 旧 SSRF 审查复现用例 | 只运行 `private IPv4` 对应的 P0 用例，已从失败变为通过；没有宣称另一项 P1 AI 时间表述缺陷已修复 |
| 维护入口 | Bash 语法和非法动作测试通过；额外在无网络、无 Docker socket 的隔离 Linux root 容器验证缺少受保护配置时拒绝执行。没有运行真实 systemd 调度 |
| `npm run release:build` | 四个镜像构建成功，内容摘要一致；未部署。开发期间一次并行编辑触发了源码变更检查，旧候选未产生最终清单，稳定源码重新构建后通过 |
| `npm run test:release -- artifacts/releases/86c3b847d22a-9a565bb93fae/deployment` | 通过：镜像源码标识、独立网络／端口／资源、Worker 心跳、镜像切换／回滚、PG 容器替换后数据保留、旧站哨兵未变 |

证据：

- `artifacts/wanwu-auth-test-a28062a4-43dc-49bd-b88f-c8b7016cfe73.json`：pass，API 峰值约 147 MiB，无 OOM；只属于本机合成测试。
- `artifacts/wanwu-operations-test-9098f129-7117-4578-9f74-f1cc28c5520d.json`：pass，运维测试峰值约 92 MiB，无 OOM。
- `artifacts/wanwu-release-test-b00b6249-018f-4f19-b1d8-7a06007e63e9.json`：pass，`databaseContainerReplacementVerified`、`imageSourceIdentityVerified`、`rolloutAndImageRollback`、`oldSiteSentinelUnchanged` 均为 true，`realCloudAcceptance` 仍为 false。
- 本机发布清单：`artifacts/releases/86c3b847d22a-9a565bb93fae/deployment/release-manifest.json`；293 个运行／构建源码文件，源码摘要 `9a565bb93fae2dd3813c7bb70fe54733a7d720c287630fe9d13a5b1050a7da81`，`dirty=true`，未提交／推送。

测试临时容器、网络和恢复数据库已按各自 UUID 范围清理；本机发布镜像与证据保留。前端工作区和 `packages/` 没有改动。生产验收、systemd 定时运行、真实 H5 和真实 OSS 恢复本轮均未执行，因此五项 P0 的生产关闭条件仍未全部满足。
