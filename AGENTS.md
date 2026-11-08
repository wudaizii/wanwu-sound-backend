# 万物声谱后端与前端交接约定

- 本仓库只运行后端、音频任务和共用契约／算法；前端在 `guohaha777/voice_atalas_v2`，不能重新引入对 `apps/web` 的运行依赖。
- 人先读 `README.md`、`handoff/START_HERE.md`；前端代理再读 `handoff/FRONTEND.md`，后端代理读 `docs/OPERATIONS.md`。
- `handoff/manifest.json` 是五个共享包的逐文件指纹。共享代码只在前端改，用 `scripts/sync-shared.mjs` 同步，`npm run check:shared`（随 build）核对。前端接入补丁已在前端 `2823401f8dce359d502fa141e5cb67d68da3d8b2` 合入，补丁与应用工具已删除。
- 保留既定页面视觉和音乐规则。共享代码只按明确版本同步；修改算法或五维声音参数必须通知前后端两边并重跑音频对照。
- 不生成假登录、假保存、假上传或假分享成功；角色、归属和入库确认只信任服务端会话。
- 私钥、AccessKey、密码、Cookie、签名播放 URL、真实用户录音不进入源码、日志、Issue、前端或交接包。测试只能使用合成音频或已记录来源的内置示例。
- 本仓库的提交／推送不等于部署授权。不自动改 Netlify、域名、OSS 权限或服务器配置，不自动启用认证。
- 共享 ECS 保留旧 ProTerm／Supabase。万物声谱只使用 `/srv/wudaizii/wanwu-sound`、Compose `wanwu-sound`、独立网络／卷／环境，API 为 `127.0.0.1:3100`；旧 3000 端口不动。
- 不读旧项目密钥，不接旧 Supabase，不改 Docker daemon、用户权限、旧 Compose／域名／证书，不重启共享 Docker／Nginx，不全局清理。
- 镜像只在本机／CI 构建；当前部署事实先读 `docs/PRODUCTION_2026-11-09.md`，不能用历史镜像、本机测试或推送成功替代当前生产及完整 H5 验收。
- 开发检查为 `npm test`、`npm run build`；媒体检查另跑 `npm run test:media`。Docker 不可用就记录阻塞，不降低隔离或改用共享 ECS 测试。
- 不删除现有用户文件、重置工作区、强推分支或执行数据库破坏性迁移。文档提供步骤，不代表已得到所有外部写操作的授权。
