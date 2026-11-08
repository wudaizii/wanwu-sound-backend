# 部署与运维：只供获授权的后端维护者

> 2026-11-08 更新：先读 [P0 加固与上线门槛](P0_HARDENING.md) 和 [本次发布记录](RELEASE_2026-11-08.md)。本机实施阶段已验证；随后虽获部署授权，现有 SSH 仍无 Docker／sudo 权限。生产账号、部署和定时任务安装尚未执行，历史服务状态不能替代当前验收。

P1 增量见 [P1 加固与验证](P1_HARDENING.md)、[前后端职责边界](../handoff/BACKEND_BOUNDARY.md)。新增 0007–0009 迁移、`.env.models`、共享 Nginx 路由与 storage 对账任务均需审核，不可直接覆盖生产配置。

前端接入者不需要执行本页。上传 GitHub 不等于已变更云端；本次没有更新 ECS、开启认证或发布前端。部署授权不包含提升普通 SSH 账号权限、创建账号或重置密码。

## 已有服务与新源码

现有 ECS 上的 Wanwu 服务来自此前单仓库候选镜像，已有独立 API／PG／媒体进程和 HTTPS 入口。本次拆分改变了示例数据路径与镜像构建上下文；必须重新构建并验证新源码，不能直接把新 Compose 模板覆盖到服务器。

服务器无宿主 Node，普通开发用户没有 Docker／免密 sudo 权限。不要为套用脚本而安装宿主 Node、提升普通用户权限，或把旧 Supabase 当作新库。

## 发布前门槛

- 在本机／CI 构建并锁定 image 内容摘要、源码摘要、迁移和配置；不在共享 ECS build 或压测。
- 执行独立 Linux API／媒体沙箱／资源测试；Chromium 必须启用 namespace、PID／network namespace 与 seccomp，不用 `--no-sandbox` 或 privileged。
- 变更前后核对旧站健康。可用内存至少 2.5 GiB，装载镜像后磁盘至少 8 GiB；不足就停，不挤占旧服务。
- 发布只操作 `/srv/wudaizii/wanwu-sound`，Compose 项目 `wanwu-sound`，独立网络／卷／日志；宿主 API 只绑定 127.0.0.1:3100，PG 和媒体不开放宿主端口。
- 现有正式配置在 root 保护的 `/etc/wanwu-sound`。root 不应执行普通开发账号可替换的脚本或环境文件。

## 工具顺序

```sh
# 本机或获授权 CI；本地 Docker 不可用就停止，不切到 ECS：
npm test
npm run build
npm run test:api
npm run test:media
npm run test:worker:runtime
npm run test:operations
npm run test:p1
npm run test:gateway
npm run release:build -- --archive
# 按实际生成路径替换：
npm run test:release -- artifacts/releases/<id>/deployment
```

Docker／内核验证未通过时，不升级共享主机或降低隔离绕过。`build` 只检查源码，不证明 Linux 镜像已验证。

发布包的镜像引用校验使用 `deploy/runtime/resolve-images.mjs` 和 `image-pins.ts`。导入后只接受已记录的 image／config digest，不使用浮动标签。迁移保持向后兼容，先保留上一版配置和镜像。

Nginx 只改独立新配置。不要打印可能包含旧秘密的完整 `nginx -T`；完整 `nginx -t` 通过后才 graceful reload，不重启共享 Nginx／Docker，不改旧域名和证书。

## 开启真实 H5 联调

1. 前端维护者先完成 JSON API 代理和经批准的前端部署。
2. 后端维护者先只读核对当前数据库／迁移、内置音源、媒体心跳与管理员是否存在；未经具体授权不创建生产账号或修改密码。确需创建时，`admin-cli.ts` 只读受保护 stdin，不把密码放命令参数、历史或本仓库。
3. 实测最后代理连接 IP，写入精确信任列表；不照抄旧网关地址或信任整个 Docker 子网。
4. 经授权受控启用 `session`，只发测试邀请，逐项跑 `handoff/ACCEPTANCE.md`。失败保持／恢复 disabled，不用身份头或假会话替代。
5. 前后端共同确认完整闭环后再安排小范围试用；不要把无登录健康检查当作上线验收。

## 备份、清理和回滚

