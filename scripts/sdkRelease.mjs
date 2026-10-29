import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, readdir, readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

const pkg = JSON.parse(await readFile("packages/sdk/package.json", "utf8"));
assert.match(pkg.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/);
const mode = process.argv[2];
if (mode === "plan") {
  let changed;
  if (process.env.GITHUB_EVENT_NAME === "workflow_dispatch") {
    assert.equal(process.env.GITHUB_REF, "refs/heads/main");
    assert.equal(process.env.REQUESTED_VERSION, pkg.version, "手动发布版本必须与 main 一致");
    changed = true;
  } else {
    assert.match(process.env.BASE_SHA ?? "", /^[0-9a-f]{40}$/);
    const previous = JSON.parse(
      execFileSync("git", ["show", `${process.env.BASE_SHA}:packages/sdk/package.json`], { encoding: "utf8" })
    );
    changed = previous.version !== pkg.version;
  }

  const output = `publish=${String(changed)}\nversion=${pkg.version}\ntag=${pkg.version.includes("-") ? "next" : "latest"}\n`;
  await appendFile(process.env.GITHUB_OUTPUT, output);
  console.log(changed ? `准备发布 ${pkg.name}@${pkg.version}` : "SDK 版本号未变，跳过 npm 发布。");
} else if (mode === "publish") {
  assert.equal(process.env.EXPECTED_VERSION, pkg.version);
  const tag = pkg.version.includes("-") ? "next" : "latest";
  assert.equal(process.env.RELEASE_TAG, tag);
  const files = (await readdir(".tmp/sdk-release")).filter(file => file.endsWith(".tgz"));
  assert.equal(files.length, 1, "必须发布唯一的已验收安装包");
  const path = `.tmp/sdk-release/${files[0]}`;
  const integrity = `sha512-${createHash("sha512")
    .update(await readFile(path))
    .digest("base64")}`;
  const url = `https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${encodeURIComponent(pkg.version)}`;
  const existing = await fetch(url);
  if (existing.ok) {
    assert.equal((await existing.json()).dist.integrity, integrity, "该版本已存在但包内容不同，请增加版本号");
    console.log("该版本的相同安装包已发布，无需重复发布。");
  } else {
    assert.equal(existing.status, 404, "npm 查询异常，停止发布");
    // 发布任务不安装项目依赖，不运行包脚本，仅发布前一任务验收过的 tgz。
    const result = spawnSync(
      "npm",
      [
        "publish",
        path,
        "--access",
        "public",
        "--provenance",
        "--ignore-scripts",
        "--tag",
        tag,
        "--registry=https://registry.npmjs.org/",
      ],
      { stdio: "inherit", shell: process.platform === "win32" }
    );
    assert.equal(result.status, 0, "npm 发布失败");
  }

  let published = await fetch(url);
  // npm 注册表的读取节点可能稍晚同步，仅在尚未可见时有限重试。
  for (let attempt = 0; published.status === 404 && attempt < 60; attempt++) {
    // eslint-disable-next-line no-await-in-loop -- 重试必须等待上一轮结果，避免并发查询。
    await setTimeout(5000);
    // eslint-disable-next-line no-await-in-loop -- 串行读取注册表的最新同步状态。
    published = await fetch(url);
  }

  assert.ok(published.ok, "发布后无法读取 npm 版本");
  assert.equal((await published.json()).dist.integrity, integrity, "npm 安装包完整性不符");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `已确认 npm 包：${pkg.name}@${pkg.version}（${tag}）\n`);
} else {
  throw new Error("请指定 plan 或 publish");
}
