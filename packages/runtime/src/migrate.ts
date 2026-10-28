import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import Sqlite from "better-sqlite3";

export function openDatabase(path: string) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new Sqlite(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = FULL");
  db.pragma("busy_timeout = 5000");
  return db;
}

export function migrate(path: string) {
  const db = openDatabase(path);
  try {
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    if (names.length && !names.some(row => row.name === "schema_migration")) {
      throw new Error("拒绝迁移未登记的数据库");
    }

    db.exec("CREATE TABLE IF NOT EXISTS schema_migration (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)");
    const directory = new URL("../migrations/", import.meta.url);
    const files = readdirSync(directory)
      .filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
      .sort();
    const migrations = files.map(file => ({
      name: file.slice(0, -4),
      sql: readFileSync(new URL(file, directory), "utf8"),
    }));
    const applied = db.prepare("SELECT name, checksum FROM schema_migration ORDER BY name").all() as {
      name: string;
      checksum: string;
    }[];
    // 已执行迁移必须是当前迁移序列的前缀，避免旧镜像静默运行新数据库。
    applied.forEach((entry, index) => {
      const migration = migrations[index];
      if (migration?.name !== entry.name) {
        throw new Error("迁移序列不兼容");
      }

      if (createHash("sha256").update(migration.sql).digest("hex") !== entry.checksum) {
        throw new Error("迁移校验和不一致");
      }
    });
    for (const migration of migrations.slice(applied.length)) {
      const checksum = createHash("sha256").update(migration.sql).digest("hex");
      db.transaction(() => {
        db.exec(migration.sql);
        db.prepare("INSERT INTO schema_migration VALUES (?,?)").run(migration.name, checksum);
      }).immediate();
    }
  } finally {
    db.close();
  }
}
