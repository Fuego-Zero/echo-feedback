import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { expect, it } from "vitest";

const execute = promisify(execFile);
const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const unixPath = (path: string) =>
  path.replaceAll("\\", "/").replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);
const image = "ghcr.io/fuego-zero/echo-feedback:0.1.0";
const localImage = "echo-feedback:0.1.0";

async function deploy(mode: string, targetImage = image) {
  await mkdir(".tmp/deploy-tests", { recursive: true });
  const root = await mkdtemp(resolve(".tmp/deploy-tests/run-"));
  const directory = `${root}/echo-feedback`;
  const upload = `${root}/echo-deploy.12345678`;
  await mkdir(`${directory}/data`, { recursive: true });
  await mkdir(upload);
  await writeFile(`${directory}/.env`, "ECHO_IMAGE=old-image\nWEB_ORIGIN=https://echo.fuego.site\n");
  if (mode !== "first") {
    await writeFile(`${directory}/compose.yml`, "old-compose\n");
  }

  await writeFile(`${directory}/data/fixture`, "原始数据库和附件占位数据");
  await writeFile(`${upload}/compose.yml`, "new-compose\n");
  // 用命令替身验证事务顺序；不连接 Docker、SSH 或真实生产目录。
  const wrapper = `${root}/wrapper.sh`;
  await writeFile(
    wrapper,
    `set -euo pipefail
docker() {
  printf '%s\\n' "$*" >> "$TEST_LOG"
  case "$*" in
    *"config --services") if [[ "$TEST_MODE" == foreign ]]; then echo app; else echo echo; fi ;;
    pull*) [[ "$TEST_MODE" != pull-failure ]] ;;
    tag*) [[ "$TEST_MODE" != tag-failure ]] ;;
    *"ps --status running -q echo") echo old-container ;;
    *"up -d"*) [[ "$TEST_MODE" != health-failure ]] ;;
  esac
}
flock() { [[ "$TEST_MODE" != locked ]]; }
chown() { :; }
tar() { [[ "$TEST_MODE" != backup-failure ]] && command tar "$@"; }
source "$DEPLOY_SCRIPT" "$DEPLOY_DIR" echo-feedback "$DEPLOY_IMAGE" "$UPLOAD_DIR"
`
  );
  let passed = true;
  try {
    await execute(bash, [unixPath(wrapper)], {
      env: {
        ...process.env,
        TEST_MODE: mode,
        TEST_LOG: unixPath(`${root}/commands.log`),
        DEPLOY_SCRIPT: unixPath(resolve("scripts/deployRemote.sh")),
        DEPLOY_DIR: unixPath(directory),
        DEPLOY_IMAGE: targetImage,
        UPLOAD_DIR: unixPath(upload),
      },
    });
  } catch {
    passed = false;
  }

  return {
    passed,
    directory,
    log: await readFile(`${root}/commands.log`, "utf8").catch(() => ""),
    env: await readFile(`${directory}/.env`, "utf8"),
    compose: await readFile(`${directory}/compose.yml`, "utf8"),
  };
}

it("部署脚本 Bash 语法有效", async () => {
  await execute(bash, ["-n", "scripts/deploySsh.sh"]);
  await execute(bash, ["-n", "scripts/deployRemote.sh"]);
});

it.each([
  `ghcr.io/fuego-zero/echo-feedback:sha-${"a".repeat(40)}`,
  "ghcr.io/fuego-zero/echo-feedback:latest",
  "ghcr.io/fuego-zero/echo-feedback:01.1.0",
])("拒绝非正式版本镜像 %s，不操作容器或配置", async targetImage => {
  const result = await deploy("success", targetImage);
  expect(result.passed).toBe(false);
  expect(result.log).toBe("");
  expect(result.env).toContain("ECHO_IMAGE=old-image");
  expect(result.compose).toBe("old-compose\n");
});

it.each(["pull-failure", "tag-failure", "foreign", "locked"])("%s 不停服也不改配置", async mode => {
  const result = await deploy(mode);
  expect(result.passed).toBe(false);
  expect(result.log).not.toContain("stop echo");
  expect(result.log).not.toContain("up -d");
  expect(result.env).toContain("ECHO_IMAGE=old-image");
  expect(result.compose).toBe("old-compose\n");
  if (mode === "pull-failure") {
    expect(result.log).toContain("pull ");
  }

  if (mode === "foreign") {
    expect(result.log).toContain("config --services");
  }
});

it("备份失败恢复旧服务且不切换镜像", async () => {
  const result = await deploy("backup-failure");
  expect(result.passed).toBe(false);
  expect(result.log).toContain("stop echo");
  expect(result.log).toContain("start echo");
  expect(result.log).not.toContain("up -d");
  expect(result.env).toContain("ECHO_IMAGE=old-image");
});

it("首次部署不依赖旧容器或旧 Compose", async () => {
  const result = await deploy("first");
  expect(result.passed).toBe(true);
  expect(result.log).not.toContain("stop echo");
  expect(result.env).toContain(localImage);
  expect(result.compose).toBe("new-compose\n");
});

it("就绪失败停止新服务，不把旧镜像运行在迁移后的数据上", async () => {
  const result = await deploy("health-failure");
  expect(result.passed).toBe(false);
  expect(result.log).toContain("up -d --pull never --wait --wait-timeout 180");
  expect(result.log.match(/stop echo/g)).toHaveLength(2);
  expect(result.log).not.toContain("start echo");
  expect(result.env).toContain(localImage);
});

it("成功部署成套备份并使用本地版本标签启动同一镜像", async () => {
  const result = await deploy("success");
  expect(result.passed).toBe(true);
  expect(result.log.indexOf("pull ")).toBeLessThan(result.log.indexOf("stop echo"));
  expect(result.compose).toBe("new-compose\n");
  expect(result.env).toContain(`ECHO_IMAGE=${localImage}`);
  expect(result.env).toContain("WEB_ORIGIN=https://echo.fuego.site");
  expect(result.log).toContain(`tag ${image} ${localImage}`);
  expect(result.log.indexOf(`tag ${image}`)).toBeLessThan(result.log.indexOf("stop echo"));
  expect(await readFile(`${result.directory}/.deployed-image`, "utf8")).toBe(`${image}\n`);
  const backups = await readdir(`${result.directory}/backups`);
  expect(backups).toHaveLength(1);
  const backup = `${result.directory}/backups/${backups[0]}`;
  expect(await readFile(`${backup}/target-image`, "utf8")).toBe(`${image}\n`);
  expect(await readFile(`${backup}/.env`, "utf8")).toContain("old-image");
  expect(await readFile(`${backup}/compose.yml`, "utf8")).toBe("old-compose\n");
  const archive = await execute(bash, ["-c", 'tar -tzf "$1"', "--", unixPath(`${backup}/data.tar.gz`)]);
  expect(archive.stdout).toContain("data/fixture");
});
