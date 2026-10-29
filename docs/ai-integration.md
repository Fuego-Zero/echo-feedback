# 给 AI 的回声 SDK 快速接入指南

## 宿主语言同步

使用包含多语言功能的新版 SDK 构建后，可设置 `locale: "auto" | "zh-CN" | "en"`。有自己的语言状态时，在每次 `feedback.open({ locale: 当前语言 })` 中传入规范化语言；使用 SDK 自带悬浮按钮时，在宿主切换语言时调用 `feedback.setLocale(当前语言)`。不要销毁重建 SDK 来切换语言，这会丢弃草稿并中断原提交意图。

自动模式依次参考宿主 `<html lang>`、浏览器偏好，最后回退简体中文。打开后不会被动切换；`setLocale()` 原地更新文案并保留文字、图片、焦点和重试快照。单次 `open` 的语言优先于实例配置，下一次未传则重新按实例配置解析。以实际交付产物为准，不假设现有 npm 版本已包含新增接口。

本文用于指导其他 AI 在**宿主项目**中接入回声反馈 SDK。目标是复用现有 SDK 完成反馈入口、表单、图片提交和生命周期管理，不重写反馈面板或上传协议。

无需先了解回声服务端工程；取得下方配置和 `@echo-feedback/sdk` 产物即可开始。SDK 安装包以实际交付文件为准，script 地址从目标回声后台复制，不根据本文推断版本或拼接地址。示例中的地址与 AK 都是占位符，必须替换后才能运行。

## 1. 接入前确认四项信息

| 信息                 | 要求                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 服务地址 `serverUrl` | 回声服务的完整 Origin，例如 `https://feedback.example.com`，不要带 `/api`、子路径、查询参数或 hash；HTTPS 宿主使用 HTTPS 服务 |
| 项目标识 `ak`        | 从回声后台“项目接入”获取，该项目必须启用；使用后台生成的 43 位标识，不自行生成或截断                                          |
| SDK 来源             | 已构建的 `.tgz` 文件，或该服务提供的固定版本 IIFE 脚本；不要假设已发布到公共 npm registry                                     |
| 宿主接入位置         | 技术栈、运行环境（网页/SSR/扩展/游戏）、现有反馈按钮或是否需要默认浮动入口                                                    |

AK 是公开项目标识，可以出现在前端；它不是管理员密钥。接入不需要管理员密码、SETUP_TOKEN、登录 Cookie 或访问 Token。

先检查宿主的工程说明、包管理器、入口组件与 CSP。如果现有配置可直接读取，就不要重复询问。缺少服务地址、真实项目 AK 或 SDK 产物时，明确列出缺项；可以先完成带占位配置的代码，但不能声称提交已验证。

在回声后台检查“允许来源”：填写宿主的精确 Origin（协议、主机、端口，不带路径），本地与生产来源分别配置。空列表允许任意有效 HTTP(S) Origin，不要为了绕过失败擅自清空已有白名单。浏览器扩展还需要开启该项目的扩展接入选项。

## 2. 选择安装方式

### 有构建工具的网页：本地 npm 包

使用宿主已有的包管理器安装收到的产物，例如：

```sh
pnpm add "/absolute/path/to/<实际交付的SDK安装包文件名>.tgz"
```

如果有回声源码，以下命令在**回声仓库**执行，不能在宿主仓库照抄执行：

```sh
pnpm --filter @echo-feedback/sdk build
pnpm --dir packages/sdk pack --pack-destination ../../.tmp/packages
```

将生成的 tgz 交付给宿主项目，再安装；上方安装命令中的路径和文件名必须替换为实际文件。宿主不能依赖回声工作区内部路径，也不需要安装 contracts、runtime 或 Ant Design。

### 无构建工具的网页：固定版本 script

在目标回声后台的“项目接入”中打开该项目的“SDK 接入”，复制“普通 script”代码，使用其中的完整脚本地址替换下方 `src` 占位符，不自行拼接版本路径。将脚本放在页面 DOM 之后，或通过宿主已有的脚本加载机制等待加载完成：

```html
<script src="替换为回声后台提供的完整SDK脚本地址" referrerpolicy="no-referrer"></script>
<script>
  const feedback = EchoFeedback.init({
    serverUrl: "https://feedback.example.com",
    ak: "替换为后台生成的项目AK",
    showTrigger: true,
    theme: "system",
    uiStyle: "paper",
  });
  // 所在视图卸载时调用 feedback.destroy()。
</script>
```

上述内联脚本示例不能直接用于禁止内联脚本的站点；严格 CSP 时使用宿主已有 nonce 或获准的本地脚本，不添加 unsafe-inline。

## 3. 最小调用与生命周期

