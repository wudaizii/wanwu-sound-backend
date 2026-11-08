# P1 后端加固与职责分离

> 部署增量见 [2026-11-09 生产交接](PRODUCTION_2026-11-09.md)。本批后端与维护已部署；新 facts／额度 UI 仍由前端以后接入，完整登录创作尚待验收。下文保留实施阶段原始范围。

2026-11-08。基于已有 P0 本机修改继续实现，未变更前端、共享包或生产服务。以下为实施阶段记录：当时 `codex/p0-backend-hardening` 包含尚未提交的 P0/P1，不能用基线 Git SHA 代表完整候选源码。随后用户授权提交、推送和部署；发布门槛另见 [发布记录](RELEASE_2026-11-08.md)。

## 七项 P1

| 问题 | 本轮实现 | 验收边界 |
| --- | --- | --- |
| AI 内存日限额重启清零、多进程可超额 | PG 北京日期原子 UPSERT 计数；所有实际出站尝试经过全局 2 槽租约；网络适配器总超时及 1 MB 响应上限 | 失败尝试也计数；并发拒绝不计数；不是 token／人民币硬上限 |
| AI 任务重启丢失 | PG 任务表＋独立 pg-boss `ai-background`；会话绑定、输入去重、租约条件完成、10 分钟 TTL | 内置排队任务可续领；已发出的不确定计费调用不自动重试；BYOK 不存密钥／输入，重启后明确失败 |
| 发现文案的“结尾”与实际时间不符 | 后端 `factPolicy` 复用共享验收，再按目标 occurrence／证据范围校验位置；交叉核对 spans／times／range／引用 | 修复已知 30 秒作品 4.8–7 秒假结尾；不是完整自然语言真值证明，也不是内容安全审核 |
| 两个 Nginx 入口限额漂移 | 共同 routes/proxy include；普通／保存／特征／发现分路由上限；发现 52 秒；原样透传 Cookie／CSRF／If-Match，覆盖伪造转发 IP | 模板和本机真实 Nginx 验证，不代表生产 Nginx 已改 |
| 模型配置未加载／交接仍以 Netlify 为准 | API 明确加载私有 `.env.models`，其他容器不加载；字段允许表、防覆盖、缺文件停止；模板进入 release；正式入口文档更新 | 模板模型默认关闭；不写入或读取现有真实密钥，不开启付费模型 |
| 运行健康只证明数据库活着 | 管理员／维护私有聚合：队列积压／近 1 小时失败、媒体／AI 心跳、备份／清理／对账时效、AI 最近失败、文件状态；systemd 失败退出 | 公开 health 仍只做轻量活性；没有冒充已接远程通知 |
| DB 与 OSS 缺少持续对账、资源无账号限额 | 独立有限 HEAD 对账与轮询覆盖；只登记对象、不扫全桶；配额按同一事务锁序预留，限制账号存储和媒体任务 | 缺失／异常只记录，不自动删除／下架；原有登记、任务幂等和 P0 备份保护均保留 |

## 关键默认值

- PG 调用租约 90 秒，实际适配器最长 55 秒硬截止，防止死进程长期占槽。内置日限额默认 2000 次；各听音、文本和修复分别占一次，用户自己的密钥不占内置次数但仍占并发。
- AI 同时最多保留 100 个未结束任务，后台消费单进程一次一个，与媒体单重任务分开。状态／结果保存 10 分钟，聚合用量保存 60 天；队列只放任务 ID，不放提示、录音或密钥。
- 后台任务运行租约 75 秒，pg-boss 到期 90 秒、重试 0。已完成结果按租约和期限条件写入；过期调用的晚到结果不能覆盖失败状态。真实网络请求不会通过数据库回滚退款／重放。
- 每账号默认 1 GiB 保守媒体预留、5 个未完成音源、3 个未完成渲染；全站媒体预留上限 50。原件按声明字节、播放件按 12 MiB、待生成品按 2 MiB 预留；已有登记但尚未物理回收的对象仍占用。不等于精确 OSS 账单／真实可用容量。
- 新增 catalogue 节选记录 `requested_by`，供任务／播放件预留计入发起账号；不改变其共享读取权限，也不重复计费内置原件。历史无发起者的节选不臆测归属，既有原件属于项目公共成本。
- OSS 对账默认每 15 分钟轮转最多 20 项，循环预算 45 秒（单次 HEAD 另有 SDK 截止）；只检查活跃 ready 音源／成品，忽略尚在上传的保留占位，检测登记缺项、404、字节异常和暂时不可用。HEAD 不替代恢复演练中的 SHA-256 校验。
- 发现位置策略保守：结尾断言要求证据在后半且抵达最后 20%；开头要求位于前半且始于前 20%；前后半要求范围相符。无法定位则拒绝该条目。其他自然语言音乐判断仍须试听验收，不能把一个词表当作完备音乐推理。

## 前后端分离做到哪里

仓库和构建本来已分开，本轮强化可信边界而非再拆微服务。服务端新增 `/works/{id}/facts` 和 `/account/usage`，草稿来源与音源测量绑定、任务／额度／AI 出站和验收归后端；保留前端录音、编辑、即时试听、本地暂存和用户确认。完整对接说明见 [BACKEND_BOUNDARY](../handoff/BACKEND_BOUNDARY.md)。

新 facts 是后端能力，**前端当前尚未接入**。现有匿名 AI 简报仍不能被称为服务端快照事实；若未来要云端修订绑定生成，应新增明确的 workId/revision 工作流，不将旧服务端草稿暗中覆盖实时编辑。本轮不改动视觉或音乐参数。

