import { type IncomingMessage } from "node:http";

import { expect, it } from "vitest";

import { clientIp } from "../../apps/web/server/proxy.js";

it("只信任配置代理的 X-Real-IP，不信任用户伪造的转发链", () => {
  const request = {
    socket: { remoteAddress: "::ffff:192.0.2.1" },
    headers: { "x-real-ip": "203.0.113.1", "x-forwarded-for": "evil" },
  } as unknown as IncomingMessage;
  expect(clientIp(request, ["127.0.0.1"])).toBe("192.0.2.1");
  expect(clientIp(request, ["192.0.2.1"])).toBe("203.0.113.1");
  request.headers["x-real-ip"] = "invalid";
  expect(clientIp(request, ["192.0.2.1"])).toBe("192.0.2.1");
});
