import { existsSync } from "node:fs";

import { loadConfig, migrate } from "@echo-feedback/runtime";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

migrate(loadConfig().sqlitePath);
console.log("迁移完成。");
