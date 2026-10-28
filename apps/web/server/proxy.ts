import { request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { isIP } from "node:net";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { limits } from "@echo-feedback/contracts";
import { type Config } from "@echo-feedback/runtime";

export function clientIp(req: IncomingMessage, trusted: string[]) {
  const peer = (req.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
  const forwarded = req.headers["x-real-ip"];
  return trusted.includes(peer) && typeof forwarded === "string" && isIP(forwarded) ? forwarded : peer;
}

export async function proxy(req: IncomingMessage, res: ServerResponse, config: Config) {
  const headers: Record<string, string> = { "x-forwarded-for": clientIp(req, config.trustedProxyIps) };
  for (const key of [
    "content-type",
    "content-length",
    "cookie",
    "origin",
    "idempotency-key",
    "access-control-request-method",
    "access-control-request-headers",
  ]) {
    const value = req.headers[key];
    if (typeof value === "string") {
      headers[key] = value;
    }
  }

  const maximum = req.url?.startsWith("/api/public/") ? limits.requestBytes : 65536;
  const rejectLarge = () => {
    if (!res.headersSent) {
      res.writeHead(413, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ code: "PAYLOAD_TOO_LARGE" }));
    }
  };

  if (Number(req.headers["content-length"]) > maximum) {
    rejectLarge();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const upstream = httpRequest({
      hostname: "127.0.0.1",
      port: config.apiPort,
      path: req.url,
      method: req.method,
      headers,
    });
    let received = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        if (received > maximum) {
          rejectLarge();
          callback(new Error("PAYLOAD_TOO_LARGE"));
        } else {
          callback(null, chunk);
        }
      },
    });
    const timer = setTimeout(() => upstream.destroy(new Error("UPSTREAM_TIMEOUT")), 65000);
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };

    const fail = (error: unknown) => {
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error("PROXY_ERROR"));
    };

    res.once("close", () => {
      upstream.destroy();
      finish();
    });
    req.once("aborted", () => {
      upstream.destroy();
      finish();
    });
    upstream.once("response", response => {
      const outgoing: Record<string, string | string[]> = {};
      for (const key of [
        "content-type",
        "content-length",
        "cache-control",
        "content-security-policy",
        "x-content-type-options",
        "set-cookie",
        "access-control-allow-origin",
        "access-control-allow-methods",
        "access-control-allow-headers",
        "access-control-max-age",
        "access-control-expose-headers",
        "vary",
        "retry-after",
        "x-request-id",
      ]) {
        const value = response.headers[key];
        if (value !== undefined) {
          outgoing[key] = value;
        }
      }

      if (res.headersSent) {
        response.destroy();
        finish();
        return;
      }

      res.writeHead(response.statusCode ?? 502, outgoing);
      void pipeline(response, res).then(finish, fail);
    });
    upstream.once("error", fail);
    // 逐块转发并传递背压，不在 Web 层缓存上传正文。
    void pipeline(req, meter, upstream).catch(fail);
  });
}
