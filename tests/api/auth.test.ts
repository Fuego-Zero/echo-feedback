import { hashToken } from "@echo-feedback/runtime";
import { afterEach, expect, it } from "vitest";

import { fixture } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof fixture>> | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

it("初始化只可一次、会话过期、改密撤销全部会话", async () => {
  ctx = await fixture();
  const { app, config, adminHeaders } = ctx;
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/setup/admin",
        headers: adminHeaders,
        payload: { username: "other", password: "OtherPassword123", setupToken: config.setupToken },
      })
    ).statusCode
  ).toBe(403);
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: config.webOrigin },
    payload: { username: "owner", password: "Synthetic12345" },
  });
  expect(login.statusCode).toBe(200);
  const token = login.cookies[0].value;
  expect(ctx.repo.getSession(token)).toBeUndefined();
  expect(ctx.repo.getSession(hashToken(token))).toBeDefined();
  const change = await app.inject({
    method: "PUT",
    url: "/api/auth/password",
    headers: adminHeaders,
    payload: { currentPassword: "Synthetic12345", newPassword: "NewSynthetic12345" },
  });
  expect(change.statusCode).toBe(200);
  expect((await app.inject({ url: "/api/admin/projects", headers: adminHeaders })).statusCode).toBe(401);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { origin: config.webOrigin },
        payload: { username: "owner", password: "Synthetic12345" },
      })
    ).statusCode
  ).toBe(401);
  const renewed = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: config.webOrigin },
    payload: { username: "owner", password: "NewSynthetic12345" },
  });
  expect(renewed.statusCode).toBe(200);
  ctx.repo.createSession(hashToken("e".repeat(43)), Date.now() - 100);
  expect(
    (await app.inject({ url: "/api/admin/projects", headers: { cookie: `${config.cookieName}=${"e".repeat(43)}` } }))
      .statusCode
  ).toBe(401);
});
