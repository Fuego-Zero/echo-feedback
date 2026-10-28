import { mkdir, mkdtemp, readdir, utimes, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  hashPassword,
  ImageStorage,
  loadConfig,
  migrate,
  openDatabase,
  RateLimiter,
  Repository,
  verifyPassword,
} from "@echo-feedback/runtime";
import { expect, it } from "vitest";

it("迁移可重复但拒绝已篡改的校验和", async () => {
  await mkdir(".tmp/tests", { recursive: true });
  const dir = await mkdtemp(resolve(".tmp/tests/migrate-"));
  const path = `${dir}/echo.sqlite`;
  migrate(path);
  migrate(path);
  const db = openDatabase(path);
  db.prepare("UPDATE schema_migration SET checksum='wrong'").run();
  db.close();
  expect(() => migrate(path)).toThrow("校验和");
});
it("清理只删除超过一天的无引用文件", async () => {
  const dir = await mkdtemp(resolve(".tmp/tests/cleanup-"));
  const config = loadConfig({ DATA_DIR: dir });
  migrate(config.sqlitePath);
  const storage = new ImageStorage(config);
  const repo = new Repository(config.sqlitePath);
  await storage.initialize();
  try {
    const old = `${config.uploadDir}/old.upload`;
    const recent = `${config.uploadDir}/recent.upload`;
    await Promise.all([writeFile(old, "old"), writeFile(recent, "new")]);
    const past = new Date(Date.now() - 90000000);
    await utimes(old, past, past);
    await storage.cleanup(repo);
    expect(await readdir(config.uploadDir)).toEqual(["recent.upload"]);
  } finally {
    repo.close();
  }
});
it("密码校验与固定时间窗限流", async () => {
  const hash = await hashPassword("Hello123456789");
  expect(await verifyPassword("Hello123456789", hash)).toBe(true);
  expect(await verifyPassword("wrong", hash)).toBe(false);
  const limiter = new RateLimiter();
  limiter.consume("a", 1, 0);
  expect(() => limiter.consume("a", 1, 100)).toThrow("RATE_LIMITED");
  expect(() => limiter.consume("a", 1, 60000)).not.toThrow();
});
