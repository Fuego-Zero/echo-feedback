# SDK 接入

交给其他 AI 实施时，先阅读 [AI 快速接入指南](ai-integration.md)，其中包含配置清单、框架示例和验收步骤。

## npm 包

首版先验收打包产物，不要求发布公共 registry：

```sh
pnpm --filter @echo-feedback/sdk build
pnpm --dir packages/sdk pack --pack-destination ../../.tmp/packages
# 在业务项目中使用生成的 tgz：
npm install /path/to/echo-feedback-sdk-0.1.0.tgz
```

```ts
import { init } from "@echo-feedback/sdk";
const feedback = init({
  serverUrl: "https://feedback.example.com",
  ak: "后台生成的项目AK",
  showTrigger: false,
  theme: "system",
  uiStyle: "paper", // paper：宣纸朱砂；classic：经典简洁
  // primaryColor: "#A64232", // 可选，覆盖所选风格的默认主色
});
document.querySelector("#feedback-button")?.addEventListener("click", () => {
  feedback.open({ userId: "可选的宿主用户标识", projectVersion: "1.0.0" });
});
// 宿主页面或组件卸载时调用 feedback.destroy()。
```

不需要账号、密码、Token、联系方式或 userId。userId 不能作为真实身份凭据。每个业务项目使用独立 AK，统一连接同一回声服务。

## 普通 script

```html
<script src="https://feedback.example.com/sdk/0.1.0/echo-feedback.iife.js" referrerpolicy="no-referrer"></script>
<script>
  const feedback = EchoFeedback.init({
    serverUrl: "https://feedback.example.com",
    ak: "后台生成的项目AK",
  });
</script>
```

严格 CSP 的站点为脚本和 SDK nonce 使用同一现有 nonce。允许回声服务的 connect-src 与本地预览的 img-src blob:。不要为 SDK 放宽为任意来源。若页面强制 Trusted Types，当前固定 HTML 模板需要受认可的策略或调整 SDK 创建方式，正式接入前验证。

## 生命周期和重试

导入无 DOM 副作用；init 在 DOM 可用后调用，SSR 中返回安全空实例。open 不叠加弹窗；destroy 释放节点、监听器、图片 URL 和在途请求，可重复调用。

用户主动选图，仅提交时上传。网络失败或 5xx 后冻结原始快照，重试保持同一 UUID；服务已写入但响应丢失仍返回原回执。明确校验失败后可修改内容重试。不要用销毁并重新初始化的方式重试，否则会产生新的提交意图。

默认 PC 居中弹窗、窄屏全屏面板，跟随系统主题，可指定 light/dark。主色仅接受六位十六进制颜色。按钮文字会按主色亮度选择深浅颜色；文本强调色与焦点色保留可读性回退。页面路径也可能含敏感信息，敏感路由接入前应评估。

## 按项目选择表单风格

宿主通过可选的 `uiStyle` 选择 SDK 的视觉风格，七种风格共用完整的上传、提交、重试、关闭和销毁行为：

| 配置                 | 风格                                                         | 默认主色  |
| -------------------- | ------------------------------------------------------------ | --------- |
| `uiStyle: "paper"`   | 宣纸朱砂：暖白纸面、衬线标题、朱砂印记                       | `#A64232` |
| `uiStyle: "classic"` | 经典简洁：原版白底、无衬线标题、紫色按钮、圆角；暗色为冷墨底 | `#6256D9` |
| `uiStyle: "celadon"` | 青瓷竹简：青绿、暖白与竹叶细节，暗色为深竹绿                 | `#52796A` |
| `uiStyle: "gilded"`  | 墨夜鎏金：旧金与纸色，暗色为深墨绿                           | `#B59A62` |
| `uiStyle: "cyber"`   | 霓虹边界：黄黑与青色点缀，建议 dark                          | `#FCEE09` |
| `uiStyle: "freedom"` | 自由之翼：装甲白、蓝色，红黄细节                             | `#245BD6` |
| `uiStyle: "justice"` | 正义之翼：绯红装甲、陶瓷白与少量橄榄绿                       | `#A62F50` |

省略或传入未知 `uiStyle` 时回退为 `paper`，保持当前默认外观。经典风格沿用原版视觉，同时保留最新的可访问性、图片移除热区和窄屏布局修复。

`theme: "light" | "dark" | "system"` 只控制明暗，默认仍为 `system`，七种风格均支持。有效的六位十六进制 `primaryColor` 优先于风格默认主色；未设置或无效时使用上表主色。按钮文字自动选择深浅色。

复现 C 概念图的夜读气质可使用 `uiStyle: "gilded", theme: "dark"`；风格本身不强制覆盖宿主的明暗设置。

每个接入项目可在自己的 `init` 配置中选择风格，npm 和普通 script 用法相同；后台“SDK 接入”的风格选择会更新复制代码，不写入项目数据库。风格只在初始化时应用，需要切换时销毁旧实例再初始化，会清空未提交表单，不应在提交重试过程中切换。

后续新增风格在 SDK 内扩充 `uiStyle` 联合类型和对应视觉样式，沿用相同表单结构与业务逻辑；不需要改变 HTTP API、数据库或提交协议。未知值始终安全回退，不加载外部样式。

样式继续封装在 Shadow DOM 内；使用系统字体和内联装饰，不新增字体或装饰图片网络请求。升级 SDK 构建产物会改变默认外观，宿主应重新检查明暗主题、输入焦点和移动端布局。

旧版 `uiStyle: "orbital"` 兼容映射到 `justice`（正义之翼）；新接入请使用 `justice`。

## 项目启停与删除

项目列表的「采集」列使用开关直接启停；停用后拒绝新反馈，已有反馈仍可查阅。删除按钮直接执行逻辑删除：从项目管理和接入选项中隐藏，原 AK 不再接受提交；项目、历史反馈和图片均保留，不提供界面恢复入口。

管理员接口 `DELETE /api/admin/projects/:id` 返回 `{ deleted: true }`。删除操作沿用登录和来源校验。数据库通过新增迁移记录 `deleted_at`；现有项目不受影响。