数据库备份是 PG 自定义 dump，经 AES-GCM 加密并用离线私钥对应的公钥封装。服务器只保留公钥，备份进入独立私有前缀，计划保留 30 天。

目前只有单次真实备份、独立本机恢复和单次清理的历史通过记录。每日备份、定期清理和健康任务尚待真正安装、执行和验证，RPO 24 小时／RTO 4 小时仍是目标。

`deploy/runtime/wanwu-*.service.example` 是待审核安装的模板：现在调用 root 持有的 `wanwu-maintenance.sh`，不依赖宿主 Node，也不提升普通 SSH 账号的 Docker／sudo 权限。维护配置限定在 `/etc/wanwu-sound/maintenance`，与应用的 `/srv/wudaizii/wanwu-sound` 发布目录分开；保留 Compose 项目 `wanwu-sound`。所有文件由管理员审核后以 root 持有的副本安装，不能直接运行普通用户可替换的脚本。密码、环境和配置文件保持 0600；只有不含私钥的 `backup-public.pem` 使用 0644（或 0444），供 UID 1000 的备份容器通过只读挂载读取。公钥所在目录仍仅由 root 管理，私钥不上服务器。未实际安装、观察运行前，不能标为定时备份已生效。

恢复只允许新建空的 `wanwu_sound_restore_<8位十六进制>` 数据库，不能指向生产或旧 Supabase，不使用 drop／clean。恢复检查现在还要求有只读媒体权限的 OSS 配置，逐个校验音频真实 SHA-256；库恢复成功但音频缺失／损坏会失败。私钥只在操作端，不上 ECS。

文件回收检查作品、素材库、发布、任务及备份保护引用。迁移 0006 为最近成功的历史备份保守建立保护；新备份持有 GC 锁直到上传和对象保护完成。30 天备份窗口加 7 天恢复缓冲内不回收对应媒体，保护解除后仍有原先的 7 天回收宽限；临时上传仍为 24 小时。此策略会增加相应 OSS 留存量，应监测账单。

**引入备份保护后，不得继续运行旧版清理器。** 回滚 API／媒体时保留兼容的新迁移及维护工具；无法确认时只暂停 Wanwu 清理，不运行不认识备份保护的旧 cleanup。

故障只停止或回滚 Wanwu 的 API／媒体镜像；不 `down -v`、不全局 prune、不倒退或删除数据库。回滚和恢复必须实际演练，不能因为提供了命令就标为通过。

## P1 配置增量

- API 环境文件为 `.env.api` + `.env.models`，后者为空也必须存在（0600，root 私有）。`operate.mjs` 和维护入口检查允许字段；不要打印 `docker compose config` 的完整结果，只用 `--quiet`。新模板已进入发布包。
- 在 Wanwu 独立目录安装同一份 `wanwu-api-routes.conf` 与 `wanwu-api-proxy.conf`，两个 HTTPS host 均引用，不保留互相冲突的旧 `/api` location。`wanwu-http` 日志格式只在 http{} 定义一次。完整 `nginx -t` 后才允许平滑 reload，H5 模板只是参考，不能整块覆盖现有站点或证书。
- 请求限额：普通 256 KiB、作品正式保存 1 MiB、课本特征 1,265,536 字节、发现 5,200,000 字节；发现路由 read timeout 52 秒，内部预算 48 秒／页面约 55 秒。音频直传 OSS 不经过 API。
- `wanwu-storage` timer 每 15 分钟最多检查 20 个活跃登记对象，轮转最久未检查项；不列举／清空 Bucket，不自动更改业务状态。健康检查将未覆盖或超过 24 小时的活跃对象标为 attention；对象较多须调整频率／批量，不应忽略告警。
- 完整健康报告仅在管理员 status 与维护命令中出现；包括两队列、两心跳、备份／清理／对账、新近失败、AI 租约和用量。公开 health 不暴露这些信息。systemd 非零退出可在 `systemctl --failed` / journal 看到；尚未接短信／推送／邮件通知，不能说已经有远程告警。
- AI 队列在 API 进程消费，与媒体 singleton 分开；后台调用不占用 Chromium，队列无付费调用自动重试。API 回滚到旧版前要暂停新的 AI 提交并核对未结束任务；不得为了兼容回滚退回旧 GC。
