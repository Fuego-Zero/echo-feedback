import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

import { type FeedbackInput, feedbackInputSchema, limits, submissionKeySchema } from "@echo-feedback/contracts";
import { BusinessError, type PreparedImage } from "@echo-feedback/runtime";
import { type FastifyRequest } from "fastify";

import { type ApiContext } from "../context.js";

export async function submitFeedback(ctx: ApiContext, req: FastifyRequest, ak: string) {
  const key = submissionKeySchema.parse(req.headers["idempotency-key"]);
  let input: FeedbackInput | undefined;
  const prepared: PreparedImage[] = [];
  const rawPaths: string[] = [];
  let committed = false;
  try {
    if (!req.isMultipart()) {
      throw new BusinessError("INVALID_INPUT", 415);
    }

    for await (const part of req.parts({
      limits: {
        files: limits.images,
        fields: 1,
        parts: limits.images + 1,
        fieldSize: limits.metadataBytes,
        fileSize: limits.imageBytes,
      },
    })) {
      if (part.type === "field") {
        if (part.fieldname !== "metadata" || input || part.valueTruncated || typeof part.value !== "string") {
          throw new BusinessError("INVALID_INPUT");
        }

        let data: unknown;
        try {
          data = JSON.parse(part.value);
        } catch {
          throw new BusinessError("INVALID_INPUT");
        }

        input = feedbackInputSchema.parse(data);
      } else {
        if (!input || part.fieldname !== "images") {
          part.file.resume();
          throw new BusinessError("INVALID_INPUT");
        }

        const rawPath = ctx.images.temporaryPath();
        rawPaths.push(rawPath);
        // 顺序消费 multipart 文件流，保持内存有界。

        await pipeline(part.file, createWriteStream(rawPath, { flags: "wx", mode: 0o600 }));
        if (part.file.truncated) {
          throw new BusinessError("IMAGE_TOO_LARGE", 413);
        }

        prepared.push(await ctx.images.prepare(rawPath, part.mimetype));
      }
    }

    if (!input) {
      throw new BusinessError("INVALID_INPUT");
    }

    const digest = createHash("sha256")
      .update(JSON.stringify({ input, images: prepared.map(image => image.digest) }))
      .digest("hex");
    const project = ctx.repo.getProjectByAk(ak);
    if (!project?.enabled) {
      throw new BusinessError("PROJECT_UNAVAILABLE", 403);
    }

    const existing = ctx.repo.findSubmission(project.id, key);
    if (existing) {
      if (existing.digest !== digest) {
        throw new BusinessError("IDEMPOTENCY_CONFLICT", 409);
      }

      return { receipt: existing.id };
    }

    const promotions = await Promise.allSettled(prepared.map(image => ctx.images.promote(image)));
    const failed = promotions.find(result => result.status === "rejected");
    if (failed?.status === "rejected") {
      throw failed.reason;
    }

    const id = randomUUID();
    const receipt = ctx.repo.transaction(() => {
      if (!ctx.repo.getProject(project.id)?.enabled) {
        throw new BusinessError("PROJECT_UNAVAILABLE", 403);
      }

      const duplicate = ctx.repo.findSubmission(project.id, key);
      if (duplicate) {
        if (duplicate.digest !== digest) {
          throw new BusinessError("IDEMPOTENCY_CONFLICT", 409);
        }

        return duplicate.id;
      }

      const bytes = prepared.reduce((total, image) => total + image.size, 0);
      if (bytes && ctx.repo.storageBytes() + bytes > ctx.config.capacity) {
        throw new BusinessError("STORAGE_FULL", 507);
      }

      ctx.repo.insertFeedback(
        id,
        project.id,
        input!,
        key,
        digest,
        prepared.map((image, position) => ({
          id: image.id,
          feedbackId: id,
          diskName: image.diskName,
          format: "webp",
          size: image.size,
          width: image.width,
          height: image.height,
          position,
        }))
      );
      committed = true;
      return id;
    });
    ctx.log({ operation: "feedback.submit", resourceId: receipt, status: 200 });
    return { receipt };
  } finally {
    const paths = [...rawPaths, ...(!committed ? prepared.map(image => image.path) : [])];
    const results = await Promise.allSettled(paths.map(path => ctx.images.remove(path)));
    if (results.some(result => result.status === "rejected")) {
      ctx.log({ operation: "upload.cleanup", code: "CLEANUP_FAILED" });
    }
  }
}
