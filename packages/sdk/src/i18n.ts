// 语言规则和校验随 SDK 内联，不依赖宿主或服务端运行时。
// eslint-disable-next-line import-x/no-extraneous-dependencies
import { resolveLocale } from "@echo-feedback/contracts/locale";

import type { Locale } from "./types.js";

const zh = {
  trigger: "意见反馈",
  brand: "回声 / FEEDBACK",
  title: "说说你的想法",
  intro: "每一份建议，都让这里变得更好。",
  close: "关闭反馈",
  content: "反馈内容",
  placeholder: "遇到了什么问题，或有什么新的想法？",
  sensitive: "请勿填写密码等敏感信息",
  images: "添加图片",
  optional: "选填",
  selectImages: "选择反馈图片",
  imageHint: "最多 {count} 张 · JPG / PNG / WebP · 每张 {size} MiB",
  contact: "联系方式",
  contactPlaceholder: "方便我们进一步了解问题",
  submit: "提交反馈",
  pending: "正在提交…",
  sending: "请稍候，你的反馈正在送达。",
  retry: "重试本次提交",
  received: "已收到你的反馈",
  thanks: "谢谢你，让每一个细节都有回声。",
  done: "完成",
  required: "请先填写反馈内容。",
  maxImages: "最多添加 {count} 张图片。",
  invalidImage: "请选择 {size} MiB 以内的 JPG、PNG 或 WebP 图片。",
  imageAlt: "待提交图片",
  remove: "移除",
  removeImage: "移除图片",
  PROJECT_UNAVAILABLE: "该项目已暂停接收反馈。",
  ORIGIN_DENIED: "当前页面尚未获准接入，请联系项目管理员。",
  RATE_LIMITED: "提交有些频繁，请稍后重试。",
  INVALID_INPUT: "请检查正文和选填信息是否超出限制。",
  IMAGE_TOO_LARGE: "图片过大，请选择 {size} MiB 以内的图片。",
  INVALID_IMAGE: "图片无法处理，请选择静态 JPG、PNG 或 WebP 图片。",
  PAYLOAD_TOO_LARGE: "附件总量过大，请减少图片后重试。",
  STORAGE_FULL: "服务的附件空间不足，请稍后重试。",
  IDEMPOTENCY_CONFLICT: "本次提交信息冲突，请关闭面板后重新初始化。",
  uncertain: "暂未确认是否提交成功。内容已保留，重试不会重复提交。",
  failed: "提交失败，请稍后重试。",
};
export type MessageKey = keyof typeof zh;
const en: Record<MessageKey, string> = {
  trigger: "Feedback",
  brand: "ECHO / FEEDBACK",
  title: "Share your thoughts",
  intro: "Your feedback helps us make things better.",
  close: "Close feedback",
  content: "Feedback",
  placeholder: "What went wrong, or what could we improve?",
  sensitive: "Do not include passwords or sensitive information",
  images: "Add images",
  optional: "Optional",
  selectImages: "Choose feedback images",
  imageHint: "Up to {count} images · JPG / PNG / WebP · {size} MiB each",
  contact: "Contact details",
  contactPlaceholder: "How can we reach you for more details?",
  submit: "Send feedback",
  pending: "Sending…",
  sending: "Please wait while we send your feedback.",
  retry: "Retry this submission",
  received: "Feedback received",
  thanks: "Thank you for helping us improve.",
  done: "Done",
  required: "Please enter your feedback first.",
  maxImages: "You can add up to {count} images.",
  invalidImage: "Choose JPG, PNG or WebP images no larger than {size} MiB.",
  imageAlt: "Image to submit",
  remove: "Remove",
  removeImage: "Remove image",
  PROJECT_UNAVAILABLE: "This project is not accepting feedback right now.",
  ORIGIN_DENIED: "This page is not authorized. Please contact the project administrator.",
  RATE_LIMITED: "Too many submissions. Please try again later.",
  INVALID_INPUT: "Check the length of your feedback and optional details.",
  IMAGE_TOO_LARGE: "Choose images no larger than {size} MiB.",
  INVALID_IMAGE: "Choose static JPG, PNG or WebP images.",
  PAYLOAD_TOO_LARGE: "Attachments are too large. Remove some images and try again.",
  STORAGE_FULL: "Attachment storage is full. Please try again later.",
  IDEMPOTENCY_CONFLICT: "This submission conflicts with an earlier one. Close the panel and reinitialize it.",
  uncertain: "We could not confirm delivery. Your draft is saved; retrying will not submit it twice.",
  failed: "Could not send your feedback. Please try again later.",
};
export function translate(locale: Locale, key: MessageKey, params: Record<string, string | number> = {}) {
  return (locale === "en" ? en[key] : zh[key]).replace(/\{(\w+)\}/g, (token, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : token
  );
}

export function browserLocale(preference: unknown): Locale {
  return resolveLocale(
    preference,
    document.documentElement.lang,
    navigator.languages.length ? navigator.languages : [navigator.language]
  );
}
