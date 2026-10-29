/* 皮肤及视口逐一验收，确保状态属于当前 SDK 实例。 */
/* eslint-disable no-await-in-loop */
import { mkdir } from "node:fs/promises";

import type { Project } from "@echo-feedback/contracts";
import { expect, type Page, test } from "@playwright/test";
import sharp from "sharp";

import type { FeedbackInstance, FeedbackOptions } from "../../packages/sdk/src/types.js";

interface HostWindow extends Window {
  EchoFeedback: { init: (options: FeedbackOptions) => FeedbackInstance };
  feedback: FeedbackInstance;
  secondFeedback: FeedbackInstance;
}
const origin = { origin: "http://127.0.0.1:18730" };
let project: Project;
test.beforeAll(async ({ request }) => {
  await mkdir(".tmp/playwright/screenshots", { recursive: true });
  await request.post("/api/setup/admin", {
    headers: origin,
    data: { username: "owner", password: "Synthetic12345", setupToken: "synthetic-e2e-setup-token-123456789" },
  });
  expect(
    (
      await request.post("/api/auth/login", {
        headers: origin,
        data: { username: "owner", password: "Synthetic12345" },
      })
    ).ok()
  ).toBeTruthy();
  const response = await request.post("/api/admin/projects", { headers: origin, data: { name: "多语言验收项目" } });
  project = (await response.json()) as Project;
});

async function host(page: Page, style = "paper") {
  await page.goto(`http://127.0.0.1:18732/product?ak=${project.ak}&uiStyle=${style}`);
}

async function setLocale(page: Page, locale: "en" | "zh-CN" | "auto") {
  await page.evaluate(locale => (window as unknown as HostWindow).feedback.setLocale(locale), locale);
}

test("打开时宿主优先、单次覆盖不持久化、打开后稳定且实例相互隔离", async ({ page }) => {
  await host(page);
  await page.evaluate(() => {
    document.documentElement.lang = "en-US";
    (window as unknown as HostWindow).feedback.open();
  });
  await expect(page.getByRole("dialog")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Share your thoughts" })).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.lang = "zh-CN";
  });
  await expect(page.getByRole("heading", { name: "Share your thoughts" })).toBeVisible();
  await page.getByRole("button", { name: "Close feedback" }).click();
  await page.evaluate(() => (window as unknown as HostWindow).feedback.open({ locale: "en" }));
  await expect(page.getByRole("dialog")).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "Close feedback" }).click();
  await page.evaluate(() => (window as unknown as HostWindow).feedback.open());
  await expect(page.getByRole("dialog")).toHaveAttribute("lang", "zh-CN");
  await page.getByRole("button", { name: "关闭反馈" }).click();
  await setLocale(page, "en");
  await page.evaluate(ak => {
    const win = window as unknown as HostWindow;
    win.secondFeedback = win.EchoFeedback.init({
      serverUrl: "http://127.0.0.1:18730",
      ak,
      locale: "zh-CN",
      nonce: "echo-test-nonce",
    });
    win.secondFeedback.open();
  }, project.ak);
  await expect(page.locator("echo-feedback").first()).toHaveAttribute("lang", "en");
  await expect(page.locator("echo-feedback").nth(1)).toHaveAttribute("lang", "zh-CN");
  await page.evaluate(() => {
    const win = window as unknown as HostWindow;
    win.secondFeedback.destroy();
    win.feedback.destroy();
    win.feedback.setLocale("zh-CN");
    win.feedback.open();
  });
  await expect(page.locator("echo-feedback")).toHaveCount(0);
});

