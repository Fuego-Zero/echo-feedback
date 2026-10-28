import { createReadStream } from "node:fs";

import { feedbackUpdateSchema, idSchema, pageQuerySchema } from "@echo-feedback/contracts";
import { BusinessError } from "@echo-feedback/runtime";

import { type ApiContext } from "../context.js";
import { submitFeedback } from "./submit.js";

export function registerFeedback(ctx: ApiContext) {
  const { app, repo, images } = ctx;
  app.get("/api/admin/feedback", req => repo.listFeedback(pageQuerySchema.parse(req.query)));
  app.get<{ Params: { id: string } }>("/api/admin/feedback/:id", req =>
    repo.getFeedback(idSchema.parse(req.params.id))
  );
  app.patch<{ Params: { id: string } }>("/api/admin/feedback/:id", req =>
    repo.updateFeedback(idSchema.parse(req.params.id), feedbackUpdateSchema.parse(req.body))
  );
  app.get<{ Params: { id: string; attachmentId: string } }>(
    "/api/admin/feedback/:id/attachments/:attachmentId",
    (req, reply) => {
      const image = repo.attachment(idSchema.parse(req.params.attachmentId), idSchema.parse(req.params.id));
      if (!image) {
        throw new BusinessError("NOT_FOUND", 404);
      }

      return reply
        .type("image/webp")
        .header("Cache-Control", "private, no-store")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .send(createReadStream(images.path(image.diskName)));
    }
  );
  app.post<{ Params: { ak: string } }>("/api/public/projects/:ak/feedback", req =>
    submitFeedback(ctx, req, req.params.ak)
  );
}
