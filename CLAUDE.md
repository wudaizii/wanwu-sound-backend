# 万物声谱：给 Claude Code 的入口

先完整阅读 `AGENTS.md`、`README.md`、`handoff/START_HERE.md`。

当前分支的前端用量／事实／讲解增量另读 `handoff/FRONTEND_CLOUD_INTEGRATION.md`；前端交付在独立分支中，不能合入后端 main。新分支及本机测试不是新的生产部署事实。

管理员全站配置另读 `docs/ADMIN_CONFIGURATION.md`：`settings/schema.ts` 为目录，ECS JSON 为覆盖源。`live`、`restart`、`deployment`、`release` 生效方式不同；后两类不能保存后假称已应用。音乐及契约发布草稿仍须在前端更新共享包、同步后端并过音频门禁。应用部署参数只允许受控运维命令，不给 API root 或 Docker socket。

如果你负责原前端仓库：再读 `handoff/FRONTEND.md`、`handoff/BACKEND_BOUNDARY.md`（正式 ECS H5、同源 API 与职责分离）。不要在本仓库重新实现页面。前端接入补丁已合入前端，不再需要应用；共用包在前端改，再用 `scripts/sync-shared.mjs` 同步，`npm run check:shared` 指纹不符就停。

如果你负责后端：读 `docs/ARCHITECTURE.md`、`docs/CONFIGURATION.md`、`docs/OPERATIONS.md`、`docs/STATUS.md`，接口以 `docs/development/api-contract-v0.6.md` 和 `packages/contracts` 为准。

常用检查：`npm ci`、`npm test`、`npm run build`。`build` 是类型和文件完整性检查，Node 24 直接执行 TypeScript；容器构建是单独的 `npm run release:build`。

最新生产事实先读 `docs/PRODUCTION_2026-11-22.md`：运行镜像 `bfe43bfcd2f9`、10 条迁移，132 项管理员配置及真实浏览器登录／保存／应用／恢复通过。配置采用 ECS 私密 JSON，受控宿主应用器只操作本项目；协议与音乐草稿仍须同步发版。原 H5 的整体教学、注册、手机及听感验收范围与本管理页分开。此前正式 HTTPS／OSS 的后台业务、备份恢复和网关 ETag 证据保留在 11-09 文档。不要重复初始化数据库／管理员、猜测密码或把文档当作新的操作授权。

不搜寻、输出或上传凭据；不替用户做未授权的部署／账号启用；不影响共享 ECS 旧项目。完成后报告实际改动、执行命令、结果和仍需人工处理的配置，不能把未验证项写成通过。