test.describe("浏览器语言回退", () => {
  test.use({ locale: "en-US" });
  test("页面未标记或不受支持时使用浏览器，固定配置优先于页面", async ({ page }) => {
    await host(page);
    await page.evaluate(() => {
      document.documentElement.lang = "fr";
      (window as unknown as HostWindow).feedback.open();
    });
    await expect(page.getByRole("dialog")).toHaveAttribute("lang", "en");
    await setLocale(page, "zh-CN");
    await expect(page.getByRole("dialog")).toHaveAttribute("lang", "zh-CN");
    await page.getByRole("button", { name: "关闭反馈" }).click();
    await page.evaluate(() => {
      document.documentElement.lang = "en";
      (window as unknown as HostWindow).feedback.open();
    });
    await expect(page.getByRole("dialog")).toHaveAttribute("lang", "zh-CN");
  });
  test("英文登录、已有错误和账号草稿在切换语言后保留", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Welcome to Echo Feedback" })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBeTruthy();
    await page.screenshot({ path: ".tmp/playwright/screenshots/language-login-en-320.png" });
    await page.getByLabel("Administrator username", { exact: true }).fill("language-draft-user");
    await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Incorrect username, password or setup token", { exact: true })).toBeVisible();
    await page.getByLabel("Interface language").click();
    await page.getByRole("menuitem", { name: "简体中文", exact: true }).click();
    await expect(page.getByLabel("管理员账号", { exact: true })).toHaveValue("language-draft-user");
    await expect(page.getByLabel("密码", { exact: true })).toHaveValue("incorrect-password");
    await expect(page.getByText("账号、密码或初始化密钥不正确", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "欢迎回到回声" })).toBeVisible();
  });
});

test("原地切换保留草稿、图片、焦点和校验提示，并覆盖七套皮肤及窄屏", async ({ page }) => {
  const image = await sharp({ create: { width: 60, height: 40, channels: 3, background: "#6256d9" } })
    .png()
    .toBuffer();
  await mkdir(".tmp/playwright/screenshots", { recursive: true });
  for (const style of ["paper", "classic", "celadon", "gilded", "cyber", "freedom", "justice"]) {
    await host(page, style);
    await page.evaluate(() => (window as unknown as HostWindow).feedback.open({ locale: "en" }));
    await page.getByRole("button", { name: "Send feedback", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Please enter your feedback first.");
    await setLocale(page, "zh-CN");
    await expect(page.getByRole("status")).toHaveText("请先填写反馈内容。");
    await page.getByLabel("反馈内容", { exact: true }).fill("Keep this draft 中英文草稿");
    await page.getByLabel("联系方式").fill("test@example.test");
    await page.getByLabel("选择反馈图片").setInputFiles({ name: "draft.png", mimeType: "image/png", buffer: image });
    await page.getByLabel("反馈内容", { exact: true }).focus();
    await page.evaluate(() => {
      document.querySelector("echo-feedback")!.setAttribute("data-instance", "original");
    });
    await setLocale(page, "en");
    await expect(page.locator("echo-feedback")).toHaveAttribute("data-instance", "original");
    await expect(page.getByRole("textbox", { name: "Feedback", exact: true })).toHaveValue(
      "Keep this draft 中英文草稿"
    );
    await expect(page.getByRole("textbox", { name: "Feedback", exact: true })).toBeFocused();
    await expect(page.getByLabel("Contact details")).toHaveValue("test@example.test");
    await expect(page.getByAltText("Image to submit")).toHaveCount(1);
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() => page.getByRole("dialog").evaluate(node => node.scrollWidth <= node.clientWidth))
        .toBeTruthy();
      await page.screenshot({ path: `.tmp/playwright/screenshots/language-${style}-${width}.png` });
    }

    await page.getByRole("button", { name: "Close feedback" }).click();
    await page.evaluate(() => (window as unknown as HostWindow).feedback.open());
    await expect(page.getByLabel("Feedback", { exact: true })).toHaveValue("Keep this draft 中英文草稿");
    await expect(page.getByAltText("Image to submit")).toHaveCount(1);
  }
});

