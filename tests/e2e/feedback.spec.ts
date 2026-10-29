/* 顺序请求用于验证项目归属及后续依赖的回执。 */
/* eslint-disable no-await-in-loop */
import { mkdir } from "node:fs/promises";

import type { Feedback, Project } from "@echo-feedback/contracts";
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import sharp from "sharp";

const service = "http://127.0.0.1:18730";
const origin = { origin: service };
let projects: Project[];
test.beforeAll(async ({ request }) => {
  const setup = await request.post("/api/setup/admin", {
    headers: origin,
    data: { username: "owner", password: "Synthetic12345", setupToken: "synthetic-e2e-setup-token-123456789" },
  });
  if (!setup.ok()) {
    await login(request);
  }

  projects = [];
  for (const name of ["岁时记验收", "风铃验收", "芸笺协议验收"]) {
    const result = await request.post("/api/admin/projects", { headers: origin, data: { name } });
    expect(result.ok()).toBeTruthy();
    projects.push((await result.json()) as Project);
  }

  await mkdir(".tmp/playwright/screenshots", { recursive: true });
});

async function login(request: APIRequestContext) {
  expect(
    (
      await request.post("/api/auth/login", {
        headers: origin,
        data: { username: "owner", password: "Synthetic12345" },
      })
    ).ok()
  ).toBeTruthy();
}

async function host(page: Page, index = 0, theme = "light") {
  await page.goto(
    `http://127.0.0.1:${index === 1 ? "18733" : "18732"}/product?ak=${projects[index].ak}&theme=${theme}&uiStyle=${index === 1 ? "paper" : "classic"}&secret=must-not-collect#private`
  );
  await page.getByRole("button", { name: "提出建议" }).click();
}

const png = () =>
  sharp({ create: { width: 90, height: 70, channels: 3, background: "#608e74" } })
    .png()
    .toBuffer();

test("PC/H5 两项目文字图片、后台筛选与处理、附件保护", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await host(page);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("反馈内容").fill('希望增加搜索入口 <img src=x onerror="alert(1)">');
  await page
    .getByLabel("选择反馈图片")
    .setInputFiles({ name: "preview.png", mimeType: "image/png", buffer: await png() });
  await page.getByLabel("联系方式").fill("可选联系信息");
  await page.screenshot({ path: ".tmp/playwright/screenshots/sdk-desktop.png" });
  const response = page.waitForResponse(res => res.url().includes("/api/public/") && res.request().method() === "POST");
  await page.getByRole("button", { name: "提交反馈", exact: true }).click();
  expect((await response).ok()).toBeTruthy();
  await expect(page.getByText("已收到你的反馈")).toBeVisible();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(page.locator("#canvas")).toBeFocused();
  await page.getByLabel("宿主输入").fill("宿主仍可使用");
  expect(errors).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await host(page, 1);
  await page.getByLabel("反馈内容").fill("手机横屏时希望操作区域更清楚");
  await page
    .getByLabel("选择反馈图片")
    .setInputFiles({ name: "phone.png", mimeType: "image/png", buffer: await png() });
  await page.screenshot({ path: ".tmp/playwright/screenshots/sdk-mobile.png" });
  const box = await page.getByRole("dialog").boundingBox();
  expect(box?.width).toBe(390);
  await page.getByRole("button", { name: "提交反馈", exact: true }).click();
  await expect(page.getByText("已收到你的反馈")).toBeVisible();

  await login(request);
  const listed = await request.get(`/api/admin/feedback?projectId=${projects[1].id}`);
  const list = (await listed.json()) as { items: Feedback[]; total: number };
  expect(list.total).toBe(1);
  expect(list.items[0].projectId).toBe(projects[1].id);
  expect(list.items[0].sourcePage).toBe("http://127.0.0.1:18733/product");
  expect(list.items[0].userId).toBe("");
  const attachment = `/api/admin/feedback/${list.items[0].id}/attachments/${list.items[0].attachments[0].id}`;
  expect((await request.get(attachment)).ok()).toBeTruthy();
  const anonymous = await page.request.get(attachment);
  expect(anonymous.status()).toBe(401);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(service);
  await page.getByLabel("管理员账号").fill("owner");
  await page.getByLabel("密码", { exact: true }).fill("Synthetic12345");
  await page.getByRole("button", { name: /登\s*录/ }).click();
  await expect(page.getByRole("button", { name: '希望增加搜索入口 <img src=x onerror="alert(1)">' })).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await page.getByLabel("筛选项目").click();
  await page.getByText("风铃验收", { exact: true }).last().click();
  await page.getByRole("button", { name: "手机横屏时希望操作区域更清楚" }).click();
  await page.locator(".feedback-status").getByText("已解决", { exact: true }).click();
  await page.getByLabel("内部处理备注").fill("已经调整，待下个版本发布");
  await page.getByRole("button", { name: "保存处理记录" }).click();
  await expect(page.locator(".feedback-card .status-tag").getByText("已解决", { exact: true })).toBeVisible();
  await page.screenshot({ path: ".tmp/playwright/screenshots/admin-inbox.png" });
  const saved = await request.get(`/api/admin/feedback/${list.items[0].id}`);
  expect(((await saved.json()) as Feedback).status).toBe("resolved");
});

