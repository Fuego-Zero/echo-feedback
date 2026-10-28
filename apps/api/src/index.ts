import { randomUUID } from "node:crypto";

import { limits } from "@echo-feedback/contracts";
import {
  BusinessError,
  type Config,
  ImageStorage,
  type LogEntry,
  RateLimiter,
  type Repository,
} from "@echo-feedback/runtime";
import cookie from "@fastify/cookie";
import cors, { type FastifyCorsOptions } from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyRequest } from "fastify";
import { ZodError } from "zod";

import { registerAuth } from "./auth/routes.js";
import { requireAdmin } from "./auth/session.js";
import { type ApiContext } from "./context.js";
import { allowsOrigin } from "./feedback/origin.js";
import { registerFeedback } from "./feedback/routes.js";
import { registerProjects } from "./projects/routes.js";

export async function createApiServer(config: Config, repo: Repository, log: (entry: LogEntry) => void) {
  const app = Fastify({
    logger: false,
    bodyLimit: 65536,
    requestTimeout: 60000,
    connectionTimeout: 65000,
    genReqId: () => randomUUID(),
    trustProxy: "127.0.0.1",
  });
  const images = new ImageStorage(config);
  await images.initialize();
  await images.cleanup(repo);
  const cleanup = setInterval(() => {
    void images.cleanup(repo).catch(() => log({ operation: "storage.cleanup", code: "CLEANUP_FAILED" }));
  }, 3600000);
  cleanup.unref();
  app.addHook("onClose", (_instance, done) => {
    clearInterval(cleanup);
    done();
  });
  const ctx: ApiContext = { app, config, repo, images, limiter: new RateLimiter(), log };
  await app.register(cookie);
  await app.register(
    cors,
    () => (req: FastifyRequest, callback: (error: Error | null, options?: FastifyCorsOptions) => void) => {
      const ak = /^\/api\/public\/projects\/([\w-]{43})\/feedback(?:\?|$)/.exec(req.url)?.[1];
      const project = ak ? repo.getProjectByAk(ak) : undefined;
      callback(null, {
        origin: project && allowsOrigin(project, req.headers.origin) ? (req.headers.origin ?? false) : false,
        credentials: false,
        methods: ["POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Idempotency-Key"],
        exposedHeaders: ["Retry-After", "X-Request-Id"],
        maxAge: 300,
      });
    }
  );
  app.addHook("onRequest", async (req, reply) => {
    void reply
      .header("X-Request-Id", req.id)
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", "no-store");
    const path = req.url.split("?")[0];
    const match = /^\/api\/public\/projects\/([\w-]{43})\/feedback$/.exec(path);
    if (match) {
      if (req.method !== "OPTIONS") {
        ctx.limiter.consume(`submit:${req.ip}`, config.ipLimit);
        ctx.limiter.consume(`project:${req.ip}:${match[1]}`, config.projectLimit);
      }

      const project = repo.getProjectByAk(match[1]);
      if (!project?.enabled) {
        throw new BusinessError("PROJECT_UNAVAILABLE", 403);
      }

      if (!allowsOrigin(project, req.headers.origin)) {
        throw new BusinessError("ORIGIN_DENIED", 403);
      }
    } else {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && req.headers.origin !== config.webOrigin) {
        throw new BusinessError("ORIGIN_DENIED", 403);
      }

      if (path.startsWith("/api/admin/")) {
        requireAdmin(ctx, req);
      }

      if (path === "/api/auth/login" || path === "/api/setup/admin" || path === "/api/auth/password") {
        ctx.limiter.consume(`auth:${req.ip}`, config.loginLimit);
      }
    }
  });
  await app.register(multipart, {
    limits: { files: limits.images, fields: 1, parts: 4, fieldSize: limits.metadataBytes, fileSize: limits.imageBytes },
  });
  app.addHook("preParsing", (_req, reply, payload, done) => {
    let bytes = 0;
    // multipart 直接消费 request.raw；不能用无人消费的替换流施加背压。
    // 同步注册旁路计数后立即交回原流，解析器仍负责正常背压和错误传播。
    payload.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > limits.requestBytes && !reply.sent) {
        payload.pause();
        reply.raw.once("finish", () => payload.destroy());
        void reply.send(new BusinessError("PAYLOAD_TOO_LARGE", 413));
      }
    });
    payload.on("error", () => {
      /* Fastify 和 multipart 各自处理消费错误，计数器不再次抛出。 */
    });
    done(null, payload);
  });
  app.setErrorHandler((error, req, reply) => {
    const known = error instanceof BusinessError;
    const candidate = error as { code?: string; statusCode?: number };
    let status = known ? error.status : 500;
    let code = known ? error.code : "INTERNAL_ERROR";
    if (candidate.code === "ENOSPC" || candidate.code === "EDQUOT") {
      status = 507;
      code = "STORAGE_FULL";
    } else if (error instanceof ZodError || candidate.code === "FST_ERR_CTP_INVALID_JSON_BODY") {
      status = 400;
      code = "INVALID_INPUT";
    } else if (!known && candidate.statusCode && candidate.statusCode < 500) {
      status = candidate.statusCode;
      code = status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_INPUT";
    }

    if (status === 429 || status === 503) {
      void reply.header("Retry-After", "60");
    }

    log({ requestId: req.id, operation: req.routeOptions.url ?? "unknown", status, code });
    void reply.code(status).send({ code, requestId: req.id });
  });
  app.addHook("onResponse", async (req, reply) => {
    log({
      requestId: req.id,
      operation: req.routeOptions.url ?? "unknown",
      status: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime),
    });
  });
  app.get("/api/health/live", () => ({ status: "ok" }));
  app.get("/api/health/ready", async () => {
    repo.health();
    await images.health();
    return { status: "ready" };
  });
  registerAuth(ctx);
  registerProjects(ctx);
  registerFeedback(ctx);
  return app;
}
