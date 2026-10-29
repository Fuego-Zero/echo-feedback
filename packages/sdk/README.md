# @echo-feedback/sdk

[English](README.en.md)

框架无关的匿名反馈面板。只需服务地址和公开 AK，不依赖 React 或宿主登录。

```sh
npm install @echo-feedback/sdk
```

安装后在宿主项目中按下方示例导入。公开 npm 包不包含服务端；`serverUrl` 指向已部署的回声服务，`ak` 从管理后台的项目接入页获取。

```ts
import { init } from "@echo-feedback/sdk";
const feedback = init({ serverUrl: "https://feedback.example.com", ak: "替换为后台生成的AK" });
feedback.open();
// 页面卸载时：
feedback.destroy();
```

## 中英文与宿主语言

`locale` 支持 `"auto"`（默认）、`"zh-CN"`（简体中文）和 `"en"`。自动模式每次打开前按宿主 `<html lang>`、浏览器语言偏好依次匹配，最后回退中文。`en-US` 等英文标签归为英文，`zh-TW` 等中文标签首版统一显示简体中文，不提供繁体翻译。

```ts
const feedback = init({
  serverUrl: "https://feedback.example.com",
  ak: "替换为后台生成的AK",
  locale: "auto",
});
feedback.open({ locale: "en", userId: "optional-user", projectVersion: "1.0" });
feedback.setLocale("zh-CN");
```

打开时优先级为：本次 `open({ locale })` > 实例语言 > 宿主页面语言 > 浏览器语言 > 中文。`open({ locale: "auto" })` 可让本次打开重新自动判断，覆盖实例固定语言；单次覆盖不持久化。多语言宿主应在每次打开时传入自己的当前语言，使用 SDK 自带悬浮入口时，应在宿主切换语言时调用 `setLocale()` 同步入口和表单。

打开后不自动跟随页面或浏览器变化。主动调用 `setLocale()` 会原地更新标题、提示、已选图片的标签和当前错误，保留正文、联系方式、图片、焦点及提交状态。提交中和结果不明时仍保持原快照与幂等键，切换语言后重试不会创建新的提交意图。不要通过 `destroy()` 后重新初始化来切换语言。

语言包随 SDK 内置，不额外请求资源、不写入 Cookie/localStorage、不改变宿主页面 `lang`，也不随反馈上传。系统文件选择器使用设备语言。SSR 空实例和销毁后的 `setLocale()` 均为安全空操作。

升级提示：新增配置均可选，但默认自动模式会让英文宿主或英文浏览器显示英文。需要保留旧版固定中文行为时设置 `locale: "zh-CN"`。中英文接口从 0.2.0 提供；升级依赖后使用。

普通网页加载固定版本 /sdk/0.2.0/echo-feedback.iife.js，再调用 EchoFeedback.init(options)。

可选配置：showTrigger（默认 true）、theme（light/dark/system，默认 system）、primaryColor（六位十六进制色）、mountTarget、nonce、userId、projectVersion、onOpen/onClose/onError。open({ userId?, projectVersion? }) 可更新来源信息；结果不明的重试保持原始快照。destroy 可重复调用。

表单风格由宿主选择：`uiStyle: "paper"`（默认，宣纸朱砂）或 `uiStyle: "classic"`（原版经典简洁）。两者都支持明暗主题、上传与重试。未知风格回退为 paper。有效 primaryColor 优先，否则分别使用朱砂 #A64232 或紫色 #6256D9。切换风格需要重新初始化，会丢弃未提交草稿。

正文必填，图片与联系方式选填。图片最多 3 张、每张 5 MiB；只接受静态 JPG/PNG/WebP。来源页面去除 query/hash，非 HTTP(S) 来源留空。用户标识是未验证来源信息。

不采集 Cookie、Token、日志、请求、标题或截图；请求使用 credentials: omit 和 referrerPolicy: no-referrer。草稿只在实例内存中。销毁或刷新会丢弃草稿，网络重试应在原实例中完成。

扩展须将 ESM 本地打包，不能加载远程脚本。宿主 CSP 需允许服务域名的 connect-src、图片 blob:，严格 style-src 可传入已有 nonce。
`uiStyle` 还支持 `celadon`（青瓷竹简，默认主色 #52796A）与 `gilded`（墨夜鎏金，默认主色 #B59A62），均兼容 light/dark/system。墨夜效果使用 gilded + dark。四种风格共用上传与重试逻辑。
`uiStyle` 支持 cyber（霓虹边界）、freedom（自由之翼）、justice（正义之翼），默认主色分别为 #FCEE09、#245BD6、#A62F50，支持明暗模式和主色覆盖。cyber + dark 最接近概念效果。

旧版 `uiStyle: "orbital"` 兼容映射到 `justice`（正义之翼）；新接入请使用 `justice`。
