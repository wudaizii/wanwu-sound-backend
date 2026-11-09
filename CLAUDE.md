# 万物声谱：给 Claude Code 的入口

先完整阅读 `AGENTS.md`、`README.md`、`handoff/START_HERE.md`。

如果你负责原前端仓库：再读 `handoff/FRONTEND.md`、`handoff/BACKEND_BOUNDARY.md`（正式 ECS H5、同源 API 与职责分离）。不要在本仓库重新实现页面。前端接入补丁已合入前端，不再需要应用；共用包在前端改，再用 `scripts/sync-shared.mjs` 同步，`npm run check:shared` 指纹不符就停。

如果你负责后端：读 `docs/ARCHITECTURE.md`、`docs/CONFIGURATION.md`、`docs/OPERATIONS.md`、`docs/STATUS.md`，接口以 `docs/development/api-contract-v0.6.md` 和 `packages/contracts` 为准。

常用检查：`npm ci`、`npm test`、`npm run build`。`build` 是类型和文件完整性检查，Node 24 直接执行 TypeScript；容器构建是单独的 `npm run release:build`。

最新生产事实先读 `docs/PRODUCTION_2026-11-09.md`：后端、迁移、维护及首个管理员已配置，正式 HTTPS／OSS 的后台业务验收通过；真实 H5 页面、老师注册、手机及听感待验收。API 压缩／ETag 修复是单独的网关配置修订，业务镜像仍为 `c05580e4a179`。实现原理见 `docs/P0_HARDENING.md`、`docs/P1_HARDENING.md`。不要重复初始化数据库／管理员、猜测密码或把文档当作新的操作授权。

不搜寻、输出或上传凭据；不替用户做未授权的部署／账号启用；不影响共享 ECS 旧项目。完成后报告实际改动、执行命令、结果和仍需人工处理的配置，不能把未验证项写成通过。
