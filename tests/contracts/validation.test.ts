/* 恶意协议只作为被拒绝的测试输入。 */
/* eslint-disable no-script-url */
import { feedbackInputSchema, sanitizeSourcePage } from "@echo-feedback/contracts";
import { expect, it } from "vitest";

it("来源地址不含凭据、参数或 hash，非网页来源为空", () => {
  expect(sanitizeSourcePage("https://user:pass@example.com/a?token=abc#secret")).toBe("https://example.com/a");
  for (const value of [
    "chrome-extension://abcdef/popup.html",
    "moz-extension://abc/index.html",
    "file:///secret",
    "invalid",
    "javascript:alert(1)",
  ]) {
    expect(sanitizeSourcePage(value)).toBe("");
  }
});
it("正文必填且禁止不在协议内的采集字段", () => {
  expect(feedbackInputSchema.safeParse({ content: "   " }).success).toBe(false);
  expect(feedbackInputSchema.safeParse({ content: "test", cookies: "secret" }).success).toBe(false);
  expect(feedbackInputSchema.parse({ content: " test " }).content).toBe("test");
});
