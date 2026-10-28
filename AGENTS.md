# 回声工程规范

- 沿用岁时记适用的工程习惯，不修改外部参考项目。
- TypeScript strict；按职责拆分 HTTP、业务、持久化和 UI，不创建无消费者抽象。
- 运行时输入通过 contracts 的 Zod Schema 校验；包间只走公开入口，浏览器不引入 runtime。
- 测试统一放仓库根 tests；临时文件统一放 .tmp，禁止作为生产运行依赖。
- 普通代码文件 camelCase，React 组件 PascalCase，目录及文档 kebab-case。
- 注释及约定式提交的自然语言使用中文；不提交真实密钥、数据库和附件。
- 完成前运行 pnpm verify，明确区分自动化、真实宿主联调和手机真机结果。
- 不自动推送、发布、部署或修改其他项目。
