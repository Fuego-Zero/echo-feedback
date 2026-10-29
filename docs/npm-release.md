# SDK npm 发布

SDK 包信息以 `packages/sdk/package.json` 为准，首次版本为 `0.1.0`。npm 发行与网站镜像部署是两套独立流程；普通 UI 修改不会触发 npm 发布。

## 首次发布

1. 发布人完成 npm 登录、邮箱验证，并拥有包名对应 scope 的发布权限。不要把密码、验证码或 Token 提交到仓库。
2. 运行 `pnpm verify`，再运行 `node tests/sdk/packageSmoke.mjs`。验收包位于 `.tmp/sdk-release/`；重跑前将旧 tgz 移至其他临时目录。
3. 使用 npm 发布该目录中已验收的 tgz：`npm publish <包路径> --access public --ignore-scripts --registry=https://registry.npmjs.org/`。如要求两步验证，由发布人完成。
4. 查询 npm 版本并在空目录安装确认。首次发布成功后配置下述 Trusted Publisher。

## npm Trusted Publisher 配置

进入该 npm 包的 Settings → Trusted Publisher，选择 GitHub Actions：

| 字段                 | 值                               |
| -------------------- | -------------------------------- |
| Organization or user | `Fuego-Zero`                     |
| Repository           | `echo-feedback`                  |
| Workflow filename    | `release-sdk.yml`                |
| Environment          | 留空（工作流未设置 environment） |
| Allowed actions      | 允许直接 `npm publish`           |

使用 GitHub 托管 Ubuntu runner；发布任务仅申请 `id-token: write` 与仓库读取权限。npm CLI 固定为支持 OIDC 的 `11.6.2`。不配置长期 `NPM_TOKEN`。

## 后续版本

1. 从 main 创建功能分支，完成 SDK 修改并增加 `packages/sdk/package.json` 的版本号，更新 SDK README 中受影响的用法。
2. 通过 PR 合入 main，Release SDK 工作流检测版本变更，执行 `pnpm verify`。
3. 打包后校验文件白名单、独立安装、ESM 导入、SSR 初始化和 TypeScript 声明。构建任务上传已验证 tgz，发布任务下载同一个包，不再构建或安装项目依赖。
4. 使用 npm OIDC 发布并附带 provenance；正式版本使用 `latest`，带预发行后缀的版本使用 `next`。每个版本只能发布一次；不覆盖已存在的不同内容。
5. 工作流串行运行。重复发布相同完整性哈希的包跳过发布；不同包占用相同版本号时失败，需增加版本号。

手动补发：在 main 运行 Release SDK，输入与 main 中 SDK 一致的版本号。首次包未建立或 npm Trusted Publisher 未配置时，OIDC 发布不能视为已就绪；不要用没有执行过的发布记录充当验收。

若 SDK 的 script 分发版本也发生变化，须同步后台接入代码、Web 静态路由及集成文档中的版本路径；npm 版本发布本身不会自动调整网站的 script 路径。

参考：[npm Trusted Publishing 官方文档](https://docs.npmjs.com/trusted-publishers/)。