```ts
import { init } from "@echo-feedback/sdk";

const feedback = init({
  serverUrl: "https://feedback.example.com",
  ak: "替换为后台生成的项目AK",
  showTrigger: true,
  theme: "system",
  uiStyle: "paper",
  onError: error => console.warn("回声 SDK 异常", error.message),
});

// 需要自有入口时设置 showTrigger: false，在该入口点击时调用：
feedback.open();
// 可在打开时提供可选上下文，不要求接入宿主登录：
feedback.open({ userId: "可选的非敏感用户标识", projectVersion: "1.0.0" });
// 视图卸载时释放节点、监听器、图片 URL 和在途请求：
feedback.destroy();
```

在浏览器 DOM 可用后初始化，一处反馈入口持有一个实例，不要每次点击或每次渲染都调用 init。重复 open 不会叠加弹窗；destroy 可重复调用，销毁后的实例不能再次打开。路由切换时若根布局继续存在，可以保持根布局中的实例。

SDK 的公开方法只有 `init(options)`、实例的 `open(context?)` 与 `destroy()`。没有公开 `submit`、`close`、`setTheme`、`updateOptions` 或 `onSuccess`，不要编造这些 API。

SSR 中导入没有 DOM 副作用，服务端 init 返回空实例；它不会在客户端自动激活，因此仍须在客户端挂载后重新 init。

### React / Next.js 客户端组件

在已有根布局或持久组件中使用；配置由宿主现有配置层提供，服务地址和 AK 不是服务端秘密。

```tsx
"use client";

import { init, type FeedbackInstance } from "@echo-feedback/sdk";
import { useEffect, useRef } from "react";

export function FeedbackEntry({ serverUrl, ak }: { serverUrl: string; ak: string }) {
  const instance = useRef<FeedbackInstance | null>(null);

  useEffect(() => {
    const feedback = init({ serverUrl, ak, showTrigger: false, theme: "system", uiStyle: "paper" });
    instance.current = feedback;
    return () => {
      instance.current = null;
      feedback.destroy();
    };
  }, [serverUrl, ak]);

  return (
    <button type="button" onClick={() => instance.current?.open()}>
      意见反馈
    </button>
  );
}
```

示例按钮仅演示绑定，实际接入应复用宿主已有按钮或组件库。不要为反馈接入另写宿主的基础组件。开发环境 StrictMode 会执行挂载/清理检查，保留上述清理逻辑。

### Vue 3

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount } from "vue";
import { init, type FeedbackInstance } from "@echo-feedback/sdk";

let feedback: FeedbackInstance | undefined;
onMounted(() => {
  feedback = init({
    serverUrl: "https://feedback.example.com",
    ak: "替换为后台生成的项目AK",
    showTrigger: false,
  });
});
onBeforeUnmount(() => feedback?.destroy());
function openFeedback() {
  feedback?.open();
}
</script>

<template>
  <button type="button" @click="openFeedback">意见反馈</button>
</template>
```

同样将示例按钮替换为宿主现有入口，不必改动 SDK 内部组件。

## 4. 配置速查

| 配置                       | 用途与默认值                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `serverUrl`、`ak`          | 必填，见第 1 节                                                                       |
| `showTrigger`              | 默认 true，显示浮动入口；已有宿主入口时用 false                                       |
| `theme`                    | `light` / `dark` / `system`，默认 system                                              |
| `uiStyle`                  | 默认 paper；见下方皮肤列表                                                            |
| `primaryColor`             | 可选，六位十六进制色，如 `#A64232`；有效时覆盖皮肤主色，否则回退；文字明暗由 SDK 处理 |
| `mountTarget`              | 可选 HTMLElement，默认 document.body；全屏游戏挂到全屏容器内                          |
| `nonce`                    | 可选，使用宿主已有 CSP nonce，不能随意伪造                                            |
| `userId`、`projectVersion` | 可选字符串，最多 128 / 64 字符；open 时也可传入，不传用户标识即可匿名使用             |
| `onOpen`、`onClose`        | 无参数回调，可协调游戏输入、关闭后恢复焦点                                            |
| `onError`                  | 接收 Error 的异常回调；不是提交成功回调，表单错误仍由面板展示                         |

可用皮肤：`paper` 宣纸朱砂、`classic` 经典简洁、`celadon` 青瓷竹简、`gilded` 墨夜鎏金、`cyber` 霓虹边界、`freedom` 自由之翼、`justice` 正义之翼。全部支持明暗模式，未知值回退 paper。旧 orbital 兼容映射 justice，新接入不要再用 orbital。

皮肤配置属于宿主 init 参数，后台皮肤选择只影响生成的接入代码，不会远程改变已初始化的面板。更换初始化配置需要销毁并重建实例，会丢失未提交草稿；不要在输入或提交重试期间自动重建。

## 5. CSP、全屏与扩展

