import { randomBytes, randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { request } from "node:http";

import { projectInputSchema } from "@echo-feedback/contracts";
import { ImageStorage } from "@echo-feedback/runtime";
import sharp from "sharp";
import { expect, it, vi } from "vitest";

import { fixture, multipartBody } from "./helpers.js";

it("API 拒绝没有 Content-Length 的超量 multipart 原始流", async () => {
  const ctx = await fixture();
  try {
    const project = ctx.repo.saveProject(projectInputSchema.parse({ name: "总量验收" }));
    const base = await ctx.app.listen({ port: 0, host: "127.0.0.1" });
    const status = await new Promise<number>((resolve, reject) => {
      const upload = request(
        `${base}/api/public/projects/${project.ak}/feedback`,
        {
          method: "POST",
          signal: AbortSignal.timeout(5000),
          headers: {
            origin: "https://host.example",
            "idempotency-key": randomUUID(),
            "content-type": "multipart/form-data; boundary=large",
            "transfer-encoding": "chunked",
          },
        },
        response => {
          response.resume();
          response.on("end", () => resolve(response.statusCode ?? 0));
        }
      );
      upload.on("error", reject);
      upload.end(Buffer.alloc(16 * 1024 * 1024 + 1, 65));
    });
    expect(status).toBe(413);
    expect(await readdir(ctx.config.uploadDir)).toHaveLength(0);
    expect(ctx.repo.listFeedback({ page: 1, pageSize: 20 }).total).toBe(0);
  } finally {
    await ctx.close();
  }
});

it("大于流缓冲区的图片可经真实 HTTP 完整提交", async () => {
  const ctx = await fixture();
  try {
    const project = ctx.repo.saveProject(projectInputSchema.parse({ name: "流式验收" }));
    const base = await ctx.app.listen({ port: 0, host: "127.0.0.1" });
    const bytes = await sharp(randomBytes(300 * 300 * 3), { raw: { width: 300, height: 300, channels: 3 } })
      .png()
      .toBuffer();
    expect(bytes.length).toBeGreaterThan(65536);
    const body = multipartBody({ content: "较大图片" }, [{ bytes, mime: "image/png" }]);
    const response = await fetch(`${base}/api/public/projects/${project.ak}/feedback`, {
      method: "POST",
      headers: {
        ...body.headers,
        origin: "https://host.example",
        "idempotency-key": randomUUID(),
      },
      body: new Uint8Array(body.payload),
      signal: AbortSignal.timeout(5000),
    });
    expect(response.status).toBe(200);
    expect(ctx.repo.listFeedback({ page: 1, pageSize: 20 }).total).toBe(1);
    expect(await readdir(ctx.config.uploadDir)).toHaveLength(0);
  } finally {
    await ctx.close();
  }
});

it("实际上传流中断后删除临时文件且服务仍可用", async () => {
  const ctx = await fixture();
  try {
    const project = ctx.repo.saveProject(projectInputSchema.parse({ name: "中断验收" }));
    const base = await ctx.app.listen({ port: 0, host: "127.0.0.1" });
    const boundary = `abort-${randomUUID()}`;
    const upload = request(`${base}/api/public/projects/${project.ak}/feedback`, {
      method: "POST",
      headers: {
        origin: "https://host.example",
        "idempotency-key": randomUUID(),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
    });
    upload.on("error", () => {
      /* 主动断开产生的本地连接错误属于预期。 */
    });
    upload.write(
      `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n{"content":"上传中断"}\r\n--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="image.png"\r\nContent-Type: image/png\r\n\r\n`
    );
    upload.write(Buffer.alloc(1024));
    try {
      await expect.poll(async () => (await readdir(ctx.config.uploadDir)).length, { timeout: 5000 }).toBe(1);
    } finally {
      upload.destroy();
    }

    await expect.poll(async () => (await readdir(ctx.config.uploadDir)).length, { timeout: 5000 }).toBe(0);
    expect(await readdir(ctx.config.attachmentDir)).toHaveLength(0);
    expect(ctx.repo.listFeedback({ page: 1, pageSize: 20 }).total).toBe(0);
    expect((await ctx.app.inject({ url: "/api/health/ready" })).statusCode).toBe(200);
  } finally {
    await ctx.close();
  }
});

it("注入磁盘写入失败会清理已处理文件，不产生反馈", async () => {
  const ctx = await fixture();
  const failure = vi
    .spyOn(ImageStorage.prototype, "promote")
    .mockRejectedValueOnce(Object.assign(new Error("disk full"), { code: "ENOSPC" }));
  try {
    const project = ctx.repo.saveProject(projectInputSchema.parse({ name: "磁盘验收" }));
    const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } })
      .png()
      .toBuffer();
    const body = multipartBody({ content: "磁盘不足" }, [{ bytes, mime: "image/png" }]);
    const result = await ctx.app.inject({
      method: "POST",
      url: `/api/public/projects/${project.ak}/feedback`,
      ...body,
      headers: { ...body.headers, origin: "https://host.example", "idempotency-key": randomUUID() },
    });
    expect(result.statusCode).toBe(507);
    expect(result.json<{ code: string }>().code).toBe("STORAGE_FULL");
    expect(await readdir(ctx.config.uploadDir)).toHaveLength(0);
    expect(await readdir(ctx.config.attachmentDir)).toHaveLength(0);
    expect(ctx.repo.listFeedback({ page: 1, pageSize: 20 }).total).toBe(0);
  } finally {
    failure.mockRestore();
    await ctx.close();
  }
});
