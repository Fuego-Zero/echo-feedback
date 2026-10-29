import { describe, expect, it } from "vitest";

import { normalizeLocale, resolveLocale } from "../../packages/contracts/src/locale.js";
import { translate } from "../../packages/sdk/src/i18n.js";

describe("语言选择", () => {
  it.each([
    ["en", "zh-CN", ["zh-CN"], "en"],
    ["zh-CN", "en", ["en-US"], "zh-CN"],
    ["auto", "en-GB", ["zh-CN"], "en"],
    ["auto", "", ["fr-FR", "en-US", "zh-CN"], "en"],
    ["auto", "fr", ["zh-TW", "en"], "zh-CN"],
    ["auto", "", ["fr-FR"], "zh-CN"],
    ["invalid", "en", [], "en"],
    [null, "", [], "zh-CN"],
    [{ locale: "en" }, "zh-CN", ["en"], "zh-CN"],
  ])("配置 %j、页面 %s、浏览器 %j => %s", (preference, page, languages, expected) => {
    expect(resolveLocale(preference, page, languages as string[])).toBe(expected);
  });
  it("规范化地区标签并拒绝未知语言", () => {
    expect(normalizeLocale(" EN-us ")).toBe("en");
    expect(normalizeLocale("zh-Hant-TW")).toBe("zh-CN");
    expect(normalizeLocale("english")).toBeUndefined();
    expect(normalizeLocale(42)).toBeUndefined();
  });
  it("使用参数生成完整句子，不依赖固定图片限制", () => {
    expect(translate("en", "maxImages", { count: 4 })).toBe("You can add up to 4 images.");
    expect(translate("zh-CN", "invalidImage", { size: 2 })).toContain("2 MiB");
  });
});
