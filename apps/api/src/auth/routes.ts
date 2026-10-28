import { loginSchema, passwordChangeSchema, setupSchema } from "@echo-feedback/contracts";
import { BusinessError, equalSecret, hashPassword, verifyPassword } from "@echo-feedback/runtime";

import { type ApiContext } from "../context.js";
import { clearSession, requireAdmin, session, startSession } from "./session.js";

export function registerAuth(ctx: ApiContext) {
  const { app, repo, config } = ctx;
  app.get("/api/setup/status", () => ({ needed: !repo.getAdmin() }));
  app.post("/api/setup/admin", async (req, reply) => {
    const input = setupSchema.parse(req.body);
    if (repo.getAdmin()) {
      throw new BusinessError("SETUP_CLOSED", 403);
    }

    if (!equalSecret(input.setupToken, config.setupToken)) {
      throw new BusinessError("INVALID_CREDENTIALS", 401);
    }

    repo.createAdmin(input.username, await hashPassword(input.password));
    startSession(ctx, reply);
    return { username: input.username };
  });
  app.post("/api/auth/login", async (req, reply) => {
    const input = loginSchema.parse(req.body);
    const admin = repo.getAdmin();
    const valid = await verifyPassword(input.password, admin?.passwordHash);
    if (!valid || admin?.username !== input.username) {
      throw new BusinessError("INVALID_CREDENTIALS", 401);
    }

    startSession(ctx, reply);
    return { username: admin.username };
  });
  app.get("/api/auth/session", req => ({ username: session(ctx, req) ? repo.getAdmin()?.username : null }));
  app.post("/api/auth/logout", (req, reply) => {
    const current = session(ctx, req);
    if (current) {
      repo.removeSession(current.id);
    }

    clearSession(ctx, reply);
    return { success: true };
  });
  app.put("/api/auth/password", async (req, reply) => {
    requireAdmin(ctx, req);
    const input = passwordChangeSchema.parse(req.body);
    const admin = repo.getAdmin();
    if (!admin || !(await verifyPassword(input.currentPassword, admin.passwordHash))) {
      throw new BusinessError("INVALID_CREDENTIALS", 401);
    }

    const passwordHash = await hashPassword(input.newPassword);
    // 改密计算完成后重新确认当前会话，避免撤销期间写入。
    requireAdmin(ctx, req);
    repo.changePassword(passwordHash);
    clearSession(ctx, reply);
    return { success: true };
  });
}
