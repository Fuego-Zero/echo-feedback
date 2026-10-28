# @echo-feedback/sdk

框架无关的匿名反馈面板。只需服务地址和公开 AK，不依赖 React 或宿主登录。

```ts
import { init } from "@echo-feedback/sdk";
const feedback = init({ serverUrl: "https://feedback.example.com", ak: "替换为后台生成的AK" });
feedback.open();
// 页面卸载时：
feedback.destroy();
```

普通网页加载固定版本 /sdk/0.1.0/echo-feedback.iife.js，再调用 EchoFeedback.init(options)。

可选配置：showTrigger（默认 true）、theme（light/dark/system，默认 system）、primaryColor（六位十六进制色）、mountTarget、nonce、userId、projectVersion、onOpen/onClose/onError。open({ userId?, projectVersion? }) 可更新来源信息；结果不明的重试保持原始快照。destroy 可重复调用。

表单风格由宿主选择：`uiStyle: "paper"`（默认，宣纸朱砂）或 `uiStyle: "classic"`（原版经典简洁）。两者都支持明暗主题、上传与重试。未知风格回退为 paper。有效 primaryColor 优先，否则分别使用朱砂 #A64232 或紫色 #6256D9。切换风格需要重新初始化，会丢弃未提交草稿。

正文必填，图片与联系方式选填。图片最多 3 张、每张 5 MiB；只接受静态 JPG/PNG/WebP。来源页面去除 query/hash，非 HTTP(S) 来源留空。用户标识是未验证来源信息。

不采集 Cookie、Token、日志、请求、标题或截图；请求使用 credentials: omit 和 referrerPolicy: no-referrer。草稿只在实例内存中。销毁或刷新会丢弃草稿，网络重试应在原实例中完成。

扩展须将 ESM 本地打包，不能加载远程脚本。宿主 CSP 需允许服务域名的 connect-src、图片 blob:，严格 style-src 可传入已有 nonce。
`uiStyle` 还支持 `celadon`（青瓷竹简，默认主色 #52796A）与 `gilded`（墨夜鎏金，默认主色 #B59A62），均兼容 light/dark/system。墨夜效果使用 gilded + dark。四种风格共用上传与重试逻辑。
`uiStyle` 支持 cyber（霓虹边界）、freedom（自由之翼）、justice（正义之翼），默认主色分别为 #FCEE09、#245BD6、#A62F50，支持明暗模式和主色覆盖。cyber + dark 最接近概念效果。

旧版 `uiStyle: "orbital"` 兼容映射到 `justice`（正义之翼）；新接入请使用 `justice`。
