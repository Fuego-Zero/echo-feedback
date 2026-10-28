/* 顺序请求用于验证项目归属及后续依赖的回执。 */
/* eslint-disable no-await-in-loop */
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

import { type Feedback, type Page, projectInputSchema, type Receipt } from "@echo-feedback/contracts";
import { ImageStorage } from "@echo-feedback/runtime";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { fixture, multipartBody } from "./helpers.js";

const contexts: Awaited<ReturnType<typeof fixture>>[] = [];
async function setup(overrides?: NodeJS.ProcessEnv) {
  const ctx = await fixture(overrides);
  contexts.push(ctx);
  return ctx;
}

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.close()));
});
const projectInput = (name: string) => projectInputSchema.parse({ name });

describe("匿名反馈及隔离", () => {
  it("无需账号字段，两个 AK 正确归属，管理筛选和状态更新", async () => {
    const ctx = await setup();
    const projects = ["岁时记", "风铃公会"].map(name => ctx.repo.saveProject(projectInput(name)));
    const receipts: string[] = [];
    for (const project of projects) {
      const body = multipartBody({
        content: " <script>alert(1)</script> 建议 ",
        sourcePage: "https://name:secret@app.example/path?a=token#hash",
      });
      const response = await ctx.app.inject({
        method: "POST",
        url: `/api/public/projects/${project.ak}/feedback`,
        ...body,
        headers: { ...body.headers, origin: "https://app.example", "idempotency-key": randomUUID() },
      });
      expect(response.statusCode).toBe(200);
      receipts.push(response.json<Receipt>().receipt);
      const detail = ctx.repo.getFeedback(response.json<Receipt>().receipt);
      expect(detail.projectId).toBe(project.id);
      expect(detail.userId).toBe("");
      expect(detail.contact).toBe("");
      expect(detail.sourcePage).toBe("https://app.example/path");
      expect(response.json()).toEqual({ receipt: detail.id });
    }

    const updated = await ctx.app.inject({
      method: "PATCH",
      url: `/api/admin/feedback/${receipts[0]}`,
      headers: ctx.adminHeaders,
      payload: { status: "processing", note: "已复现" },
    });
    expect(updated.statusCode).toBe(200);
    const list = await ctx.app.inject({
      url: `/api/admin/feedback?projectId=${projects[0].id}&status=processing`,
      headers: ctx.adminHeaders,
    });
    expect(list.json<Page<Feedback>>().total).toBe(1);
    expect(list.json<Page<Feedback>>().items[0].note).toBe("已复现");
    expect(JSON.stringify(ctx.logs)).not.toContain("alert(1)");
    expect(JSON.stringify(ctx.logs)).not.toContain("secret");
    expect(
      (await ctx.app.inject({ url: "/api/admin/feedback", headers: { authorization: projects[0].ak } })).statusCode
    ).toBe(401);
  });

  it("图片重编码、私有访问、关联校验与并发幂等", async () => {
    const ctx = await setup({ IMAGE_CONCURRENCY: "8" });
    const project = ctx.repo.saveProject(projectInput("图片"));
    const bytes = await sharp({ create: { width: 16, height: 12, channels: 3, background: "#aabbcc" } })
      .png()
      .toBuffer();
    const key = randomUUID();
    const send = (content = "图片建议") => {
      const body = multipartBody({ content }, [{ bytes, mime: "image/png" }]);
      return ctx.app.inject({
        method: "POST",
        url: `/api/public/projects/${project.ak}/feedback`,
        ...body,
        headers: { ...body.headers, origin: "https://host.example", "idempotency-key": key },
      });
    };

    const replies = await Promise.all([send(), send(), send()]);
    expect(replies.map(reply => reply.statusCode)).toEqual([200, 200, 200]);
    const { receipt } = replies[0].json<Receipt>();
    expect(new Set(replies.map(reply => reply.json<Receipt>().receipt)).size).toBe(1);
    expect(ctx.repo.listFeedback({ page: 1, pageSize: 20 }).total).toBe(1);
    expect(await readdir(ctx.config.attachmentDir)).toHaveLength(1);
    expect(await readdir(ctx.config.uploadDir)).toHaveLength(0);
    expect((await send("不同内容")).statusCode).toBe(409);
    const detail = ctx.repo.getFeedback(receipt);
    const url = `/api/admin/feedback/${receipt}/attachments/${detail.attachments[0].id}`;
    expect((await ctx.app.inject({ url })).statusCode).toBe(401);
    const image = await ctx.app.inject({ url, headers: ctx.adminHeaders });
    expect(image.statusCode).toBe(200);
    expect(image.headers["cache-control"]).toBe("private, no-store");
    expect((await sharp(image.rawPayload).metadata()).format).toBe("webp");
    expect(
      (await ctx.app.inject({ url: url.replace(receipt, randomUUID()), headers: ctx.adminHeaders })).statusCode
    ).toBe(404);
    ctx.repo.saveProject({ ...projectInput("图片"), enabled: false }, project.id);
    const disabled = await send();
    expect(disabled.statusCode).toBe(403);
    expect(disabled.headers["access-control-allow-origin"]).toBe("https://host.example");
  });

  it("来源策略、扩展开关、严格字段、图片伪装和超限", async () => {
    const ctx = await setup();
    const project = ctx.repo.saveProject({ ...projectInput("限制"), allowedOrigins: ["https://allowed.example"] });
    const send = (input: unknown, origin?: string, files: { bytes: Buffer; mime: string }[] = []) => {
      const body = multipartBody(input, files);
      return ctx.app.inject({
        method: "POST",
        url: `/api/public/projects/${project.ak}/feedback`,
        ...body,
        headers: { ...body.headers, ...(origin ? { origin } : {}), "idempotency-key": randomUUID() },
      });
    };

    expect((await send({ content: "test" }, "https://other.example")).statusCode).toBe(403);
    expect((await send({ content: "test" })).statusCode).toBe(403);
    expect((await send({ content: "test", projectId: project.id }, "https://allowed.example")).statusCode).toBe(400);
    expect((await send({ content: "x".repeat(2001) }, "https://allowed.example")).statusCode).toBe(400);
    expect(
      (
        await send({ content: "test" }, "https://allowed.example", [
          { bytes: Buffer.from("<svg/>"), mime: "image/png" },
        ])
      ).statusCode
    ).toBe(400);
    expect(
      (
        await send({ content: "test" }, "https://allowed.example", [
          { bytes: Buffer.alloc(5 * 1024 * 1024 + 1), mime: "image/png" },
        ])
      ).statusCode
    ).toBe(413);
    expect(await readdir(ctx.config.uploadDir)).toHaveLength(0);
    ctx.repo.saveProject({ ...projectInput("限制"), allowExtensionClients: true }, project.id);
    expect((await send({ content: "扩展" }, "null")).statusCode).toBe(200);
    expect((await send({ content: "扩展" })).statusCode).toBe(200);
    expect(
      (
        await ctx.app.inject({
          method: "POST",
          url: "/api/admin/projects",
          headers: { cookie: ctx.cookie, origin: "null" },
          payload: { name: "攻击" },
        })
      ).statusCode
    ).toBe(403);
  });

  it("配额失败和落库前停用均清理文件", async () => {
    const ctx = await setup({ ATTACHMENT_CAPACITY_BYTES: "1" });
    const project = ctx.repo.saveProject(projectInput("容量"));
    const bytes = await sharp({ create: { width: 12, height: 12, channels: 3, background: "red" } })
      .png()
      .toBuffer();
    const body = multipartBody({ content: "容量测试" }, [{ bytes, mime: "image/png" }]);
    const send = () =>
      ctx.app.inject({
        method: "POST",
        url: `/api/public/projects/${project.ak}/feedback`,
        ...body,
        headers: { ...body.headers, origin: "https://host.example", "idempotency-key": randomUUID() },
      });
    expect((await send()).statusCode).toBe(507);
    expect(await readdir(ctx.config.attachmentDir)).toHaveLength(0);
    expect(await readdir(ctx.config.uploadDir)).toHaveLength(0);
    // 保留方法并通过 call 显式绑定原实例。
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = ImageStorage.prototype.promote;
    ImageStorage.prototype.promote = async function promote(image) {
      await original.call(this, image);
      ctx.repo.saveProject({ ...projectInput("容量"), enabled: false }, project.id);
    };

    try {
      expect((await send()).statusCode).toBe(403);
    } finally {
      ImageStorage.prototype.promote = original;
    }

    expect(ctx.repo.listFeedback({ page: 1, pageSize: 20 }).total).toBe(0);
    expect(await readdir(ctx.config.attachmentDir)).toHaveLength(0);
  });

  it("限流计入拒绝请求，并返回跨域可读的 Retry-After", async () => {
    const ctx = await setup({ SUBMIT_PROJECT_RATE_LIMIT: "1" });
    const project = ctx.repo.saveProject(projectInput("限流"));
    const body = multipartBody({ content: "" });
    const send = () =>
      ctx.app.inject({
        method: "POST",
        url: `/api/public/projects/${project.ak}/feedback`,
        ...body,
        headers: { ...body.headers, origin: "https://host.example", "idempotency-key": randomUUID() },
      });
    expect((await send()).statusCode).toBe(400);
    const limited = await send();
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBe("60");
    expect(limited.headers["access-control-allow-origin"]).toBe("https://host.example");
  });

  it("数据库备份包含反馈及文件引用", async () => {
    const ctx = await setup();
    const project = ctx.repo.saveProject(projectInput("备份"));
    const body = multipartBody({ content: "保留" });
    await ctx.app.inject({
      method: "POST",
      url: `/api/public/projects/${project.ak}/feedback`,
      ...body,
      headers: { ...body.headers, origin: "https://host.example", "idempotency-key": randomUUID() },
    });
    const path = `${ctx.config.dataDir}/snapshot.sqlite`;
    await ctx.repo.backup(path);
    expect((await readFile(path)).length).toBeGreaterThan(1000);
  });
});
