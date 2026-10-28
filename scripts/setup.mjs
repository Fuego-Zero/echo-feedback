import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (existsSync(".env")) {
  console.log(".env 已存在，保持原样。");
} else {
  const example = readFileSync(".env.example", "utf8");
  writeFileSync(".env", example.replace("SETUP_TOKEN=", `SETUP_TOKEN=${randomBytes(32).toString("base64url")}`), {
    flag: "wx",
    mode: 0o600,
  });
  console.log("已创建 .env。首次初始化时从本地配置读取 SETUP_TOKEN；不要公开此文件。");
}
