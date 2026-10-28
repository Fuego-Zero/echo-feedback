import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const admins = sqliteTable("admin", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
});
export const sessions = sqliteTable("session", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
export const projects = sqliteTable("project", {
  id: text("id").primaryKey(),
  ak: text("ak").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  allowedOriginsJson: text("allowed_origins").notNull(),
  allowExtensionClients: integer("allow_extension_clients", { mode: "boolean" }).notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const feedbacks = sqliteTable("feedback", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  content: text("content").notNull(),
  contact: text("contact").notNull(),
  userId: text("user_id").notNull(),
  projectVersion: text("project_version").notNull(),
  sourcePage: text("source_page").notNull(),
  status: text("status", { enum: ["pending", "processing", "resolved"] }).notNull(),
  note: text("note").notNull(),
  submissionKey: text("submission_key").notNull(),
  digest: text("digest").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const attachments = sqliteTable("attachment", {
  id: text("id").primaryKey(),
  feedbackId: text("feedback_id").notNull(),
  diskName: text("disk_name").notNull(),
  format: text("format", { enum: ["webp"] }).notNull(),
  size: integer("size").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  position: integer("position").notNull(),
});
