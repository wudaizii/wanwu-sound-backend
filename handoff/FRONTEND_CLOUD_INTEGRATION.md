# 前端用量、服务端事实与讲解的配套增量

这是待合并的代码交接，不是生产发布记录。本次没有改 ECS、OSS、Nginx、生产账号或数据库；没有构建或替换生产镜像。

## 给人和 Claude Code 的入口

- [前端独立交付分支](https://github.com/wudaizii/wanwu-sound-backend/tree/codex/frontend-cloud-integration-20261124)：分支祖先是原前端仓库，树内仅有前端和共享包。
- [前端完整合并说明](https://github.com/wudaizii/wanwu-sound-backend/blob/codex/frontend-cloud-integration-20261124/docs/development/CLOUD_INTEGRATION_HANDOFF.md)：源码基线、两个提交如何选、跨仓库取回命令、适配入口和测试边界。
- [后端配套分支](https://github.com/wudaizii/wanwu-sound-backend/tree/codex/backend-cloud-ai-integration-20261124)：在后端 `f0fe9ce` 上的增量。

前端账号没有原仓库推送权限，且 GitHub 浏览器连接未成功，故用同一个个人仓库的**不同分支**传递代码。不是把前端放回后端 main，也不是已经创建 fork；不要把前端交付分支合进后端。作者在实际最新前端仓库中 fetch 后，选择 merge 或 cherry-pick。

前端原 main 为 `35000af`；恢复提交 `3d4965a` 来自本地 `536cc4f` 的已有账号／云端代码，并整理为独立前端工作区。前端分支顶端提交 `d505cfa` 是本次功能。作者已有账号适配器时应跳过恢复提交，只取增量，保留其最新 AI／音乐页面源码。我们没有拿到线上后续功能的可编辑源码，不据此声称本分支能完整替代线上前端。

只 cherry-pick 功能提交时，仍须检查作者的独立前端是否已有 `packages/audio-engine` workspace、`esbuild@0.28.2` 和 `playwright@1.64.1`。缺少时按前端交接中的依赖基线步骤补齐，更新其自己的锁文件；浏览器测试不能再依赖后端／worker 的源码。

## 后端的行为变化

1. `Works.facts(actor, id, revision)` 能读取精确匹配的当前草稿，即使它尚无正式保存快照；其他修订仍从不可变快照读取。指定的旧草稿不存在快照时返回 `409 version-conflict`。冻结快照仍校验规则与渲染器版本。
2. facts 增加 `talkBrief`：服务端用已保存的真实体检、编排和共享时序生成音乐发现简报。没有事件时为 null；声音只用“声音1”等编号。不会返回孩子姓名、素材名、采集地点或对象地址。摘要包含此简报。
3. 新增 `POST /api/v1/works/{id}/talk`，只接受 `{revision, inputDigest}`，必须是作品所有者的有效 Cookie 会话。沿用来源／CSRF 校验，校验 `If-Account-Match` 与 `If-Match: workEtag(id, revision)`，后端自己读取事实和生成提示。多余 `facts`／`brief` 等字段返回 400，缺 If-Match 返回 428，不匹配为 412，摘要不匹配为 409。
4. 复用既有文本模型、预算、并发、超时和输出检查；生成前后再次检查账号与作品版本。没有自动付费重试。现有匿名 `/talk/work` 和 `/discovery/work` 语义保持原样，不能据此宣称全部 AI 都已经绑定云作品。

新响应为：

```ts
{
  workId: string;
  revision: number;
  inputDigest: string;
  briefVersion: 'work-talk-brief-v1';
  reply: WorkTalkReply;
  model: string;
  promptVersion: string;
}
```

已存在的 `GET /account/usage` 行为不变，前端开始读取并显示其保守预留语义；没有新增配额规则。没有数据库迁移、新环境变量或新管理员配置项。新 route 的 IP 限流以路由模板计数，不能靠更换 workId 绕过。

## 两端如何保持一致

前端新增 `packages/contracts/src/cloudStatus.ts` 和 `packages/audio-engine/src/discoveries.ts`，分别定义读取契约和抽取原有发现计数。后端同步这两个源文件与对应包 export，并通过现有同步脚本更新 `handoff/manifest.json` 至 127 个共享文件。

后端共享包比本地前端基线更新；本次同步通过临时整合目录保留后端原文件，再放入前端新文件，只改变上述四个文件。不要将旧前端的整套共享包覆盖后端。未来由作者先在实际最新前端合入契约／计数源文件，再按原同步流程 dry-run，并核对没有旧契约／音乐代码回退。

本次不改音频塑形、背景、乐器或混音参数；计数函数阈值与顺序按原前端保留。浏览器即时编辑／试听继续本地运行；已同步作品的讲解依据才来自服务器。签名授权和音源体检仍属后端。

## 本机验证

```sh
npm ci
npm test
npm run build
npm run test:api
WANWU_FRONTEND_DIST=/absolute/path/to/frontend/apps/web/dist npm run test:frontend
```

- 后端单元测试 199 项、类型／素材／127 个共享指纹检查通过。
- 本机独立 PostgreSQL 接口测试 18 项通过，覆盖精确草稿修订、归属隔离、伪造事实／摘要、缺少条件头、关闭模型、非法模型输出和旧草稿生成中被修改；拒绝路径不会调用模型。
- 独立前端 170 项既有测试及 9 项契约／并发测试通过，30 个路由和响应式宽度组合通过，构建通过。
- 真实浏览器与真实本机 PostgreSQL 联调 5 个场景通过：Cookie 登录／用量、指定草稿／匿名引用生成、编辑丢弃迟到 AI、响应式布局、换账号清除私有数据。模型使用确定性替身，付费外呼为 0。

`test:frontend` 是显式的跨仓库测试入口，要求调用者传入独立前端构建绝对路径；API／worker 的运行和构建不读取 `apps/web`。测试检查本机 Unix Docker，创建带资源限制的临时数据库，自己清理，不使用生产配置或共享 ECS。需预装固定 PostgreSQL 镜像与 Playwright 浏览器，缺环境就报错，不降级到生产测试。测试预置合成音频的 ready 状态，不代替 FFmpeg／媒体沙箱验收。

合并与部署顺序：后端维护者合入并受控发布配套接口 → 作者合入实际最新前端并联调 → 验证同源 Cookie、版本冲突、用量语义、私有数据清除和真实模型降级 → 双方另行安排 H5 发布。当前只交付新分支，不自动部署或调整旧站。
