import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";

import { loadConfig, migrate, Repository } from "@echo-feedback/runtime";

import { createApiServer } from "../../apps/api/src/index.js";

export async function fixture(overrides: NodeJS.ProcessEnv = {}) {
  await mkdir(".tmp/tests", { recursive: true });
  const dataDir = await mkdtemp(resolve(".tmp/tests/api-"));
  const config = loadConfig({
    NODE_ENV: "test",
    DATA_DIR: dataDir,
    SETUP_TOKEN: "synthetic-test-setup-token-123456789",
    LOGIN_RATE_LIMIT: "100",
    SUBMIT_PROJECT_RATE_LIMIT: "100",
    SUBMIT_IP_RATE_LIMIT: "500",
    ...overrides,
  });
  migrate(config.sqlitePath);
  const repo = new Repository(config.sqlitePath);
  const logs: unknown[] = [];
  const app = await createApiServer(config, repo, entry => {
    logs.push(entry);
  });
  await app.ready();
  const bootstrap = await app.inject({
    method: "POST",
    url: "/api/setup/admin",
    headers: { origin: config.webOrigin },
    payload: { username: "owner", password: "Synthetic12345", setupToken: config.setupToken },
  });
  if (bootstrap.statusCode !== 200) {
    throw new Error(bootstrap.body);
  }

  const cookie = bootstrap.cookies.map(item => `${item.name}=${item.value}`).join("; ");
  const adminHeaders = { origin: config.webOrigin, cookie };
  return {
    app,
    config,
    repo,
    cookie,
    adminHeaders,
    logs,
    close: async () => {
      await app.close();
      repo.close();
    },
    attachmentPath: (name: string) => join(config.attachmentDir, name),
  };
}

export function multipartBody(metadata: unknown, files: { bytes: Buffer; mime: string }[] = []) {
  const boundary = `echo-${randomUUID()}`;
  const buffers: Buffer[] = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify(metadata)}\r\n`
    ),
  ];
  files.forEach((file, index) => {
    buffers.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="image-${index}"\r\nContent-Type: ${file.mime}\r\n\r\n`
      ),
      file.bytes,
      Buffer.from("\r\n")
    );
  });
  buffers.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(buffers), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}
