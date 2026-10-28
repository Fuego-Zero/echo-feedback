import type { Feedback, Project, Page as ResultPage } from "@echo-feedback/contracts";
import { expect, test } from "@playwright/test";

const origin = { origin: "http://127.0.0.1:18730" };

test("列表分页、条数切换、末页回退及跨页项目筛选", async ({ page }) => {
  const { request } = page;
  await request.post("/api/setup/admin", {
    headers: origin,
    data: { username: "owner", password: "Synthetic12345", setupToken: "synthetic-e2e-setup-token-123456789" },
  });
  await request.post("/api/auth/login", { headers: origin, data: { username: "owner", password: "Synthetic12345" } });
  const created = await request.post("/api/admin/projects", { headers: origin, data: { name: "分页目标项目" } });
  const project = (await created.json()) as Project;
  await Promise.all(
    Array.from({ length: 23 }, (_, i) =>
      request.post("/api/admin/projects", { headers: origin, data: { name: `翻页验收项目 ${i}` } })
    )
  );
  await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      request.post(`/api/public/projects/${project.ak}/feedback`, {
        headers: { ...origin, "idempotency-key": crypto.randomUUID() },
        multipart: { metadata: JSON.stringify({ content: `分页验收反馈 ${i}` }) },
      })
    )
  );
  await page.goto("/");
  await page.getByLabel("筛选项目").click();
  await page.getByLabel("筛选项目").fill(project.name);
  await page.locator(".ant-select-dropdown").getByText(project.name, { exact: true }).click();
  await expect(page.locator(".feedback-card")).toHaveCount(6);
  await expect(page.getByRole("navigation", { name: "列表分页" })).toContainText("共 6 条 · 第 1 / 1 页");
  await page.getByLabel("每页条数").click();
  await page.locator(".ant-select-dropdown").getByText("5 条", { exact: true }).click();
  await expect(page.locator(".feedback-card")).toHaveCount(5);
  await page.locator('.ant-pagination-item[title="2"]').click();
  await expect(page.locator(".feedback-card")).toHaveCount(1);
  await page.getByRole("group", { name: "筛选状态" }).getByRole("button", { name: "待处理", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "列表分页" })).toContainText("第 1 / 2 页");
  await page.locator('.ant-pagination-item[title="2"]').click();
  await expect(page.locator(".feedback-card")).toHaveCount(1);
  const last = (await (
    await request.get(`/api/admin/feedback?page=2&pageSize=5&projectId=${project.id}&status=pending`)
  ).json()) as ResultPage<Feedback>;
  await request.patch(`/api/admin/feedback/${last.items[0].id}`, {
    headers: origin,
    data: { status: "resolved", note: "末页回退验收" },
  });
  await page.getByRole("button", { name: "刷新反馈" }).click();
  await expect(page.locator(".feedback-card")).toHaveCount(5);
  await expect(page.getByRole("navigation", { name: "列表分页" })).toContainText("共 5 条 · 第 1 / 1 页");
  await page.screenshot({ path: ".tmp/playwright/screenshots/pagination-feedback.png" });
  await page.getByRole("button", { name: "项目接入", exact: true }).click();
  await page.getByLabel("每页条数").click();
  await page.locator(".ant-select-dropdown").getByText("5 条", { exact: true }).click();
  await expect(page.locator(".ant-table-row")).toHaveCount(5);
  const firstId = await page.locator(".ant-table-row").first().getAttribute("data-row-key");
  await page.locator('.ant-pagination-item[title="2"]').click();
  await expect(page.locator(".ant-table-row").first()).not.toHaveAttribute("data-row-key", firstId!);
  await expect(page.getByRole("navigation", { name: "列表分页" })).toContainText("第 2 /");
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.locator(".project-card")).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: ".tmp/playwright/screenshots/pagination-projects-mobile.png" });
  await page.getByLabel("每页条数").click();
  await page.locator(".ant-select-dropdown").getByText("20 条", { exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(20);
  await expect(page.getByRole("navigation", { name: "列表分页" })).toContainText("第 1 /");
});
