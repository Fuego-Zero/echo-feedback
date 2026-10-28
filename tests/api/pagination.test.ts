import { randomUUID } from "node:crypto";

import { feedbackInputSchema, type Page, projectInputSchema } from "@echo-feedback/contracts";
import { afterEach, expect, it } from "vitest";

import { fixture } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof fixture>> | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

it("项目与反馈服务端分页、筛选总数、越界与参数校验", async () => {
  ctx = await fixture();
  const { app, repo, adminHeaders } = ctx;
  const projects = Array.from({ length: 23 }, (_, i) =>
    repo.saveProject(projectInputSchema.parse({ name: `分页项目 ${i}` }))
  );
  const get = async (url: string) => {
    const response = await app.inject({ url, headers: adminHeaders });
    expect(response.statusCode).toBe(200);
    return response.json<Page<{ id: string }>>();
  };

  const first = await get("/api/admin/projects?page=1&pageSize=20");
  const second = await get("/api/admin/projects?page=2&pageSize=20");
  expect(first).toMatchObject({ total: 23, page: 1, pageSize: 20 });
  expect(first.items).toHaveLength(20);
  expect(second.items).toHaveLength(3);
  expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(23);
  expect((await get("/api/admin/projects?page=2&pageSize=20")).items).toEqual(second.items);
  expect((await get("/api/admin/projects?page=9&pageSize=20")).items).toEqual([]);
  expect((await get("/api/admin/projects")).items).toHaveLength(20);
  const options = await get("/api/admin/projects/options");
  expect(options.items).toHaveLength(23);
  expect(Object.keys(options.items[0]).sort()).toEqual(["id", "name"]);
  for (let i = 0; i < 12; i += 1) {
    const id = randomUUID();
    repo.insertFeedback(
      id,
      projects[0].id,
      feedbackInputSchema.parse({ content: `分页反馈 ${i}` }),
      randomUUID(),
      `digest-${i}`,
      []
    );
    if (i < 2) {
      repo.updateFeedback(id, { status: "resolved", note: "" });
    }
  }

  repo.insertFeedback(
    randomUUID(),
    projects[1].id,
    feedbackInputSchema.parse({ content: "另一项目" }),
    randomUUID(),
    "other",
    []
  );
  const query = `/api/admin/feedback?projectId=${projects[0].id}&status=pending&pageSize=5`;
  const feedbackFirst = await get(`${query}&page=1`);
  const feedbackSecond = await get(`${query}&page=2`);
  expect(feedbackFirst).toMatchObject({ total: 10, pageSize: 5 });
  expect(feedbackFirst.items).toHaveLength(5);
  expect(feedbackSecond.items).toHaveLength(5);
  expect(new Set([...feedbackFirst.items, ...feedbackSecond.items].map(item => item.id)).size).toBe(10);
  expect((await get(`${query}&page=3`)).items).toEqual([]);
  const invalid = [
    "page=0",
    "page=-1",
    "page=1.5",
    "page=abc",
    "page=99999999999999999999",
    "pageSize=0",
    "pageSize=101",
  ];
  const responses = await Promise.all(
    ["projects", "feedback"].flatMap(path =>
      invalid.map(query => app.inject({ url: `/api/admin/${path}?${query}`, headers: adminHeaders }))
    )
  );
  expect(responses.every(response => response.statusCode === 400)).toBe(true);
});
