# 三项目接入与验收

三个宿主使用独立 AK 和同一服务地址，不对接各自登录体系。

| 宿主            | 最小接入                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 岁时记          | React 中 npm 导入，挂载 init、卸载 destroy；传现有 CSP nonce，connect-src 加服务域名、img-src 允许 blob:                       |
| 风铃公会 Web/H5 | HTML 外壳加载固定版本 IIFE，mountTarget 为 #stage；自有按钮触发，onClose 让 canvas.focus()；不暂停游戏                         |
| 芸笺            | SDK ESM 随 WXT 扩展本地打包，Chrome/Firefox 只声明服务域名 host_permissions，项目开启扩展；不访问扩展存储、书签或 GitHub Token |

回声没有修改这些宿主仓库。tests/e2e/host.html 是严格 CSP、强宿主样式、表单、键盘与全屏容器的兼容夹具，不等于已安装到实际三个项目。

风铃示意：

```js
const feedback = EchoFeedback.init({
  serverUrl: "https://feedback.example.com",
  ak: "项目AK",
  mountTarget: document.querySelector("#stage"),
  showTrigger: false,
  onClose: () => document.querySelector("canvas")?.focus(),
});
```

Godot 若在捕获阶段监听全局键盘，宿主应在打开面板时把游戏输入交给面板、关闭时恢复。SDK 不覆盖宿主全局事件函数，不改变游戏运行状态。Windows 原生客户端不在范围内。

芸笺将以下配置合入已有 manifest，并按当前 WXT 输出核对 CSP：

```json
{ "host_permissions": ["https://feedback.example.com/*"] }
```

不能远程加载 SDK 代码。扩展请求 Origin 差异由扩展开关兼容，不以扩展 ID 作为认证。

## 发布前人工验收

- [ ] 岁时记真实构建页面：CSP、主题、表单、导航、滚动正常。
- [ ] 风铃 PC/H5：全屏、输入隔离、关闭恢复画布焦点、游戏运行状态不变。
- [ ] 芸笺 Chrome/Firefox 实际安装：本地打包、不依赖远程脚本、不采集扩展数据。
- [ ] iOS Safari 16.4+ 真机：图片选择、软键盘、安全区域、提交按钮可达。
- [ ] Android Chrome 真机：上述场景。模拟移动视口不替代真机。
- [ ] 目标机 HTTPS、真实 IP、可信代理、重建保留数据、恢复后图片可读。

自动化实际结果保存在 .tmp/verification-results 和 .tmp/playwright；未执行项不能标成通过。
