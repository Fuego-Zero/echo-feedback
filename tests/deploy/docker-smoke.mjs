import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import sharp from "sharp";

const execute = promisify(execFile);
await mkdir(".tmp/docker", { recursive: true });
const directory = await mkdtemp(resolve(".tmp/docker/run-"));
const composePath = join(directory, "compose.yml");
await writeFile(composePath, await readFile("deploy/compose.yml"));
await mkdir(join(directory, "data"));
await writeFile(
  join(directory, ".env"),
  [
    "ECHO_IMAGE=echo-feedback:local",
    "ECHO_HOST_PORT=28730",
    "WEB_ORIGIN=https://echo.test.invalid",
    "SETUP_TOKEN=synthetic-container-test-token-123456789",
    "TRUSTED_PROXY_IPS=127.0.0.1,::1",
  ].join("\n")
);
const projectName = `echo-acceptance-${randomUUID().slice(0, 8)}`;
const compose = (...args) =>
  execute("docker", ["compose", "-p", projectName, "-f", composePath, ...args], {
    cwd: directory,
    maxBuffer: 8 * 1024 * 1024,
  });
const origin = "https://echo.test.invalid";
const base = "http://127.0.0.1:28730";
let cookie = "";
const json = async (path, method, body) => {
  const response = await fetch(base + path, {
    method,
    headers: { origin, cookie, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.ok(response.ok, `HTTP ${response.status} ${path}`);
  return { response, data: await response.json() };
};

const report = { at: new Date().toISOString(), image: "echo-feedback:local", checks: [] };
try {
  // Linux 绑定目录需由容器用户持有；只调整本次新建的测试目录。
  if (process.platform !== "win32") {
    await execute("docker", [
      "run",
      "--rm",
      "--user",
      "0",
      "--mount",
      `type=bind,source=${join(directory, "data")},target=/data`,
      "--entrypoint",
      "chown",
      "echo-feedback:local",
      "-R",
      "1000:1000",
      "/data",
    ]);
  }

  await compose("up", "-d", "--wait", "--wait-timeout", "90");
  const id = (await compose("ps", "-q", "echo")).stdout.trim();
  const user = (await execute("docker", ["inspect", "--format", "{{.Config.User}}", id])).stdout.trim();
  assert.equal(user, "node");
  report.checks.push("non-root-and-ready");
  const setup = await json("/api/setup/admin", "POST", {
    username: "owner",
    password: "Synthetic12345",
    setupToken: "synthetic-container-test-token-123456789",
  });
  const setCookie = setup.response.headers.get("set-cookie");
  assert.ok(setCookie.includes("Secure"));
  assert.ok(setCookie.includes("HttpOnly"));
  [cookie] = setCookie.split(";");
  const project = (await json("/api/admin/projects", "POST", { name: "容器恢复验收" })).data;
  const bytes = await sharp({ create: { width: 20, height: 16, channels: 3, background: "#337766" } })
    .png()
    .toBuffer();
  const body = new FormData();
  body.append("metadata", JSON.stringify({ content: "重建及恢复后保留" }));
  body.append("images", new Blob([bytes], { type: "image/png" }), "sample.png");
  const submission = await fetch(`${base}/api/public/projects/${project.ak}/feedback`, {
    method: "POST",
    headers: { origin: "https://host.test.invalid", "idempotency-key": randomUUID() },
    body,
  });
  assert.equal(submission.status, 200);
  const { receipt } = await submission.json();
  const validate = async () => {
    const detail = (await json(`/api/admin/feedback/${receipt}`)).data;
    assert.equal(detail.content, "重建及恢复后保留");
    assert.equal(detail.projectId, project.id);
    const path = `/api/admin/feedback/${receipt}/attachments/${detail.attachments[0].id}`;
    assert.equal((await fetch(base + path)).status, 401);
    const image = await fetch(base + path, { headers: { cookie } });
    assert.equal(image.status, 200);
    assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).width, 20);
  };

  await validate();
  await compose("up", "-d", "--force-recreate", "--wait", "--wait-timeout", "90");
  await validate();
  report.checks.push("recreate-preserves-database-and-images");
  await compose("stop", "echo");
  await compose(
    "run",
    "--rm",
    "--no-deps",
    "--entrypoint",
    "node",
    "echo",
    "--import",
    "tsx",
    "scripts/backup.ts",
    "/data/snapshot"
  );
  await mkdir(join(directory, "restored"));
  // 备份目录仅容器用户可读；在隔离挂载内复制，避免依赖 Runner 的 UID。
  await execute("docker", [
    "run",
    "--rm",
    "--user",
    "0",
    "--mount",
    `type=bind,source=${directory},target=/acceptance`,
    "--entrypoint",
    "cp",
    "echo-feedback:local",
    "-a",
    "/acceptance/data/snapshot/.",
    "/acceptance/restored",
  ]);
  const original = await readFile(composePath, "utf8");
  await writeFile(composePath, original.replace("./data:/data", "./restored:/data"));
  if (process.platform !== "win32") {
    await execute("docker", [
      "run",
      "--rm",
      "--user",
      "0",
      "--mount",
      `type=bind,source=${join(directory, "restored")},target=/data`,
      "--entrypoint",
      "chown",
      "echo-feedback:local",
      "-R",
      "1000:1000",
      "/data",
    ]);
  }

  await compose("up", "-d", "--force-recreate", "--wait", "--wait-timeout", "90");
  await validate();
  report.checks.push("backup-restores-private-images-and-session");
  report.passed = true;
} finally {
  await compose("down", "--remove-orphans").catch(() => undefined);
  await mkdir(".tmp/verification-results", { recursive: true });
  await writeFile(".tmp/verification-results/docker.json", JSON.stringify(report, null, 2));
}

console.log("DOCKER_ACCEPTANCE_OK");
