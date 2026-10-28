import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";

import { createLogger, loadConfig, migrate, Repository } from "@echo-feedback/runtime";

import { createApiServer } from "../../apps/api/src/index.js";
import { createWebServer } from "../../apps/web/server/index.js";

await mkdir(".tmp/e2e", { recursive: true });
const dataDir = await mkdtemp(resolve(".tmp/e2e/run-"));
const config = loadConfig({
  NODE_ENV: "test",
  WEB_ORIGIN: "http://127.0.0.1:18730",
  WEB_PORT: "18730",
  API_PORT: "18731",
  DATA_DIR: dataDir,
  SETUP_TOKEN: "synthetic-e2e-setup-token-123456789",
  LOGIN_RATE_LIMIT: "1000",
  SUBMIT_PROJECT_RATE_LIMIT: "1000",
  SUBMIT_IP_RATE_LIMIT: "1000",
});
migrate(config.sqlitePath);
const repo = new Repository(config.sqlitePath);
const api = await createApiServer(config, repo, createLogger(config.logDir));
await api.listen({ port: config.apiPort, host: "127.0.0.1" });
const web = await createWebServer(config, true);
const fixture = await readFile("tests/e2e/host.html", "utf8");
const hosts = [18732, 18733].map(port =>
  createServer((_req, res) => {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy":
        "default-src 'none'; script-src 'nonce-echo-test-nonce' http://127.0.0.1:18730; style-src 'nonce-echo-test-nonce'; connect-src http://127.0.0.1:18730; img-src blob:; base-uri 'none'",
    });
    res.end(fixture);
  }).listen(port, "127.0.0.1")
);
async function shutdown() {
  hosts.forEach(host => host.close());
  await web.close();
  await api.close();
  repo.close();
}

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
