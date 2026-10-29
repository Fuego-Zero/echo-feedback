import { idSchema, paginationQuerySchema, projectInputSchema } from "@echo-feedback/contracts";

import { type ApiContext } from "../context.js";

export function registerProjects({ app, repo }: ApiContext) {
  app.get("/api/admin/projects", req => repo.listProjects(paginationQuerySchema.parse(req.query)));
  app.get("/api/admin/projects/options", () => ({ items: repo.listProjectOptions() }));
  app.delete<{ Params: { id: string } }>("/api/admin/projects/:id", req => {
    repo.deleteProject(idSchema.parse(req.params.id));
    return { deleted: true };
  });
  app.post("/api/admin/projects", (req, reply) => {
    const result = repo.saveProject(projectInputSchema.parse(req.body));
    return reply.code(201).send(result);
  });
  app.patch<{ Params: { id: string } }>("/api/admin/projects/:id", req =>
    repo.saveProject(projectInputSchema.parse(req.body), idSchema.parse(req.params.id))
  );
}
