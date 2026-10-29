import { copyFile, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// 仅在开发时生成品牌静态资源，不参与生产运行。
// eslint-disable-next-line import-x/no-extraneous-dependencies
import sharp from "sharp";

// 网页和 SDK 直接消费同一矢量源，浏览器专用图标由此生成。
const source = new URL("../assets/brand/echo-mark.svg", import.meta.url);
const publicDir = new URL("../apps/web/public/", import.meta.url);
const svg = await readFile(source);
await copyFile(source, new URL("favicon.svg", publicDir));
const icon = await sharp(svg).resize(32, 32).png().toBuffer();
await writeFile(new URL("favicon-32.png", publicDir), icon);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico[6] = 32;
ico[7] = 32;
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(icon.length, 14);
ico.writeUInt32LE(22, 18);
await writeFile(new URL("favicon.ico", publicDir), Buffer.concat([ico, icon]));
await sharp({ create: { width: 180, height: 180, channels: 4, background: "#F4EBDD" } })
  .composite([{ input: await sharp(svg).resize(120, 120).png().toBuffer(), left: 30, top: 30 }])
  .png()
  .toFile(fileURLToPath(new URL("apple-touch-icon.png", publicDir)));
