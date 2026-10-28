import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { ImageStorage, loadConfig, Repository } from "@echo-feedback/runtime";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const config = loadConfig();
const target = resolve(process.argv[2] || join("backups", new Date().toISOString().replaceAll(":", "-")));
await mkdir(dirname(target), { recursive: true, mode: 0o700 });
await mkdir(target, { recursive: false, mode: 0o700 });
const repo = new Repository(config.sqlitePath);
try {
  await repo.backup(join(target, "echo.sqlite"));
  const snapshot = new Repository(join(target, "echo.sqlite"));
  const storage = new ImageStorage(config);
  try {
    const names = snapshot.diskNames();
    await mkdir(join(target, "attachments"), { mode: 0o700 });
    // 文件一旦关联后不可变，按数据库快照引用复制，避免把后续提交混入备份。
    await Promise.all(names.map(name => copyFile(storage.path(name), join(target, "attachments", name))));
    await writeFile(
      join(target, "manifest.json"),
      JSON.stringify({ version: 1, createdAt: new Date().toISOString(), attachments: names.length }, null, 2)
    );
  } finally {
    snapshot.close();
  }
} finally {
  repo.close();
}

console.log(`备份完成：${target}`);
