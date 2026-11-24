# 构建与后续部署

用户已将此前首页部署至 https://voiceatalas.netlify.app/ 。本轮手绘标题及开场修正仅在本机验收，尚未更新线上。源码仓库：https://github.com/guohaha777/voice_atalas_v1 。此前首次推送授权不代表自动发布后续改动。

1. `npm ci` 安装锁定依赖。
2. `npm test`、`npm run build`。正式网页文件全部在 `apps/web/dist/`。
3. `npm run preview` 本机检查正式产物，不把开发服务器作为公开服务。
4. 用户确认发布后再选国内托管、域名和 HTTPS；不要把项目根目录直接作为站点根目录。

发布静态目录时建议：HTML 短缓存 / 每次验证；带内容哈希的 `/assets/`、`/media/` 文件长缓存；开启 gzip / Brotli。页面后续新增真正路由后，需要配置 SPA 回退到 `index.html`，保留真实资源的 404。录音与账号功能接入时使用 HTTPS 和服务端鉴权，不把模型密钥放在构建环境的公开变量中。

源码原件、产品文件、设计稿、历史实验室、测试记录均不在 `dist/`。本轮前端没有外部字体或 CDN 运行依赖，声音均从本站按需读取。
