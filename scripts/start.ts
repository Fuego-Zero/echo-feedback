import { existsSync } from "node:fs";

import { createLogger, loadConfig, migrate, Repository } from "@echo-feedback/runtime";

import { createApiServer } from "../apps/api/src/index.js";
import { createWebServer } from "../apps/web/server/index.js";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const config = loadConfig();
migrate(config.sqlitePath);
const repo = new Repository(config.sqlitePath);
if (!repo.getAdmin() && config.setupToken.length < 32) {
  throw new Error("空库需要至少 32 位 SETUP_TOKEN；请先运行 pnpm env:init");
}

const log = createLogger(config.logDir);
const api = await createApiServer(config, repo, log);
await api.listen({ host: "127.0.0.1", port: config.apiPort });
const web = await createWebServer(config, process.argv.includes("--built"));
console.log(`回声已启动：${config.webOrigin}`);
let closing = false;
async function close() {
  if (closing) {
    return;
  }

  closing = true;
  await web.close();
  await api.close();
  repo.close();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void close().catch(() => {
      process.exitCode = 1;
    });
  });
}
