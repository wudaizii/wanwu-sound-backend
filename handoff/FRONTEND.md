# 前端接入：验证、发布与联调

前端仓库：[guohaha777/voice_atalas_v2](https://github.com/guohaha777/voice_atalas_v2)。本仓库不接管它的所有权或发布权限。

## 1. 接入包已经合入

2026-10-29 的前端接入补丁（基线 `35000af3005609b6b02356023dba680233d69cd8`，91 个文件）已在前端提交 `2823401f8dce359d502fa141e5cb67d68da3d8b2`（分支 `integrate/wanwu-backend-v1`）原样合入。2026-10-31 逐文件核对：该提交里 91 个文件与补丁预期指纹全部相同。补丁、`frontend-handoff.mjs` 及其测试因此从本仓库删除；需要查原文时看本仓库提交 `4c6a996`。

合入的内容：

- 真实 Cookie／CSRF 账号客户端、注册登录／改密／恢复入口；不会返回假登录成功。
- 云端草稿、冲突副本、原始录音保留与上传进度、素材库试听确认、书架／成品任务、匿名分享页、最小管理页面。
- 根 `netlify.toml`：API 代理在前、SPA 回退在后；移除了会抢先拦截 API 的旧 `apps/web/public/_redirects`。

之后前后端共用的 `packages/`（contracts、sound-rules、audio-engine、prompts、music-features）只在前端改，再在本仓库运行 `node scripts/sync-shared.mjs /absolute/path/to/frontend`（先加 `--dry-run` 看差异）；`npm run build` 里的 `check:shared` 核对逐文件指纹（`manifest.json` 的 `sharedFiles`）。不要在一端单独改。

## 2. 在前端仓库验证

```sh
npm ci
npm test
npm run build
# 首次本机可能需要安装对应 Chromium：
npx playwright install chromium
npm run test:ui
```

构建产物为 `apps/web/dist`。页面／屏宽场景覆盖基础布局，但不等于真实登录、手机麦克风或云端保存通过。

## 3. 正式域名与同源代理（2026-11-08 更新）

当前正式站点为 `https://wanwu.proterm.ink`，H5 静态文件与后端在 ECS，由 Nginx 在 `/api/v1/` 做同源代理。构建仍在本机／CI，输出 `apps/web/dist`，不在共享 ECS 构建。前后端独立发布；本轮后端优化不改前端源码／样式，也不自动发布网站。

后端仓库提供两入口共同引用的 `deploy/runtime/wanwu-api-routes.nginx.conf.example`，由获授权的后端维护者审核后配置；不要让 SPA 回退拦截 API。历史 Netlify 配置不是当前正式部署的前提；如将来恢复使用，须单独确认 Origin、Cookie、跨域及代理时限，不能照抄旧站点就发布。

前端不需要 `VITE_OSS_ACCESS_KEY`、数据库 URL 或后端会话密钥，也不要把 API 客户端改成跨源 fetch。预览域名不在当前精确 Origin／CORS 范围内时，不能用预览站登录失败证明生产站不可用，或私自放开通配符。

发布之后在本仓库运行 `node scripts/probe-deployment.mjs`。前端健康必须是 JSON；后端认证关闭时探测会明确阻塞，不能忽略退出码。

## 4. 与后端维护者联调

前端路由正确后，把真实 Origin 和发布时间给后端维护者；由其只读核实管理员与认证状态、核对精确代理 IP，并按具体授权处理缺项。不能默认新建账号或修改已有密码。前端作者不需要 root 或任何生产凭据。

双方按 [ACCEPTANCE.md](ACCEPTANCE.md) 验收。联调报告要写清：前端提交 SHA、发布分支、部署 URL、JSON 代理检查、Cookie／CSRF、上传、草稿冲突、成品和分享／撤销的实际结果。

## 5. 本轮后端职责拆分

人和 Claude Code 都再读 [前后端边界与接入增量](BACKEND_BOUNDARY.md)。既有接口保持兼容；任务持久化、预算和校验是后端内部改动。新增作品事实／使用量接口需前端以后明确接入，不能声称当前线上页面已使用。本轮没有同步修改五个共享包。