- SDK 以原生 DOM + Shadow DOM 实现，框架无关；保留这套实现，不将后台 Ant Design 或宿主全局 CSS 注入 SDK。
- 严格 CSP：传入宿主现有 nonce；允许回声服务的 connect-src 与图片预览的 img-src blob:。使用远程 IIFE 时，还须允许相应脚本来源或采用宿主获准的脚本加载策略。
- 不添加任意来源、unsafe-inline 或宽泛权限来解决 CSP 错误。强制 Trusted Types 的宿主需要单独评估现有固定 HTML 模板的策略兼容性，未验证时明确报告。
- 全屏游戏：mountTarget 指向已存在的全屏容器。宿主若在捕获阶段处理键盘，应通过 onOpen/onClose 协调输入；SDK 不负责暂停游戏。必要时 onClose 恢复 canvas 焦点，canvas 本身需可聚焦。
- 浏览器扩展：将 ESM 随扩展本地打包，不远程加载 SDK 脚本；host_permissions 只声明目标服务，例如 `https://feedback.example.com/*`；后台开启扩展接入。不要读取扩展存储、书签或账号 Token 来提交反馈。

## 6. 不要做的事情

- 不重写反馈表单、弹窗、选图、上传或重试逻辑，不直接绕过 SDK 调用提交接口。
- 不把管理员认证数据、宿主 Cookie、访问 Token、日志、网络请求或自动截图放入反馈。仅上传用户主动选择的图片。
- 不把 userId 当成可信身份，不要求用户先登录回声。
- 不通过“destroy + init”重试失败提交。SDK 原实例会保留快照与幂等键，避免服务已写入但响应丢失时产生重复反馈。
- 不承诺刷新后保留草稿；草稿仅存在于实例内存。页面路径会作为来源提交（去掉 query/hash），敏感信息放在路径里的宿主需要先评估。
- 不修改回声服务端、数据库、SDK 源码或其他宿主项目来绕过接入问题。需要改 SDK 的基础组件时，先列出原因与方案并向用户确认。
- 不自行发布 npm 包、部署服务或推送代码。

## 7. 最小验收与故障定位

用隔离环境或获准的测试项目验收，不把演示数据写入业务库。

1. 宿主构建和类型检查通过；入口只出现一次，控制台无初始化与 CSP 错误。
2. 点击入口能打开；关闭、Esc、再次打开正常；卸载后无残留入口和事件影响。
3. 提交纯文字并看到成功页；管理员在对应项目收到记录。只有面板能打开不等于提交链路通过。
4. 添加、移除图片并提交；支持静态 JPG/PNG/WebP，最多 3 张，每张 5 MiB。确认后台附件可查看。
5. 模拟网络失败后使用面板原有重试；恢复网络后提交成功，后台没有重复记录。
6. 检查 light/dark/system、自定义入口及所选皮肤；窄屏、软键盘、全屏容器不遮挡提交按钮。
7. 原宿主的布局、输入、路由、滚动、快捷键和游戏状态保持正常。

| 现象                   | 优先检查                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| 不显示入口或点击无反应 | 是否在客户端 init；是否 showTrigger:false 却未绑定 open；是否误用已销毁实例；onError 是否报告 INVALID_CONFIG |
| INVALID_CONFIG         | serverUrl 是否为纯 HTTP(S) Origin；AK 是否为完整后台标识                                                     |
| 来源被拒绝             | 实际 Origin 与后台白名单是否精确一致；扩展接入开关是否开启                                                   |
| 网络错误 / CSP 阻止    | HTTPS 混合内容、服务可达性、connect-src、nonce、脚本来源和 img-src blob:                                     |
| 项目停用 / 限流        | 后台项目状态、请求频率；不要自动循环重试                                                                     |
| 全屏时不可见           | mountTarget 是否位于实际全屏元素内                                                                           |

交付说明必须列出修改文件、配置位置、接入方式、执行的验证和未验证项。将“浏览器自动化”“真实宿主联调”“手机真机”分开报告；没有执行的项目写未验证。

## 可直接交给其他 AI 的任务模板

```text
请按《回声 SDK 快速接入指南》在当前宿主项目接入反馈功能。
服务地址：<serverUrl>
项目 AK：<ak>
SDK 产物：<tgz 路径或固定版本脚本地址>
入口位置：<现有按钮位置或默认浮动入口>
外观：uiStyle=<paper 等>，theme=<system 等>

先阅读本项目工程规范并确认运行环境，复用现有按钮与配置方式。
调用 SDK 的 init/open/destroy，正确管理挂载和卸载，不重写反馈面板。
缺少关键配置时列出缺项，不编造 AK、地址或测试结果。
检查文字和图片提交、关闭、重试及宿主隔离；报告已验证和未验证内容。
不修改其他项目，不自动推送、发布或部署。
```

更多细节：[完整 SDK 文档](sdk.md)、[宿主与验收](integration.md)、[安全边界](security.md)。如持有回声源码，可用 `packages/sdk/src/types.ts` 和 `packages/sdk/src/index.ts` 核对当前公开接口；宿主始终从 `@echo-feedback/sdk` 公开入口导入。
