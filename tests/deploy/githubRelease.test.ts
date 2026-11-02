import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { beforeAll, expect, it } from "vitest";

const execute = promisify(execFile);
const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const unixPath = (path: string) =>
  path.replaceAll("\\", "/").replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);
const script = resolve("scripts/githubRelease.sh");
let directory: string;
let base: string;
let target: string;
let unchanged: string;
let downgrade: string;
let invalid: string;

beforeAll(async () => {
  await mkdir(".tmp/github-release-tests", { recursive: true });
  directory = await mkdtemp(resolve(".tmp/github-release-tests/repo-"));
  await execute("git", ["init", "-q", "-b", "main", directory]);
  await execute("git", ["config", "user.name", "发行测试"], { cwd: directory });
  await execute("git", ["config", "user.email", "release-test@example.com"], { cwd: directory });
  await execute("git", ["config", "core.hooksPath", resolve(directory, "empty-hooks")], { cwd: directory });
  await mkdir(resolve(directory, "packages/sdk"), { recursive: true });
  await writeFile(resolve(directory, "packages/sdk/package.json"), JSON.stringify({ version: "0.3.0" }));
  const commit = async (version: string) => {
    await writeFile(resolve(directory, "package.json"), JSON.stringify({ version }));
    await execute("git", ["add", "package.json", "packages/sdk/package.json"], { cwd: directory });
    await execute("git", ["-c", "commit.gpgSign=false", "commit", "--allow-empty", "-qm", `测试版本 ${version}`], {
      cwd: directory,
    });
    return (await execute("git", ["rev-parse", "HEAD"], { cwd: directory })).stdout.trim();
  };

  base = await commit("0.1.0");
  target = await commit("0.2.0");
  unchanged = await commit("0.2.0");
  downgrade = await commit("0.1.0");
  invalid = await commit("01.2.0");
  await execute("git", ["update-ref", "refs/remotes/origin/main", invalid], { cwd: directory });
});

async function publish(mode: string, sha = target, previous = base) {
  const run = await mkdtemp(resolve(".tmp/github-release-tests/run-"));
  const wrapper = resolve(run, "wrapper.sh");
  const log = resolve(run, "commands.log");
  await writeFile(log, "");
  await writeFile(
    wrapper,
    `set -euo pipefail
gh() {
  printf '%s\\n' "$*" >> "$TEST_LOG"
  if [[ "$TEST_MODE" == permission ]]; then echo 'gh: Forbidden (HTTP 403)' >&2; return 1; fi
  if [[ "$TEST_MODE" == server-error ]]; then echo 'gh: Unavailable (HTTP 503)' >&2; return 1; fi
  if [[ "$1" == api ]]; then
    case "$2" in
      *actions/workflows/ci.yml/runs*)
        if [[ "$TEST_MODE" == unverified ]]; then echo '{"workflow_runs":[]}';
        else printf '{"workflow_runs":[{"head_sha":"%s","conclusion":"success"}]}' "$EXPECTED_SHA"; fi ;;
      *git/ref/tags/*)
        case "$TEST_MODE" in
          conflict) printf '{"object":{"type":"commit","sha":"%s"}}' "$(printf 'f%.0s' {1..40})" ;;
          annotated) printf '{"object":{"type":"tag","sha":"%s"}}' "$(printf 'a%.0s' {1..40})" ;;
          existing|orphan-tag|draft) printf '{"object":{"type":"commit","sha":"%s"}}' "$EXPECTED_SHA" ;;
          *) echo 'gh: Not Found (HTTP 404)' >&2; return 1 ;;
        esac ;;
      *git/tags/*) printf '{"object":{"type":"commit","sha":"%s"}}' "$EXPECTED_SHA" ;;
      *releases/latest)
        if [[ "$TEST_MODE" == older-version ]]; then echo '{"tag_name":"v0.9.0"}';
        else echo 'gh: Not Found (HTTP 404)' >&2; return 1; fi ;;
      *releases/tags/*)
        case "$TEST_MODE" in
          existing) echo '{"id":1,"name":"v0.2.0","draft":false,"prerelease":false}' ;;
          draft) echo '{"id":1,"name":"v0.2.0","draft":true,"prerelease":false}' ;;
          *) echo 'gh: Not Found (HTTP 404)' >&2; return 1 ;;
        esac ;;
      --method)
        if [[ "$TEST_MODE" == tag-failure ]]; then echo 'gh: Reference exists (HTTP 422)' >&2; return 1; fi
        echo '{}' ;;
      *) echo '未注册的测试 API' >&2; return 1 ;;
    esac
  elif [[ "$1 $2" == 'release create' ]]; then
    [[ "$TEST_MODE" != create-failure ]] || return 1
    echo 'https://github.com/Fuego-Zero/echo-feedback/releases/tag/v0.2.0'
  else
    echo '未注册的测试命令' >&2; return 1
  fi
}
source "$RELEASE_SCRIPT" "$SOURCE_SHA" "$PREVIOUS_SHA"
`
  );
  let passed = true;
  let stdout = "";
  try {
    stdout = (
      await execute(bash, [unixPath(wrapper)], {
        cwd: directory,
        env: {
          ...process.env,
          GITHUB_REPOSITORY: "Fuego-Zero/echo-feedback",
          GH_TOKEN: "synthetic-release-test-token",
          GITHUB_STEP_SUMMARY: unixPath(resolve(run, "summary.md")),
          TEST_MODE: mode,
          TEST_LOG: unixPath(log),
          EXPECTED_SHA: sha,
          RELEASE_SCRIPT: unixPath(script),
          SOURCE_SHA: sha,
          PREVIOUS_SHA: previous,
        },
      })
    ).stdout;
  } catch {
    passed = false;
  }

  const commands = await readFile(log, "utf8");
  const notesPath = /--notes-file (\S+)/.exec(commands)?.[1];
  return {
    passed,
    stdout,
    commands,
    notes: notesPath ? await readFile(resolve(directory, notesPath), "utf8") : "",
  };
}