test("响应丢失后重试不重复、无账号传输、不污染宿主及销毁", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await host(page, 0, "dark");
  await page.getByLabel("反馈内容").fill("网络重试验收");
  await page
    .getByLabel("选择反馈图片")
    .setInputFiles({ name: "retry.png", mimeType: "image/png", buffer: await png() });
  await page.screenshot({ path: ".tmp/playwright/screenshots/sdk-dark.png" });
  const keys: string[] = [];
  let dropped = false;
  await page.route("**/api/public/**", async route => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    keys.push(route.request().headers()["idempotency-key"]);
    expect(route.request().headers().cookie).toBeUndefined();
    expect(route.request().headers().authorization).toBeUndefined();
    expect(route.request().headers().referer).toBeUndefined();
    if (!dropped) {
      dropped = true;
      const saved = await route.fetch();
      expect(saved.ok()).toBeTruthy();
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });
  await page.getByRole("button", { name: "提交反馈", exact: true }).click();
  await expect(page.getByRole("button", { name: "重试本次提交" })).toBeVisible();
  await expect(page.getByLabel("反馈内容")).toBeDisabled();
  await page.getByRole("button", { name: "重试本次提交" }).click();
  await expect(page.getByText("已收到你的反馈")).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await login(request);
  const result = await request.get(`/api/admin/feedback?projectId=${projects[0].id}`);
  const all = (await result.json()) as { items: Feedback[] };
  expect(all.items.filter(item => item.content === "网络重试验收")).toHaveLength(1);
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.getByRole("button", { name: "进入全屏" }).click();
  await page.getByRole("button", { name: "提出建议" }).click();
  await page.getByLabel("反馈内容").pressSequentially("abc");
  expect(await page.evaluate(() => (window as unknown as { hostKeys: number }).hostKeys)).toBe(0);
  const originalColor = await page.getByLabel("宿主输入").evaluate(element => getComputedStyle(element).borderTopColor);
  expect(originalColor).toBe("rgb(255, 0, 0)");
  await page.evaluate(() => {
    const win = window as unknown as { feedback: { destroy: () => void }; mountFeedback: () => void };
    win.feedback.destroy();
    win.feedback.destroy();
    win.mountFeedback();
  });
  await expect(page.locator("echo-feedback")).toHaveCount(1);
  await page.getByRole("button", { name: "提出建议" }).click();
  await expect(page.getByLabel("反馈内容")).toHaveValue("");
  expect(errors).toEqual([]);
});

test("停用项目错误可读，扩展无 Origin 提交无需登录", async ({ page, request }) => {
  await login(request);
  const project = projects[2];
  const update = {
    name: project.name,
    description: "",
    allowedOrigins: [],
    enabled: false,
    allowExtensionClients: true,
  };
  await request.patch(`/api/admin/projects/${project.id}`, { headers: origin, data: update });
  await host(page, 2);
  await page.getByLabel("反馈内容").fill("暂停项目");
  await page.getByRole("button", { name: "提交反馈", exact: true }).click();
  await expect(page.getByText("该项目已暂停接收反馈。")).toBeVisible();
  await request.patch(`/api/admin/projects/${project.id}`, { headers: origin, data: { ...update, enabled: true } });
  const result = await page.request.post(`${service}/api/public/projects/${project.ak}/feedback`, {
    headers: { "idempotency-key": crypto.randomUUID() },
    multipart: {
      metadata: JSON.stringify({ content: "扩展协议提交", sourcePage: "chrome-extension://example/popup.html" }),
    },
  });
  expect(result.ok()).toBeTruthy();
});

