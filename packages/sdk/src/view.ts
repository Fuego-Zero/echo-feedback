// contracts 常量随 SDK 构建内联。
// eslint-disable-next-line import-x/no-extraneous-dependencies
import { limits } from "@echo-feedback/contracts/limits";

import brandMark from "../../../assets/brand/echo-mark.svg?raw";
import classicCss from "./classic.css?inline";
import { accentColors } from "./colors.js";
import futuristicCss from "./futuristic.css?inline";
import { type MessageKey, translate } from "./i18n.js";
import literaryCss from "./literary.css?inline";
import css from "./panel.css?inline";
import type { FeedbackOptions, Locale } from "./types.js";

const styles = {
  paper: { accent: "#A64232", readable: "#8B3024" },
  classic: { accent: "#6256D9", readable: "#5145B8" },
  celadon: { accent: "#52796A", readable: "#35594B" },
  gilded: { accent: "#B59A62", readable: "#715927" },
  cyber: { accent: "#FCEE09", readable: "#655D00" },
  freedom: { accent: "#245BD6", readable: "#2450B5" },
  justice: { accent: "#A62F50", readable: "#8B2643" },
} satisfies Record<Exclude<NonNullable<FeedbackOptions["uiStyle"]>, "orbital">, { accent: string; readable: string }>;

export function createView(options: FeedbackOptions, locale: Locale) {
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
  trigger.dataset.efText = "trigger";
  trigger.hidden = options.showTrigger === false;
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "ef-title");
  // 模板是固定常量；所有用户内容通过表单值或 textContent 写入。
  dialog.innerHTML = `<div class="layout"><header>
    <p class="eyebrow"><span class="brand-symbol" aria-hidden="true">${brandMark}</span><span data-ef-text="brand"></span></p><h2 id="ef-title" data-ef-text="title"></h2>
    <p class="intro" data-ef-text="intro"></p><button class="close" data-ef-label="close" type="button">×</button>
    </header><form novalidate><div class="body"><label for="ef-content" data-ef-text="content"></label>
    <textarea id="ef-content" data-ef-placeholder="placeholder" maxlength="2000" required></textarea>
    <div class="hint"><span data-ef-text="sensitive"></span><span class="count">0 / ${limits.content}</span></div>
    <div class="field-title"><span data-ef-text="images"></span><span class="optional" data-ef-text="optional"></span></div>
    <div class="photos"><button class="add" type="button"><span>＋</span><span class="add-label" data-ef-text="images"></span></button></div>
    <input class="file" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden data-ef-label="selectImages">
    <p class="file-hint" data-ef-text="imageHint"></p><label for="ef-contact"><span data-ef-text="contact"></span> <span class="optional" data-ef-text="optional"></span></label>
    <input class="contact" id="ef-contact" maxlength="200" data-ef-placeholder="contactPlaceholder" autocomplete="off"></div>
    <footer><p class="status" role="status" aria-live="polite"></p><button class="submit" type="submit" data-ef-text="submit"></button></footer></form>
    <section class="success" hidden><div class="success-icon" aria-hidden="true">✓</div><h2 data-ef-text="received"></h2><p data-ef-text="thanks"></p><button class="submit done" type="button" data-ef-text="done"></button></section></div>`;
  dialog.querySelector("textarea")!.maxLength = limits.content;
  dialog.querySelector<HTMLInputElement>(".contact")!.maxLength = limits.contact;
  shadow.append(trigger, dialog);
  const applyLocale = (language: Locale) => {
    host.lang = language;
    dialog.lang = language;
    const params = { count: limits.images, size: limits.imageBytes / 1024 / 1024 };
    for (const [attribute, target] of [
      ["efText", "textContent"],
      ["efLabel", "aria-label"],
      ["efPlaceholder", "placeholder"],
      ["efAlt", "alt"],
    ] as const) {
      shadow
        .querySelectorAll<HTMLElement>(`[data-${attribute.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}]`)
        .forEach(node => {
          const value = translate(language, node.dataset[attribute] as MessageKey, params);
          if (target === "textContent") {
            node.textContent = value;
          } else {
            node.setAttribute(target, value);
          }
        });
    }
  };

  applyLocale(locale);
  const get = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  (options.mountTarget ?? document.body).append(host);
  return {
    host,
    applyLocale,
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
