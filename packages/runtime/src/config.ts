import { isIP } from "node:net";
import { resolve } from "node:path";

import { z } from "zod";

const integer = (value: number, max = 1000000) => z.coerce.number().int().min(1).max(max).default(value);
const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  WEB_ORIGIN: z.url().default("http://127.0.0.1:8730"),
  WEB_BIND_HOST: z.string().default("127.0.0.1"),
  WEB_PORT: integer(8730, 65535),
  API_PORT: integer(8731, 65535),
  DATA_DIR: z.string().default("./data"),
  LOG_DIR: z.string().optional(),
  SETUP_TOKEN: z.string().default(""),
  SESSION_TTL_SECONDS: integer(30 * 86400, 365 * 86400),
  LOGIN_RATE_LIMIT: integer(10),
  SUBMIT_PROJECT_RATE_LIMIT: integer(5),
  SUBMIT_IP_RATE_LIMIT: integer(30),
  IMAGE_CONCURRENCY: integer(2, 16),
  ATTACHMENT_CAPACITY_BYTES: integer(1024 ** 3, Number.MAX_SAFE_INTEGER),
  TRUSTED_PROXY_IPS: z.string().default("127.0.0.1,::1"),
});
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = environmentSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`配置无效：${parsed.error.issues.map(issue => issue.path.join(".")).join(", ")}`);
  }

  const value = parsed.data;
  const origin = new URL(value.WEB_ORIGIN);
  if (origin.origin !== value.WEB_ORIGIN || !["http:", "https:"].includes(origin.protocol)) {
    throw new Error("WEB_ORIGIN 必须为 HTTP(S) Origin");
  }

  if (value.NODE_ENV === "production" && origin.protocol !== "https:") {
    throw new Error("生产环境需要 HTTPS");
  }

  const trustedProxyIps = value.TRUSTED_PROXY_IPS.split(",")
    .map(ip => ip.trim())
    .filter(Boolean);
  if (trustedProxyIps.some(ip => !isIP(ip))) {
    throw new Error("TRUSTED_PROXY_IPS 必须为明确的 IP 地址");
  }

  if (value.WEB_PORT === value.API_PORT) {
    throw new Error("Web/API 不能共用端口");
  }

  const dataDir = resolve(value.DATA_DIR);
  return {
    env: value.NODE_ENV,
    webOrigin: value.WEB_ORIGIN,
    webHost: value.WEB_BIND_HOST,
    webPort: value.WEB_PORT,
    apiPort: value.API_PORT,
    dataDir,
    sqlitePath: resolve(dataDir, "echo.sqlite"),
    attachmentDir: resolve(dataDir, "attachments"),
    uploadDir: resolve(dataDir, "uploads"),
    logDir: resolve(value.LOG_DIR ?? resolve(dataDir, "logs")),
    setupToken: value.SETUP_TOKEN,
    sessionTtl: value.SESSION_TTL_SECONDS * 1000,
    cookieName: value.NODE_ENV === "production" ? "__Host-echo" : "echo.session",
    loginLimit: value.LOGIN_RATE_LIMIT,
    projectLimit: value.SUBMIT_PROJECT_RATE_LIMIT,
    ipLimit: value.SUBMIT_IP_RATE_LIMIT,
    imageConcurrency: value.IMAGE_CONCURRENCY,
    capacity: value.ATTACHMENT_CAPACITY_BYTES,
    trustedProxyIps,
  };
}

export type Config = ReturnType<typeof loadConfig>;
