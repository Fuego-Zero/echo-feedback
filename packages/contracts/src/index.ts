import { z } from "zod";

import { limits } from "./limits.js";

export { limits } from "./limits.js";
export const statuses = ["pending", "processing", "resolved"] as const;
export type FeedbackStatus = (typeof statuses)[number];
export const statusLabels: Record<FeedbackStatus, string> = {
  pending: "待处理",
  processing: "处理中",
  resolved: "已处理",
};

export function sanitizeSourcePage(value: string | undefined): string {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.origin + url.pathname : "";
  } catch {
    return "";
  }
}

const optionalText = (max: number) => z.string().trim().max(max).default("");
export const feedbackInputSchema = z.strictObject({
  content: z.string().trim().min(1).max(limits.content),
  contact: optionalText(limits.contact),
  userId: optionalText(limits.userId),
  projectVersion: optionalText(limits.projectVersion),
  sourcePage: optionalText(limits.sourcePage).transform(sanitizeSourcePage),
});
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;
export const originSchema = z
  .string()
  .max(2048)
  .refine(value => {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && value === url.origin;
    } catch {
      return false;
    }
  }, "请填写完整 Origin，例如 https://app.example.com");
export const projectInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  description: optionalText(500),
  enabled: z.boolean().default(true),
  allowedOrigins: z.array(originSchema).max(50).default([]),
  allowExtensionClients: z.boolean().default(false),
});
export type ProjectInput = z.infer<typeof projectInputSchema>;
export interface Project extends ProjectInput {
  ak: string;
  createdAt: number;
  id: string;
  updatedAt: number;
}
export const feedbackUpdateSchema = z.strictObject({
  status: z.enum(statuses),
  note: z.string().max(limits.note),
});
export const loginSchema = z.strictObject({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});
export const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .refine(value => /[a-zA-Z]/.test(value) && /\d/.test(value), "密码至少 12 位，包含字母和数字");
export const setupSchema = loginSchema.extend({ password: passwordSchema, setupToken: z.string().min(1).max(256) });
export const passwordChangeSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
export const idSchema = z.uuid();
export const submissionKeySchema = z.uuid();
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(2147483647).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const pageQuerySchema = paginationQuerySchema.extend({
  projectId: z.uuid().optional(),
  status: z.enum(statuses).optional(),
});
export interface Attachment {
  feedbackId: string;
  format: "webp";
  height: number;
  id: string;
  position: number;
  size: number;
  width: number;
}
export interface Feedback extends FeedbackInput {
  attachments: Attachment[];
  createdAt: number;
  id: string;
  note: string;
  projectId: string;
  projectName: string;
  status: FeedbackStatus;
  updatedAt: number;
}
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
export interface Receipt {
  receipt: string;
}
