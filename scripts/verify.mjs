import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const commands = ["typecheck", "lint", "format:check", "test", "build", "test:e2e"];
const results = [];
for (const command of commands) {
  const start = Date.now();
  const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", [command], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  results.push({ command, passed: result.status === 0, durationMs: Date.now() - start });
  if (result.status !== 0) {
    break;
  }
}

await mkdir(".tmp/verification-results", { recursive: true });
await writeFile(
  ".tmp/verification-results/report.json",
  JSON.stringify({ at: new Date().toISOString(), results }, null, 2)
);
if (results.length !== commands.length || results.some(result => !result.passed)) {
  process.exitCode = 1;
}
