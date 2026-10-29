import { randomUUID } from "node:crypto";

import {
  type FeedbackInput,
  type FeedbackStatus,
  originSchema,
  type Project,
  type ProjectInput,
} from "@echo-feedback/contracts";
import { and, count, desc, eq, isNull, lt, sum } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { z } from "zod";

import { BusinessError } from "./errors.js";
import { openDatabase } from "./migrate.js";
import * as schema from "./schema.js";
import { randomToken } from "./security.js";

type ProjectRow = typeof schema.projects.$inferSelect;
export type StoredAttachment = typeof schema.attachments.$inferSelect;
const projectFromRow = (row: ProjectRow): Project => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 删除标记仅用于持久化，不暴露到项目协议。
  const { allowedOriginsJson, deletedAt: _deletedAt, ...value } = row;
  return { ...value, allowedOrigins: z.array(originSchema).parse(JSON.parse(allowedOriginsJson)) };
};

export class Repository {
  private sqlite;
  private db;
  constructor(path: string) {
    this.sqlite = openDatabase(path);
    this.db = drizzle(this.sqlite);
  }
  close() {
    this.sqlite.close();
  }
  health() {
    this.sqlite.prepare("SELECT 1").get();
  }
  backup(path: string) {
    return this.sqlite.backup(path);
  }
  transaction<T>(fn: () => T): T {
    return this.sqlite.transaction(fn).immediate();
  }
  getAdmin() {
    return this.db.select().from(schema.admins).get();
  }
  createAdmin(username: string, passwordHash: string) {
    this.transaction(() => {
      if (this.getAdmin()) {
        throw new BusinessError("SETUP_CLOSED", 403);
      }

      this.db.insert(schema.admins).values({ id: "admin", username, passwordHash }).run();
    });
  }
  changePassword(passwordHash: string) {
    this.transaction(() => {
      this.db.update(schema.admins).set({ passwordHash }).where(eq(schema.admins.id, "admin")).run();
      this.db.delete(schema.sessions).run();
    });
  }
  createSession(id: string, expiresAt: number) {
    this.db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, Date.now())).run();
    this.db.insert(schema.sessions).values({ id, expiresAt, adminId: "admin" }).run();
  }
  getSession(id: string) {
    return this.db.select().from(schema.sessions).where(eq(schema.sessions.id, id)).get();
  }
  removeSession(id: string) {
    this.db.delete(schema.sessions).where(eq(schema.sessions.id, id)).run();
  }
  listProjects(query: { page: number; pageSize: number }) {
    return {
      items: this.db
        .select()
        .from(schema.projects)
        .where(isNull(schema.projects.deletedAt))
        .orderBy(desc(schema.projects.createdAt), desc(schema.projects.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
        .all()
        .map(projectFromRow),
      total: this.db.select({ total: count() }).from(schema.projects).where(isNull(schema.projects.deletedAt)).get()!
        .total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
  listProjectOptions() {
    return this.db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(isNull(schema.projects.deletedAt))
      .orderBy(desc(schema.projects.createdAt), desc(schema.projects.id))
      .all();
  }
  getProject(id: string) {
    const row = this.db
      .select()
      .from(schema.projects)
      .where(and(eq(schema.projects.id, id), isNull(schema.projects.deletedAt)))
      .get();
    return row && projectFromRow(row);
  }
  getProjectByAk(ak: string) {
    const row = this.db
      .select()
      .from(schema.projects)
      .where(and(eq(schema.projects.ak, ak), isNull(schema.projects.deletedAt)))
      .get();
    return row && projectFromRow(row);
  }
  deleteProject(id: string) {
    this.transaction(() => {
      if (!this.getProject(id)) {
        throw new BusinessError("NOT_FOUND", 404);
      }

      const now = Date.now();
      this.db
        .update(schema.projects)
        .set({ deletedAt: now, enabled: false, updatedAt: now })
        .where(eq(schema.projects.id, id))
        .run();
    });
  }
  saveProject(input: ProjectInput, id?: string) {
    const { allowedOrigins, ...fields } = input;
    const now = Date.now();
    const values = { ...fields, allowedOriginsJson: JSON.stringify([...new Set(allowedOrigins)]), updatedAt: now };
    if (id) {
      if (!this.getProject(id)) {
        throw new BusinessError("NOT_FOUND", 404);
      }

      this.db.update(schema.projects).set(values).where(eq(schema.projects.id, id)).run();
    } else {
      id = randomUUID();
      this.db
        .insert(schema.projects)
        .values({ ...values, id, ak: randomToken(), createdAt: now })
        .run();
    }

    return this.getProject(id)!;
  }
  findSubmission(projectId: string, submissionKey: string) {
    return this.db
      .select({ id: schema.feedbacks.id, digest: schema.feedbacks.digest })
      .from(schema.feedbacks)
      .where(and(eq(schema.feedbacks.projectId, projectId), eq(schema.feedbacks.submissionKey, submissionKey)))
      .get();
  }
  insertFeedback(
    id: string,
    projectId: string,
    input: FeedbackInput,
    submissionKey: string,
    digest: string,
    images: StoredAttachment[]
  ) {
    const now = Date.now();
    this.db
      .insert(schema.feedbacks)
      .values({
        ...input,
        id,
        projectId,
        submissionKey,
        digest,
        status: "pending",
        note: "",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    if (images.length) {
      this.db.insert(schema.attachments).values(images).run();
    }
  }
  attachments(id: string) {
    return this.db
      .select()
      .from(schema.attachments)
      .where(eq(schema.attachments.feedbackId, id))
      .orderBy(schema.attachments.position)
      .all();
  }
  attachment(id: string, feedbackId: string) {
    return this.db
      .select()
      .from(schema.attachments)
      .where(and(eq(schema.attachments.id, id), eq(schema.attachments.feedbackId, feedbackId)))
      .get();
  }
  storageBytes() {
    return Number(
      this.db
        .select({ total: sum(schema.attachments.size) })
        .from(schema.attachments)
        .get()?.total ?? 0
    );
  }
  diskNames() {
    return this.db
      .select({ diskName: schema.attachments.diskName })
      .from(schema.attachments)
      .all()
      .map(row => row.diskName);
  }
  getFeedback(id: string) {
    const row = this.db
      .select({ feedback: schema.feedbacks, projectName: schema.projects.name })
      .from(schema.feedbacks)
      .innerJoin(schema.projects, eq(schema.feedbacks.projectId, schema.projects.id))
      .where(eq(schema.feedbacks.id, id))
      .get();
    if (!row) {
      throw new BusinessError("NOT_FOUND", 404);
    }

    const { feedback } = row;
    return {
      id: feedback.id,
      projectId: feedback.projectId,
      projectName: row.projectName,
      content: feedback.content,
      contact: feedback.contact,
      userId: feedback.userId,
      projectVersion: feedback.projectVersion,
      sourcePage: feedback.sourcePage,
      status: feedback.status,
      note: feedback.note,
      createdAt: feedback.createdAt,
      updatedAt: feedback.updatedAt,
      attachments: this.attachments(id).map(image => ({
        id: image.id,
        feedbackId: image.feedbackId,
        format: image.format,
        size: image.size,
        width: image.width,
        height: image.height,
        position: image.position,
      })),
    };
  }
  listFeedback(query: { page: number; pageSize: number; projectId?: string; status?: FeedbackStatus }) {
    const where = and(
      query.projectId ? eq(schema.feedbacks.projectId, query.projectId) : undefined,
      query.status ? eq(schema.feedbacks.status, query.status) : undefined
    );
    const ids = this.db
      .select({ id: schema.feedbacks.id })
      .from(schema.feedbacks)
      .where(where)
      .orderBy(desc(schema.feedbacks.createdAt), desc(schema.feedbacks.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize)
      .all();
    return {
      items: ids.map(row => this.getFeedback(row.id)),
      total: this.db.select({ total: count() }).from(schema.feedbacks).where(where).get()!.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
  updateFeedback(id: string, input: { status: FeedbackStatus; note: string }) {
    this.getFeedback(id);
    this.db
      .update(schema.feedbacks)
      .set({ ...input, updatedAt: Date.now() })
      .where(eq(schema.feedbacks.id, id))
      .run();
    return this.getFeedback(id);
  }
}