test("后台创建、编辑、停用与接入示例", async ({ page }) => {
  await page.goto(service);
  await page.getByLabel("管理员账号").fill("owner");
  await page.getByLabel("密码", { exact: true }).fill("Synthetic12345");
  await page.getByRole("button", { name: /登\s*录/ }).click();
  await page.getByRole("button", { name: "项目接入" }).click();
  await page.getByRole("button", { name: "创建项目" }).click();
  await page.getByLabel("项目名称").fill("界面项目验收");
  await page.getByLabel("允许的网页来源").fill("invalid-origin");
  await page.getByRole("button", { name: "保存项目" }).click();
  await expect(page.locator(".ant-form-item-explain-error")).toHaveText(
    "请填写完整 Origin，例如 https://app.example.com"
  );
  await expect(page.locator(".ant-message-notice")).toHaveCount(0);
  await page.getByLabel("允许的网页来源").fill("");
  await page.getByRole("button", { name: "保存项目" }).click();
  const row = page.getByRole("row").filter({ hasText: "界面项目验收" });
  await row.getByRole("switch").click();
  await expect(row.getByText("已停用", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: /编\s*辑/ }).click();
  await page.getByLabel("项目说明").fill("编辑停用项目不能重新开启采集");
  await page.getByRole("button", { name: "保存项目" }).click();
  await expect(row.getByText("已停用", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: /接\s*入/ }).click();
  await expect(page.locator(".code-block")).toContainText("@echo-feedback/sdk");
  await page.getByRole("tab", { name: "普通 script" }).click();
  await expect(page.locator(".code-block").last()).toContainText("/sdk/0.2.0/");
  await page.keyboard.press("Escape");
  await row.getByRole("button", { name: /删\s*除/ }).click();
  await expect(row).toHaveCount(0);
});

test("新版脚本与旧地址兼容，品牌图标返回正确 MIME", async ({ request }) => {
  const current = await request.get(`${service}/sdk/0.2.0/echo-feedback.iife.js`);
  const legacy = await request.get(`${service}/sdk/0.1.0/echo-feedback.iife.js`);
  expect(current.ok()).toBeTruthy();
  expect(legacy.ok()).toBeTruthy();
  expect(await legacy.text()).toBe(await current.text());
  for (const [path, mime] of [
    ["favicon.svg", "image/svg+xml"],
    ["favicon-32.png", "image/png"],
    ["favicon.ico", "image/vnd.microsoft.icon"],
    ["apple-touch-icon.png", "image/png"],
  ]) {
    const response = await request.get(`${service}/${path}`);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toBe(mime);
  }
});

test("ESM 接入与在途销毁不影响宿主", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await host(page);
  await page.evaluate(
    async ({ ak, serverUrl }) => {
      const win = window as unknown as { feedback: { destroy(): void; open(): void } };
      win.feedback.destroy();
      const url = `${serverUrl}/sdk/0.2.0/echo-feedback.js`;
      const sdk = (await import(url)) as {
        init(options: { serverUrl: string; ak: string; nonce: string; showTrigger: boolean }): typeof win.feedback;
      };
      win.feedback = sdk.init({ serverUrl, ak, nonce: "echo-test-nonce", showTrigger: false });
      win.feedback.open();
    },
    { ak: projects[0].ak, serverUrl: service }
  );
  await page.getByLabel("反馈内容").fill("在途销毁测试");
  let release = () => {
    /* 请求拦截建立前无需释放。 */
  };

  let markStarted = () => {
    /* 请求建立后设置。 */
  };

  const started = new Promise<void>(resolve => {
    markStarted = resolve;
  });
  await page.route("**/api/public/**", async route => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await new Promise<void>(resolve => {
      release = () => {
        void route
          .abort()
          .catch(() => undefined)
          .finally(resolve);
      };

      markStarted();
    });
  });
  await page.getByRole("button", { name: "提交反馈", exact: true }).click();
  await started;
  await page.evaluate(() => (window as unknown as { feedback: { destroy(): void } }).feedback.destroy());
  release();
  await expect(page.locator("echo-feedback")).toHaveCount(0);
  await page.getByLabel("宿主输入").fill("继续业务");
  expect(errors).toEqual([]);
});
