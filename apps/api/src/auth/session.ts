import { BusinessError, hashToken, randomToken } from "@echo-feedback/runtime";
import { type FastifyReply, type FastifyRequest } from "fastify";

import { type ApiContext } from "../context.js";

export function session(ctx: ApiContext, req: FastifyRequest) {
  const token = req.cookies[ctx.config.cookieName];
  if (!token || !/^[\w-]{43}$/.test(token)) {
    return undefined;
  }

  const row = ctx.repo.getSession(hashToken(token));
  return row && row.expiresAt > Date.now() ? row : undefined;
}

export function requireAdmin(ctx: ApiContext, req: FastifyRequest) {
  const row = session(ctx, req);
  if (!row) {
    throw new BusinessError("AUTH_REQUIRED", 401);
  }

  return row;
}

export function startSession(ctx: ApiContext, reply: FastifyReply) {
  const token = randomToken();
  ctx.repo.createSession(hashToken(token), Date.now() + ctx.config.sessionTtl);
  void reply.setCookie(ctx.config.cookieName, token, {
    httpOnly: true,
    secure: ctx.config.env === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ctx.config.sessionTtl / 1000,
  });
}

export function clearSession(ctx: ApiContext, reply: FastifyReply) {
  void reply.clearCookie(ctx.config.cookieName, {
    path: "/",
    httpOnly: true,
    secure: ctx.config.env === "production",
    sameSite: "lax",
  });
}
