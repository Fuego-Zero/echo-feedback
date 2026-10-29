import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const output = resolve(".tmp/sdk-release");
await mkdir(output, { recursive: true });
assert.equal((await readdir(output)).filter(file => file.endsWith(".tgz")).length, 0, "请使用空的安装包输出目录");
const pack = spawnSync("pnpm", ["pack", "--pack-destination", "../../.tmp/sdk-release"], {
  cwd: "packages/sdk",
  stdio: "inherit",
  shell: process.platform === "win32",
});
assert.equal(pack.status, 0);
const files = (await readdir(output)).filter(file => file.endsWith(".tgz"));
assert.equal(files.length, 1);
const archive = join(output, files[0]);
const entries = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" }).trim().split(/\r?\n/);
assert.ok(entries.includes("package/dist/echo-feedback.js"));
assert.ok(entries.includes("package/dist/echo-feedback.iife.js"));
assert.ok(entries.includes("package/dist/index.d.ts"));
assert.ok(entries.includes("package/LICENSE"));
assert.ok(entries.every(path => /^package\/(?:dist\/[^/]+\.(?:js|ts)|package\.json|README\.md|LICENSE)$/.test(path)));
const consumer = await mkdtemp(resolve(".tmp/sdk-consumer-"));
execFileSync("tar", ["-xzf", archive, "-C", consumer]);
const manifest = JSON.parse(await readFile(join(consumer, "package/package.json"), "utf8"));
assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0);
assert.ok(!JSON.stringify(manifest).includes("workspace:"), "发布包不得残留 workspace 协议");
await writeFile(
  join(consumer, "package.json"),
  JSON.stringify({
    private: true,
    type: "module",
    dependencies: { [manifest.name]: `file:${archive.replaceAll("\\", "/")}` },
  })
);
const install = spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
  cwd: consumer,
  stdio: "inherit",
  shell: process.platform === "win32",
});
assert.equal(install.status, 0);
await writeFile(
  join(consumer, "install.mjs"),
  `import { init } from ${JSON.stringify(manifest.name)};
const instance=init({serverUrl:'https://example.test',ak:'a'.repeat(43)});
instance.open(); instance.destroy();
if(typeof init!=='function')throw Error('SDK 导出不可用');`
);
execFileSync(process.execPath, ["install.mjs"], { cwd: consumer, stdio: "inherit" });
await writeFile(
  join(consumer, "types.ts"),
  `import { init, type FeedbackOptions } from ${JSON.stringify(manifest.name)};
const options: FeedbackOptions={serverUrl:'https://example.test',ak:'a'.repeat(43),uiStyle:'justice',theme:'system'};
init(options).destroy();`
);
execFileSync(
  process.execPath,
  [
    resolve("node_modules/typescript/bin/tsc"),
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--target",
    "ES2022",
    "types.ts",
  ],
  { cwd: consumer, stdio: "inherit" }
);
console.log(`SDK_PACKAGE_OK ${manifest.name}@${manifest.version}`);
