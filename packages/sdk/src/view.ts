// contracts 常量随 SDK 构建内联。
// eslint-disable-next-line import-x/no-extraneous-dependencies
import { limits } from "@echo-feedback/contracts/limits";

import classicCss from "./classic.css?inline";
import { accentColors } from "./colors.js";
import futuristicCss from "./futuristic.css?inline";
import literaryCss from "./literary.css?inline";
import css from "./panel.css?inline";
import type { FeedbackOptions } from "./types.js";

const styles = {
  paper: { accent: "#A64232", readable: "#8B3024" },
  classic: { accent: "#6256D9", readable: "#5145B8" },
  celadon: { accent: "#52796A", readable: "#35594B" },
  gilded: { accent: "#B59A62", readable: "#715927" },
  cyber: { accent: "#FCEE09", readable: "#655D00" },
  freedom: { accent: "#245BD6", readable: "#2450B5" },
  justice: { accent: "#A62F50", readable: "#8B2643" },
} satisfies Record<Exclude<NonNullable<FeedbackOptions["uiStyle"]>, "orbital">, { accent: string; readable: string }>;

export function createView(options: FeedbackOptions) {
  const host = document.createElement("echo-feedback");
  host.dataset.theme = options.theme ?? "system";
  // 不可信的脚本配置仅映射到内置风格，不拼接任意样式或选择器。
  const requestedStyle = options.uiStyle === "orbital" ? "justice" : options.uiStyle;
  const uiStyle =
    typeof requestedStyle === "string" && Object.hasOwn(styles, requestedStyle) ? requestedStyle : "paper";
  host.dataset.uiStyle = uiStyle;
  if (["cyber", "freedom", "justice"].includes(uiStyle)) {
    host.dataset.uiFamily = "futuristic";
  }

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  if (options.nonce) {
    style.nonce = options.nonce;
  }

  const colors = accentColors(options.primaryColor, styles[uiStyle].accent, styles[uiStyle].readable);
  style.textContent = `${css}${classicCss}${literaryCss}${futuristicCss}:host{--ef-accent:${colors.accent};--ef-on-accent:${colors.foreground};--ef-accent-text-light:${colors.text}}`;
  shadow.append(style);
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "trigger";
  trigger.textContent = "意见反馈";
  trigger.hidden = options.showTrigger === false;
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "ef-title");
  // 模板是固定常量；所有用户内容通过表单值或 textContent 写入。
  dialog.innerHTML =
    '<div class="layout"><header><p class="eyebrow">回声 / FEEDBACK</p><h2 id="ef-title">说说你的想法</h2><p class="intro">每一份建议，都让这里变得更好。</p><button class="close" aria-label="关闭反馈" type="button">×</button></header><form><div class="body"><label for="ef-content">反馈内容</label><textarea id="ef-content" placeholder="遇到了什么问题，或有什么新的想法？" maxlength="2000" required></textarea><div class="hint"><span>请勿填写密码等敏感信息</span><span class="count">0 / 2000</span></div><div class="field-title">添加图片<span class="optional">选填</span></div><div class="photos"><button class="add" type="button"><span>＋</span>添加图片</button></div><input class="file" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden aria-label="选择反馈图片"><p class="file-hint">最多 3 张 · JPG / PNG / WebP · 每张 5 MiB</p><label for="ef-contact">联系方式<span class="optional">选填</span></label><input class="contact" id="ef-contact" maxlength="200" placeholder="方便我们进一步了解问题" autocomplete="off"></div><footer><p class="status" role="status" aria-live="polite"></p><button class="submit" type="submit">提交反馈</button></footer></form><section class="success" hidden><div class="success-icon" aria-hidden="true">✓</div><h2>已收到你的反馈</h2><p>谢谢你，让每一个细节都有回声。</p><button class="submit done" type="button">完成</button></section></div>';
  dialog.querySelector("textarea")!.maxLength = limits.content;
  dialog.querySelector<HTMLInputElement>(".contact")!.maxLength = limits.contact;
  shadow.append(trigger, dialog);
  const get = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  (options.mountTarget ?? document.body).append(host);
  return {
    host,
    shadow,
    trigger,
    dialog,
    form: get<HTMLFormElement>("form"),
    content: get<HTMLTextAreaElement>("textarea"),
    contact: get<HTMLInputElement>(".contact"),
    file: get<HTMLInputElement>(".file"),
    photos: get<HTMLDivElement>(".photos"),
    add: get<HTMLButtonElement>(".add"),
    submit: get<HTMLButtonElement>("form .submit"),
    close: get<HTMLButtonElement>(".close"),
    done: get<HTMLButtonElement>(".done"),
    success: get<HTMLElement>(".success"),
    status: get<HTMLElement>(".status"),
    count: get<HTMLElement>(".count"),
  };
}

export type View = ReturnType<typeof createView>;