it("发行脚本 Bash 语法有效", async () => {
  await execute(bash, ["-n", unixPath(script)]);
});

it("版本递增时绑定准确提交，标题仅包含版本号，并生成发行说明", async () => {
  const result = await publish("success");
  expect(result.passed).toBe(true);
  expect(result.commands).toContain(`ref=refs/tags/v0.2.0 -f sha=${target}`);
  expect(result.commands).toContain(
    `release create v0.2.0 --repo Fuego-Zero/echo-feedback --verify-tag --target ${target} --title v0.2.0 --generate-notes`
  );
  expect(result.commands.indexOf("--method POST")).toBeLessThan(result.commands.indexOf("release create"));
  expect(result.notes).toContain("ghcr.io/fuego-zero/echo-feedback:0.2.0");
  expect(result.notes).toContain("SDK 独立版本：`0.3.0`");
});

it("版本未变时不请求 GitHub 或创建新发行版", async () => {
  const result = await publish("success", unchanged, target);
  expect(result.passed).toBe(true);
  expect(result.commands).toBe("");
  expect(result.stdout).toContain("服务版本号未变");
});

it("不递增、非法版本和非 main 提交都不能发行", async () => {
  for (const [sha, previous] of [
    [downgrade, target],
    [invalid, target],
    ["f".repeat(40), base],
  ]) {
    // eslint-disable-next-line no-await-in-loop -- 顺序检查各个独立的拒绝条件。
    const result = await publish("success", sha, previous);
    expect(result.passed).toBe(false);
    expect(result.commands).toBe("");
  }
});

it.each(["conflict", "permission", "server-error", "draft"])("%s 停止发行，不覆盖标签或已有发行版", async mode => {
  const result = await publish(mode);
  expect(result.passed).toBe(false);
  expect(result.commands).not.toContain("--method POST");
  expect(result.commands).not.toContain("release create");
  expect(result.commands).not.toContain("release edit");
});

it("重复执行同一版本安全跳过", async () => {
  const result = await publish("existing");
  expect(result.passed).toBe(true);
  expect(result.commands).not.toContain("--method POST");
  expect(result.commands).not.toContain("release create");
});

it.each(["orphan-tag", "annotated"])("已有 %s 时保留标签并补齐发行版", async mode => {
  const result = await publish(mode);
  expect(result.passed).toBe(true);
  expect(result.commands).not.toContain("--method POST");
  expect(result.commands).toContain("release create v0.2.0");
});

it("标签创建失败后不能创建发行版", async () => {
  const result = await publish("tag-failure");
  expect(result.passed).toBe(false);
  expect(result.commands).toContain("--method POST");
  expect(result.commands).not.toContain("release create");
});

it("发行 API 失败时报告失败，保留已绑定提交的标签供重试", async () => {
  const result = await publish("create-failure");
  expect(result.passed).toBe(false);
  expect(result.commands).toContain("release create");
  expect(result.commands).not.toContain("delete");
});

it("补录只接受有成功 Verify 的提交，不构建或部署镜像", async () => {
  const result = await publish("orphan-tag", target, "");
  expect(result.passed).toBe(true);
  expect(result.commands).toContain(`actions/workflows/ci.yml/runs?head_sha=${target}`);
  expect(result.commands).toContain("release create v0.2.0");
  const rejected = await publish("unverified", target, "");
  expect(rejected.passed).toBe(false);
  expect(rejected.commands).not.toContain("release create");
});

it("补录历史版本不会把较新的发行版替换为 Latest", async () => {
  const result = await publish("older-version", target, "");
  expect(result.passed).toBe(true);
  expect(result.commands).toContain("release create v0.2.0");
  expect(result.commands).toContain("--latest=false");
});
