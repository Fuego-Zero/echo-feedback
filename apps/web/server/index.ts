import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";

import { type Config } from "@echo-feedback/runtime";

import { proxy } from "./proxy.js";

const mime: Record<string, string> = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/vnd.microsoft.icon",
  ".json": "application/json",
};
async function staticFile(res: ServerResponse, directory: string, pathname: string) {
  const root = resolve(directory);
  const path = resolve(root, `.${decodeURIComponent(pathname)}`);
  if (!path.startsWith(root + sep)) {
    res.writeHead(404).end();
    return;
  }

  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile()) {
    res.writeHead(404).end();
    return;
  }

  res.writeHead(200, {
    "Content-Type": mime[extname(path)] || "application/octet-stream",
    "Content-Length": info.size,
    "Cache-Control": "no-cache",
  });
  createReadStream(path)
    .on("error", () => res.destroy())
    .pipe(res);
}

async function developmentServer() {
  // Vite 只用于开发模式，生产进程不会加载。
  // eslint-disable-next-line import-x/no-extraneous-dependencies
  return import("vite");
}

export async function createWebServer(config: Config, built: boolean) {
  const root = resolve("apps/web");
  // Vite 只用于本地开发，生产使用静态构建。

  const vite = built
    ? undefined
    : await (
        await developmentServer()
      ).createServer({
        root,
        configFile: resolve(root, "vite.config.ts"),
        server: { middlewareMode: true },
        appType: "custom",
      });
  const server = createServer((req, res) => {
    void (async () => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      const { pathname } = new URL(req.url ?? "/", config.webOrigin);
      if (pathname.startsWith("/api/")) {
        await proxy(req, res, config);
        return;
      }

      const sdkPrefix = ["/sdk/0.2.0/", "/sdk/0.1.0/"].find(prefix => pathname.startsWith(prefix));
      if (sdkPrefix) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        await staticFile(res, "packages/sdk/dist", pathname.slice(sdkPrefix.length - 1));
        return;
      }

      if (pathname === "/" || pathname === "/index.html") {
        const nonce = randomBytes(18).toString("base64");
        let html = await readFile(resolve(root, built ? "dist/index.html" : "index.html"), "utf8");
        if (vite) {
          html = await vite.transformIndexHtml("/", html);
        }

        html = html.replaceAll("__ECHO_NONCE__", nonce);
        res.setHeader(
          "Content-Security-Policy",
          `default-src 'self'; script-src 'self' 'nonce-${
            nonce
          }'; style-src 'self' 'unsafe-inline'; connect-src 'self'${
            built ? "" : " ws:"
          }; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`
        );
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(html);
        return;
      }

      if (vite) {
        vite.middlewares(req, res, () => res.writeHead(404).end());
      } else {
        await staticFile(res, resolve(root, "dist"), pathname);
      }
    })().catch(() => {
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
      }

      if (!res.writableEnded) {
        res.end(JSON.stringify({ code: "SERVICE_UNAVAILABLE" }));
      }
    });
  });
  server.requestTimeout = 65000;
  server.headersTimeout = 10000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.webPort, config.webHost, resolve);
  });
  return {
    close: async () => {
      await vite?.close();
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
    },
  };
}
