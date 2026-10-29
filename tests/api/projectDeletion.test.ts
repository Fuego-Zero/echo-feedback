import { randomUUID } from "node:crypto";

import { feedbackInputSchema, projectInputSchema } from "@echo-feedback/contracts";
import { expect, it } from "vitest";

import { fixture } from "./helpers.js";

it("项目逻辑删除需管理员授权，隐藏列表与 AK，保留反馈和数据库记录", async () => {
  const ctx = await fixture();
  try {
    const project = ctx.repo.saveProject(projectInputSchema.parse({ name: "逻辑删除验收" }));
    const other = ctx.repo.saveProject(projectInputSchema.parse({ name: "其他项目" }));
    const feedbackId = randomUUID();
    ctx.repo.insertFeedback(
      feedbackId,
      project.id,
      feedbackInputSchema.parse({ content: "保留反馈" }),
      randomUUID(),
      "digest",
      []
    );
    const url = `/api/admin/projects/${project.id}`;
    expect(
      (await ctx.app.inject({ method: "DELETE", url, headers: { origin: ctx.config.webOrigin } })).statusCode
    ).toBe(401);
    expect(
      (await ctx.app.inject({ method: "DELETE", url, headers: { cookie: ctx.cookie, origin: "https://evil.test" } }))
        .statusCode
    ).toBe(403);
    expect((await ctx.app.inject({ method: "DELETE", url, headers: ctx.adminHeaders })).statusCode).toBe(200);
    expect(ctx.repo.getProject(project.id)).toBeUndefined();
    expect(ctx.repo.getProjectByAk(project.ak)).toBeUndefined();
    expect(ctx.repo.listProjects({ page: 1, pageSize: 20 }).total).toBe(1);
    expect(ctx.repo.listProjectOptions().map(item => item.id)).toEqual([other.id]);
    expect(ctx.repo.getFeedback(feedbackId).content).toBe("保留反馈");
    expect(ctx.repo.listFeedback({ page: 1, pageSize: 20 }).total).toBe(1);
    expect((await ctx.app.inject({ method: "DELETE", url, headers: ctx.adminHeaders })).statusCode).toBe(404);
    expect(
      (await ctx.app.inject({ method: "PATCH", url, headers: ctx.adminHeaders, payload: { name: "不能恢复" } }))
        .statusCode
    ).toBe(404);
  } finally {
    await ctx.close();
  }
});
