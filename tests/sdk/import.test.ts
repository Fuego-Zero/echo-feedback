import { expect, it } from "vitest";

import { init } from "../../packages/sdk/src/index.js";

it("SSR 导入和无 DOM 初始化不会访问宿主或抛错", () => {
  expect(typeof document).toBe("undefined");
  expect(() => {
    const instance = init({ serverUrl: "https://feedback.example.com", ak: "a".repeat(43) });
    instance.open();
    instance.destroy();
    instance.destroy();
  }).not.toThrow();
});
