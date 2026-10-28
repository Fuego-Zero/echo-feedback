import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import { projectInputSchema, type Receipt } from "@echo-feedback/contracts";
import { loadConfig, migrate, Repository } from "@echo-feedback/runtime";
import sharp from "sharp";
import { expect, it } from "vitest";

import { createApiServer } from "../../apps/api/src/index.js";
import { fixture, multipartBody } from "../api/helpers.js";

it("真实备份脚本恢复数据库、会话及私有图片", async () => {
  const ctx = await fixture();
  try {
    const project = ctx.repo.saveProject(projectInputSchema.parse({ name: "恢复验收" }));
    const bytes = await sharp({ create: { width: 18, height: 20, channels: 3, background: "#4d8875" } })
      .png()
      .toBuffer();
    const body = multipartBody({ content: "恢复后仍能看到附件" }, [{ bytes, mime: "image/png" }]);
    const response = await ctx.app.inject({
      method: "POST",
      url: `/api/public/projects/${project.ak}/feedback`,
      ...body,
      headers: { ...body.headers, origin: "https://host.example", "idempotency-key": randomUUID() },
    });
    expect(response.statusCode).toBe(200);
    const id = response.json<Receipt>().receipt;
    const target = `${ctx.config.dataDir}/restored`;
    await promisify(execFile)(process.execPath, ["--import", "tsx", "scripts/backup.ts", target], {
      env: { ...process.env, DATA_DIR: ctx.config.dataDir, NODE_ENV: "test" },
    });
    const config = loadConfig({ DATA_DIR: target, NODE_ENV: "test" });
    migrate(config.sqlitePath);
    const restored = new Repository(config.sqlitePath);
    const app = await createApiServer(config, restored, () => {
      /* 验收不输出日志。 */
    });
    try {
      const detail = restored.getFeedback(id);
      expect(detail.content).toBe("恢复后仍能看到附件");
      expect(detail.projectId).toBe(project.id);
      const image = await app.inject({
        url: `/api/admin/feedback/${id}/attachments/${detail.attachments[0].id}`,
        headers: ctx.adminHeaders,
      });
      expect(image.statusCode).toBe(200);
      expect((await sharp(image.rawPayload).metadata()).width).toBe(18);
      const manifest = JSON.parse(await readFile(`${target}/manifest.json`, "utf8")) as { attachments: number };
      expect(manifest.attachments).toBe(1);
    } finally {
      await app.close();
      restored.close();
    }
  } finally {
    await ctx.close();
  }
});
