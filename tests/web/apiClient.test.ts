import { afterEach, expect, it, vi } from "vitest";

import { api } from "../../apps/web/src/api/client.js";

afterEach(() => vi.unstubAllGlobals());

it.each([
  [{ code: "SERVICE_BUSY" }, "SERVICE_BUSY"],
  [{ message: "不能直接展示服务端文案" }, "REQUEST_FAILED"],
  [{ code: "" }, "REQUEST_FAILED"],
  [null, "REQUEST_FAILED"],
])("失败响应 %j 保留非空错误码，交由当前界面语言翻译", async (body, code) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 503 })));
  await expect(api("/admin/feedback")).rejects.toThrow(code);
});