test("在途及响应丢失后切换语言，重试保持相同正文、附件、上下文和幂等键", async ({ page, request }) => {
  await host(page);
  await page.evaluate(() =>
    (window as unknown as HostWindow).feedback.open({ locale: "en", userId: "original-user", projectVersion: "1.0" })
  );
  const text = `language-retry-${crypto.randomUUID()}`;
  await page.getByLabel("Feedback", { exact: true }).fill(text);
  await page.getByLabel("Contact details").fill("retry@example.test");
  const image = await sharp({ create: { width: 25, height: 25, channels: 3, background: "#a64232" } })
    .png()
    .toBuffer();
  await page
    .getByLabel("Choose feedback images")
    .setInputFiles({ name: "retry.png", mimeType: "image/png", buffer: image });
  const attempts: { key: string | undefined; body: string }[] = [];
  let release: (() => void) | undefined;
  await page.route("**/api/public/**/feedback", async route => {
    attempts.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postDataBuffer()!.toString("base64"),
    });
    if (attempts.length === 1) {
      expect((await route.fetch()).ok()).toBeTruthy();
      await new Promise<void>(resolve => {
        release = resolve;
      });
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });
  await page.getByRole("button", { name: "Send feedback", exact: true }).click();
  await expect.poll(() => Boolean(release)).toBeTruthy();
  await setLocale(page, "zh-CN");
  await expect(page.getByRole("button", { name: "正在提交…" })).toBeDisabled();
  await expect(page.getByLabel("反馈内容", { exact: true })).toHaveValue(text);
  release!();
  await expect(page.getByRole("button", { name: "重试本次提交" })).toBeEnabled();
  await setLocale(page, "en");
  await expect(page.getByRole("status")).toContainText("retrying will not submit it twice");
  await page.getByRole("button", { name: "Close feedback" }).click();
  await page.evaluate(() =>
    (window as unknown as HostWindow).feedback.open({ locale: "zh-CN", userId: "changed-user", projectVersion: "2.0" })
  );
  await expect(page.getByLabel("反馈内容", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "移除图片" })).toBeDisabled();
  await setLocale(page, "en");
  await page.getByRole("button", { name: "Retry this submission" }).click();
  await expect(page.getByRole("heading", { name: "Feedback received" })).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[0].key).toBeTruthy();
  expect(attempts[1].key).toBe(attempts[0].key);
  // multipart 边界每次生成，按正文中的字段核对冻结快照。
  for (const attempt of attempts) {
    const body = Buffer.from(attempt.body, "base64").toString();
    expect(body).toContain('"userId":"original-user"');
    expect(body).toContain('"projectVersion":"1.0"');
    expect(body).toContain('"contact":"retry@example.test"');
    expect(body).toContain(text);
    expect(body).toContain('filename="retry.png"');
    expect(body).not.toContain('"locale"');
  }

  await setLocale(page, "zh-CN");
  await expect(page.getByRole("heading", { name: "已收到你的反馈" })).toBeVisible();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.evaluate(() => (window as unknown as HostWindow).feedback.open());
  await expect(page.getByLabel("反馈内容", { exact: true })).toHaveValue("");
  await request.post("/api/auth/login", { headers: origin, data: { username: "owner", password: "Synthetic12345" } });
  const result = await request.get(`/api/admin/feedback?projectId=${project.id}&pageSize=100`);
  const data = (await result.json()) as { items: { content: string; attachments: unknown[] }[] };
  const matches = data.items.filter(item => item.content === text);
  expect(matches).toHaveLength(1);
  expect(matches[0].attachments).toHaveLength(1);
});

test("后台语言独立、刷新记忆、错误按当前语言显示及英文接入预览", async ({ page }) => {
  await page.request.post("/api/auth/login", {
    headers: origin,
    data: { username: "owner", password: "Synthetic12345" },
  });
  await page.goto("/");
  await page.getByLabel("界面语言").click();
  await expect(page.getByRole("menuitem")).toHaveCount(2);
  await expect(page.getByRole("menuitem", { name: "简体中文", exact: true })).toHaveClass(
    /ant-dropdown-menu-item-selected/
  );
  await page.getByRole("menuitem", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "Project integration", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 900 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: ".tmp/playwright/screenshots/language-projects-en-320.png" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill("Unsaved project 草稿");
  await page.getByLabel("Description", { exact: true }).fill("Unsaved description");
  await page.screenshot({ path: ".tmp/playwright/screenshots/language-project-editor-en.png" });
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: "Feedback inbox", exact: true })).toBeVisible();
  await page.route("**/api/admin/feedback?**", route =>
    route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "SERVICE_BUSY" }) })
  );
  await page.getByRole("button", { name: "Refresh feedback" }).click();
  await expect(page.getByText("The service is busy. Please try again later.", { exact: true })).toBeVisible();
  await page.getByLabel("Interface language").click();
  await page.getByRole("menuitem", { name: "简体中文", exact: true }).click();
  await expect(page.getByText("服务繁忙，请稍后再试", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "项目接入", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: project.name });
  await row.getByRole("button", { name: "接入", exact: true }).click();
  await page.getByLabel("表单语言", { exact: true }).click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await expect(page.locator(".code-block").first()).toContainText('"locale": "en"');
  await expect(
    page.frameLocator(".sdk-preview iframe").getByRole("heading", { name: "Share your thoughts" })
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});