## 本机验证

可重跑：

```sh
npm test
npm run build
npm run test:p1
npm run test:api
npm run test:operations
npm run test:gateway
npm run release:build
npm run test:release -- artifacts/releases/<实际生成 id>/deployment
```

P1 集成使用独立 Linux PG17、非 root／0.25 CPU／256 MiB 容器、合成音频及假的模型响应；不请求真实付费模型／OSS／ECS。网关测试使用两套真实本机 HTTPS Nginx host，包括大于原 256 KiB 的合法请求、超限拒绝、Cookie／CSRF 与 21 秒延迟响应；不是正式域名验收。

已完成的本轮回归：

| 检查 | 实际结果 |
| --- | --- |
| `npm test` | 188 通过；含已知假结尾及真实路由修复失败路径 |
| `npm run build` | 类型通过，8 个内置原件／试听完整，125 个共用文件指纹一致 |
| `test:p1` | 12 通过；并发额度、任务状态、隔离、迟到完成、上传续签、节选／渲染配额、旧规则拒绝、存储对账和私有健康 |
| `test:api` | 16 通过；邀请码并发、账号／会话／权限／跨设备／冲突及新 facts／usage 路由 |
| `test:operations` | 4 通过；真实 pg_dump／加密／独立恢复／媒体一致性与备份保护回收 |
| `test:gateway` | 两个真实 Nginx HTTPS host，15 个检查通过 |
| `release:build` / `test:release` | 四镜像构建及真实 main.ts／Cookie／CSRF／AI 队列连接通过；API 重启后任务结果保留；镜像切换／回滚、PG 容器重建保留卷数据、旧站哨兵检查通过 |

最近的内核／数据库证据（在本机 ignored 的 `artifacts/`，不上传临时数据）：`wanwu-p1-test-275b32f3-d525-4a4e-86ae-9fd17bc87f7b.json`、`wanwu-auth-test-dddd0704-d8e0-4709-8f2b-1816ac01eb0e.json`、`wanwu-operations-test-50622821-294e-424d-b0b9-2f5861b63176.json`、`wanwu-gateway-test-85b8cc42-1908-4fe0-a4b2-23c46dc7e394.json`。P1／API／运维进程均无 OOM；这些是隔离测试，不是生产容量承诺。完整媒体重任务样机本轮未重跑；音乐共用包未变。

四个镜像本机构建候选：`86c3b847d22a-ac9fd7ce1aaa`，运行源码摘要 `ac9fd7ce1aaaa6b120866a758eb3641affe3f3c69db2c16d0b1c6b9e4a07f4ce`，315 个构建／运行文件；`dirty=true`，含本地未提交 P0/P1。镜像、模型模板与 3 个 P1 迁移已在 `artifacts/releases/<id>/deployment/release-manifest.json` 对照验证。正式发布须另获授权；候选构建不等于已部署。

最终烟测记录：`artifacts/wanwu-release-test-ea51c089-57d9-4ac4-913c-2970d3110374.json`。会话测试只在隔离环境短暂启用 session，随后恢复 disabled；内置模型关闭，无真实付费调用或 OSS 请求。结束后测试 Compose／网络／临时卷与证书均已清理，候选镜像及脱敏证据保留。最终再次核对 315 个运行／构建文件与候选摘要一致。

### 已有数据库升级时的队列步骤

`db:migrate` 只执行版本化业务迁移；pg-boss 队列需额外用现有安装函数创建／核对，**不能漏掉这一步，也不要为它重跑整套账号／密钥初始化**。获授权后，在当前候选的 ops 容器、已核实的 Wanwu owner 环境中先运行 `apps/api/src/db/migrate.ts`，再以 Node module 模式执行：

```js
import { openDatabase } from './apps/api/src/db/client.ts';
import { installMediaQueue } from './apps/api/src/jobs/mediaQueue.ts';
const database = openDatabase(process.env.WANWU_MIGRATION_DATABASE_URL, 'owner');
try {
  await installMediaQueue(database.pool); // 保留 media singleton，创建独立 ai-background，重申最小运行权限
} finally {
  await database.close();
}
```

这里只是受审查的升级说明，未执行生产迁移。新环境的 `db:bootstrap` 已包含该步骤；不得把测试用 bootstrap 当作现有生产库升级或密码旋转工具。

## 仍需授权后的生产工作

1. 只读核对实际容器镜像、PG 卷、迁移、管理员和资源余量；不能默认创建账号或改密码。
2. 审核并应用 0007–0009 新迁移／队列，保留旧兼容结构和 P0 备份保护；创建独立私有 `.env.models`（可空），不重跑初始化旋转密钥。
3. 两入口引用共享路由文件，完整 `nginx -t` 后平滑 reload，不动旧站证书／配置。按摘要部署本次镜像，核实 version 与会话／队列。
4. 按 root 保护入口安装 backup／cleanup／health／storage timer，观察实际执行；对账初始覆盖完成前 attention 正常但不能忽略。
5. 正式 H5 完成登录、保存、真实音频处理、成品、分享／撤销和恢复／回滚验收，再称为上线。前端新 facts／额度展示的接入另行安排。

上述实施／本机验证阶段没有执行生产操作。随后用户已授权提交、推送和部署，但现有 SSH 仍没有 Docker／sudo 管理权限；不能因此提升 `ecs-dev` 权限或借用旧 Supabase，不安装未审核的生产定时器。
