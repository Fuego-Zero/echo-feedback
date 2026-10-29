# 回声 / echo-feedback

轻量、自部署的多项目反馈采集平台。用户只需正文即可匿名提交；项目 AK 是公开接入标识，管理员通过独立账号处理反馈。

## 本地启动

使用 Node.js 22.21.1 和 pnpm 10.28.0：

```sh
pnpm install --frozen-lockfile
pnpm env:init
pnpm build
pnpm start
```

访问 http://127.0.0.1:8730 。在首次初始化页填写本机 .env 的 SETUP_TOKEN，创建管理员；之后初始化入口关闭。密码至少 12 位，含字母和数字。没有默认账号或免登录模式。

开发使用 pnpm dev，修改 SDK 后运行 pnpm --filter @echo-feedback/sdk build。后台「项目接入」提供 npm/script 示例。

## 验证与目录

```sh
pnpm exec playwright install chromium
pnpm verify
```

依次执行类型检查、lint、格式检查、Vitest、构建、Playwright。测试集中于根 tests/；临时数据库、浏览器截图和报告在 .tmp/。SDK 无宿主框架依赖，浏览器仅使用 contracts；runtime 只用于服务端。

- apps/api/src/{auth,projects,feedback}：管理会话、项目和反馈接口。
- apps/web/src/features：管理后台；apps/web/server：静态资源和流式反代。
- packages/contracts：输入协议、字段限制及公共类型。
- packages/runtime：配置、SQLite/Drizzle、SQL 迁移、密码、日志、私有图片存储。
- packages/sdk：原生 TypeScript、Shadow DOM 面板、图片与重试。

工程沿用岁时记的 pnpm、strict TypeScript、React/Ant Design/Vite、Fastify/Zod、SQLite/Drizzle、@fuego0/configs 和 Docker 部署习惯。回声使用独立数据库和文件目录，没有复制日历业务。首版 SQLite 单实例，不支持多副本。

[AI 快速接入指南](docs/ai-integration.md) · [SDK 接入](docs/sdk.md) · [npm 发布流程](docs/npm-release.md) · [配置与部署](docs/deployment.md) · [接口与安全](docs/security.md) · [宿主与验收](docs/integration.md)。

## 管理列表分页

反馈收件箱和项目接入均支持服务端分页，默认每页 20 条，可切换为 5、10、20、50、100 条。分页栏位于列表底部；切换筛选或每页条数时回到第一页，当前末页失效时回到最后一个有效页。

`GET /api/admin/feedback` 和 `GET /api/admin/projects` 接收 `page`、`pageSize`，返回 `{ items, total, page, pageSize }`。页码从 1 开始，每页最大 100 条；反馈接口保留 `projectId` 和 `status` 筛选，`total` 为筛选后的总数。越界页返回空 `items` 和真实总数，非法参数返回 400。

项目列表接口不再一次返回所有项目。反馈筛选使用需登录的 `GET /api/admin/projects/options`，仅返回全部项目的 `id` 和 `name`，不受管理列表当前分页影响。
