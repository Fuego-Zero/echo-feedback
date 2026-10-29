/* 多尺寸验收按顺序操作同一页面，避免状态与截图错配。 */
/* eslint-disable no-await-in-loop */
import { mkdir } from "node:fs/promises";

import type { Project } from "@echo-feedback/contracts";
import { expect, type Page, test } from "@playwright/test";
import sharp from "sharp";

const origin = { origin: "http://127.0.0.1:18730" };
const screenshots = ".tmp/playwright/screenshots";
let project: Project;
test.use({ reducedMotion: "reduce" });
test.beforeAll(async ({ request }) => {
  await mkdir(screenshots, { recursive: true });
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
  const created = await request.post("/api/admin/projects", {
    headers: origin,
    data: { name: "书卷验收项目", description: "仅用于隔离环境的界面验收" },
  });
  project = (await created.json()) as Project;
  await Promise.all(
    Array.from({ length: 22 }, async (_, index) => {
      const result = await request.post(`/api/public/projects/${project.ak}/feedback`, {
        headers: { ...origin, "idempotency-key": crypto.randomUUID() },
        multipart: {
          metadata: JSON.stringify({
            content: `书卷验收 ${index}：希望阅读页面的段落留白更舒适，长内容也能完整阅读。`,
            contact: "preview@example.test",
            sourcePage: `https://example.test/${"long-path/".repeat(20)}`,
          }),
        },
      });
      expect(result.ok()).toBeTruthy();
    })
  );
});

async function enter(page: Page) {
  await page.request.post("/api/auth/login", {
    headers: origin,
    data: { username: "owner", password: "Synthetic12345" },
  });
  await page.goto("/");
  await page.getByLabel("筛选项目").click();
  await page.getByText(project.name, { exact: true }).last().click();
  await expect(page.locator(".feedback-card")).toHaveCount(20);
}

async function noOverflow(page: Page) {
  // 视口改变后 ResizeObserver 与 React 布局异步更新，等待最终布局再断言。
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
}

test("抽屉选择、筛选分页、保存移出筛选、失败保留备注", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enter(page);
  await expect(page.getByRole("dialog", { name: "反馈详情" })).toHaveCount(0);
  const first = page.locator(".feedback-card").first();
  await first.focus();
  await first.press("Enter");
  await expect(page.getByRole("dialog", { name: "反馈详情" })).toBeVisible();
  await page.getByLabel("内部处理备注").fill("仅内部可见的处理记录");
  await page.route("**/api/admin/feedback/*", route =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "模拟保存失败" }),
        })
      : route.continue()
  );
  await page.getByRole("button", { name: "保存处理记录" }).click();
  await expect(page.getByText("保存失败", { exact: true })).toBeVisible();
  await expect(page.getByLabel("内部处理备注")).toHaveValue("仅内部可见的处理记录");
  await page.unroute("**/api/admin/feedback/*");
  await page.getByRole("button", { name: "保存处理记录" }).click();
  await expect(page.getByText("处理记录已保存")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "反馈详情" })).toHaveCount(0);
  await page.getByRole("button", { name: "刷新反馈" }).click();
  await first.click();
  await expect(page.getByLabel("内部处理备注")).toHaveValue("仅内部可见的处理记录");
  await expect(page.getByRole("dialog", { name: "反馈详情" })).toBeVisible();
  await page.locator(".ant-drawer-body").evaluate(element => {
    element.scrollTop = 0;
  });
  await expect(page.locator(".ant-message-notice")).toHaveCount(0);
  await page.screenshot({ path: `${screenshots}/book-inbox-1440.png`, fullPage: true });
  await page.keyboard.press("Escape");
  await page.locator('.ant-pagination-item[title="2"]').click();
  await expect(page.getByRole("dialog", { name: "反馈详情" })).toHaveCount(0);
  await expect(page.locator(".feedback-card")).toHaveCount(2);
  await page.getByRole("group", { name: "筛选状态" }).getByRole("button", { name: "待处理", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "反馈详情" })).toHaveCount(0);
  await page.locator(".feedback-card").first().click();
  const selectedName = await page.locator('.feedback-card[aria-pressed="true"]').getAttribute("aria-label");
  await page.locator(".feedback-status").getByText("已解决", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "已解决", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "保存处理记录" }).click();
  await expect(page.getByRole("dialog", { name: "反馈详情" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: selectedName!, exact: true })).toHaveCount(0);
  await noOverflow(page);
});

test("响应式抽屉、焦点返回、项目卡片与弹窗", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 944 });
  await enter(page);
  await page.locator(".feedback-card").first().click();
  await expect(page.getByRole("dialog", { name: "反馈详情" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).overflowY)).toBe("hidden");
  await page.getByRole("button", { name: "保存处理记录" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "保存处理记录" })).toBeInViewport();
  await page.screenshot({ path: `${screenshots}/book-detail-1080p.png` });
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByRole("dialog", { name: "反馈详情" })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/book-detail-1024.png` });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".feedback-card").first()).toBeFocused();
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await noOverflow(page);
    await page.locator(".feedback-card").first().click();
    await page.getByLabel("内部处理备注").fill(`移动端 ${width} 验收`);
    await page.getByRole("button", { name: "保存处理记录" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.screenshot({ path: `${screenshots}/book-inbox-${width}.png`, fullPage: true });
  }

  await page.getByRole("button", { name: "项目接入", exact: true }).click();
  const card = page.locator(".project-card").filter({ hasText: project.ak.slice(0, 12) });
  await expect(card).toBeVisible();
  await expect(page.locator(".ant-message-notice")).toHaveCount(0);
  await page.screenshot({ path: `${screenshots}/book-projects-mobile.png`, fullPage: true });
  await card.getByRole("button", { name: /接\s*入/ }).click();
  await expect(page.locator(".code-block")).toContainText("@echo-feedback/sdk");
  await page.getByLabel("表单风格", { exact: true }).click();
  await page.getByText("经典简洁", { exact: true }).last().click();
  await expect(page.locator(".code-block")).toContainText('"uiStyle": "classic"');
  for (const [label, value] of [
    ["青瓷竹简", "celadon"],
    ["墨夜鎏金", "gilded"],
    ["正义之翼", "justice"],
  ]) {
    await page.getByLabel("表单风格", { exact: true }).click();
    await page.getByText(label, { exact: true }).last().click();
    await expect(page.locator(".code-block")).toContainText(`"uiStyle": "${value}"`);
  }

  await noOverflow(page);
  await page.screenshot({ path: `${screenshots}/book-snippet-mobile.png` });
  await page.keyboard.press("Escape");
  await card.getByRole("switch").click();
  await expect(card.getByRole("switch")).not.toBeChecked();
  await card.getByRole("switch").click();
  await expect(card.getByRole("switch")).toBeChecked();
  await page.getByRole("button", { name: "创建项目" }).click();
  await expect(page.getByRole("button", { name: "保存项目" })).toBeInViewport();
  const mobileEditor = await page.getByRole("dialog").boundingBox();
  expect(mobileEditor!.y + mobileEditor!.height).toBeLessThanOrEqual(800);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: `${screenshots}/book-projects-desktop.png` });
  await page.getByRole("button", { name: "创建项目" }).click();
  await page.screenshot({ path: `${screenshots}/book-project-editor.png` });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "反馈收件箱" }).click();
  await expect(page.getByRole("dialog", { name: "反馈详情" })).toHaveCount(0);
});

test("接入弹窗同步七套静态 SDK 预览且不可交互", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 945 });
  await enter(page);
  await page.getByRole("button", { name: "项目接入", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: project.ak.slice(0, 12) })
    .getByRole("button", { name: /接\s*入/ })
    .click();
  const preview = page.frameLocator('iframe[title="SDK 表单风格预览"]');
  const submissions: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && request.url().includes("/api/public/")) {
      submissions.push(request.url());
    }
  });
  for (const [label, value] of [
    ["宣纸朱砂", "paper"],
    ["经典简洁", "classic"],
    ["青瓷竹简", "celadon"],
    ["墨夜鎏金", "gilded"],
    ["霓虹边界", "cyber"],
    ["自由之翼", "freedom"],
    ["正义之翼", "justice"],
  ]) {
    await page.getByLabel("表单风格", { exact: true }).click();
    await page.getByText(label, { exact: true }).last().click();
    await expect(preview.locator("echo-feedback")).toHaveAttribute("data-ui-style", value);
    await expect(preview.locator("dialog[open]")).toBeVisible();
    await expect(page.locator(".sdk-preview")).toHaveAttribute("data-ready", "true");
    await expect(page.locator(".sdk-preview iframe")).toHaveAttribute("inert", "");
    await expect(page.locator(".sdk-preview iframe")).toHaveCSS("pointer-events", "none");
    await expect(page.locator(".sdk-preview iframe")).toHaveCSS("transform", "none");
    await expect(preview.locator("textarea")).toHaveCSS("font-size", "14px");
    // 预览不使用顶层 modal，避免切换风格时夺取焦点或产生遮罩。
    await expect(preview.locator("dialog:modal")).toHaveCount(0);
    await expect(page.getByLabel("表单风格", { exact: true })).toBeFocused();
    expect(
      await preview.locator("dialog").evaluate(dialog => Math.abs(dialog.getBoundingClientRect().height - innerHeight))
    ).toBeLessThanOrEqual(1);
    await expect(page.locator(".code-block")).toContainText(`"uiStyle": "${value}"`);
    await expect(preview.locator('button[type="submit"]')).toBeVisible();
    expect(
      await preview
        .locator('button[type="submit"]')
        .evaluate(button => button.getBoundingClientRect().bottom <= innerHeight)
    ).toBe(true);
    const scroll = await preview.locator("dialog").evaluate(dialog => {
      const form = dialog.shadowRoot ?? dialog;
      return Array.from(form.querySelectorAll("*")).some(element => {
        const style = getComputedStyle(element);
        return /auto|scroll/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
      });
    });
    expect(scroll).toBe(false);
  }

  await preview.locator("form").evaluate(form => form.dispatchEvent(new Event("submit", { cancelable: true })));
  expect(submissions).toEqual([]);
  const code = await page.locator(".sdk-integration-code").boundingBox();
  const frame = await page.locator(".sdk-preview").boundingBox();
  expect(frame!.x).toBeGreaterThan(code!.x + code!.width);
  const modal = page.getByRole("dialog");
  expect(await modal.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  expect(frame!.y + frame!.height).toBeLessThan(945);
  await page.screenshot({ path: `${screenshots}/sdk-integration-preview-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  const optionsBox = await page.locator(".sdk-integration-options").boundingBox();
  const previewBox = await page.locator(".sdk-preview").boundingBox();
  const codeBox = await page.locator(".sdk-integration-code").boundingBox();
  expect(optionsBox!.y).toBeLessThan(previewBox!.y);
  expect(previewBox!.y).toBeLessThan(codeBox!.y);
  // 其他窗口不能伪造预览尺寸，破坏画布比例。
  const initialHeight = await page.locator("iframe").getAttribute("style");
  await page.evaluate(() => window.postMessage({ type: "echo-preview-size", height: 1100 }, "*"));
  await expect(page.locator("iframe")).toHaveAttribute("style", initialHeight!);
  await page.locator(".sdk-preview").scrollIntoViewIfNeeded();
  await expect(preview.locator("dialog[open]")).toBeVisible();
  await page.screenshot({ path: `${screenshots}/sdk-integration-preview-mobile.png` });
  await page.locator(".ant-modal-close").click();
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("列表失败与空状态分离，初始化和登录视觉", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByLabel("管理员账号")).toBeVisible();
  await page.screenshot({ path: `${screenshots}/book-login.png` });
  await page.route("**/api/setup/status", route => route.fulfill({ json: { needed: true } }));
  await page.reload();
  await expect(page.getByLabel("初始化密钥")).toBeVisible();
  await page.screenshot({ path: `${screenshots}/book-setup.png` });
  await page.setViewportSize({ width: 360, height: 800 });
  await noOverflow(page);
  await page.screenshot({ path: `${screenshots}/book-setup-mobile.png` });
  await page.unroute("**/api/setup/status");
  await enter(page);
  await page.route("**/api/admin/feedback?**", route =>
    route.fulfill({ status: 500, json: { message: "测试网络错误" } })
  );
  await page.getByRole("button", { name: "刷新反馈" }).click();
  await expect(page.getByText("反馈加载失败", { exact: true })).toBeVisible();
  await expect(page.getByText("当前筛选下没有反馈")).toHaveCount(0);
  await page.unroute("**/api/admin/feedback?**");
  await page.getByRole("button", { name: /重\s*试/ }).click();
  await expect(page.locator(".feedback-card")).toHaveCount(20);
  await page.getByRole("group", { name: "筛选状态" }).getByRole("button", { name: "处理中", exact: true }).click();
  await expect(page.getByText("当前筛选下没有反馈")).toBeVisible();
});

test("SDK 明暗、系统主题、自定义浅主色和无额外装饰请求", async ({ page }) => {
  const assetRequests: string[] = [];
  page.on("request", request => {
    if (["image", "font"].includes(request.resourceType())) {
      assetRequests.push(request.url());
    }
  });
  await page.emulateMedia({ colorScheme: "dark" });
  for (const theme of ["light", "dark", "system"]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`http://127.0.0.1:18732/product?ak=${project.ak}&theme=${theme}&primaryColor=%23fff1cc`);
    await page.getByRole("button", { name: "提出建议" }).click();
    await expect(page.getByRole("dialog")).toHaveCSS(
      "background-color",
      theme === "light" ? "rgb(251, 247, 239)" : "rgb(39, 35, 31)"
    );
    await expect(page.getByRole("button", { name: "提交反馈", exact: true })).toHaveCSS("color", "rgb(48, 43, 38)");
    await page.screenshot({ path: `${screenshots}/book-sdk-${theme}.png` });
    if (theme === "system") {
      await page.emulateMedia({ colorScheme: "light" });
      await expect(page.getByRole("dialog")).toHaveCSS("background-color", "rgb(251, 247, 239)");
    }
  }

  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    const dialog = page.getByRole("dialog");
    expect((await dialog.boundingBox())?.width).toBe(width);
    await expect(page.getByRole("button", { name: "提交反馈", exact: true })).toBeInViewport();
    await page.screenshot({ path: `${screenshots}/book-sdk-${width}.png` });
  }

  expect(assetRequests).toEqual([]);
  await page.setViewportSize({ width: 691, height: 480 });
  await expect(page.getByRole("button", { name: "提交反馈", exact: true })).toBeInViewport();
  await expect(page.getByRole("button", { name: "关闭反馈" })).toBeInViewport();
  await expect(page.getByRole("dialog")).toHaveCSS("outline-style", "none");
});

test("经典风格支持明暗、自定义主色、窄屏及未知风格回退", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  for (const theme of ["light", "dark", "system"]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`http://127.0.0.1:18732/product?ak=${project.ak}&theme=${theme}&uiStyle=classic`);
    await page.getByRole("button", { name: "提出建议" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveCSS("background-color", theme === "light" ? "rgb(255, 255, 255)" : "rgb(25, 29, 42)");
    await expect(page.getByRole("button", { name: "提交反馈", exact: true })).toHaveCSS(
      "background-color",
      "rgb(98, 86, 217)"
    );
    await page.screenshot({ path: `${screenshots}/classic-${theme}.png` });
    await page.setViewportSize({ width: 360, height: 800 });
    await expect(dialog).toHaveCSS("border-radius", "0px");
    await expect(page.getByRole("button", { name: "提交反馈", exact: true })).toBeInViewport();
    await page.screenshot({ path: `${screenshots}/classic-${theme}-mobile.png` });
    if (theme === "system") {
      await page.emulateMedia({ colorScheme: "light" });
      await expect(dialog).toHaveCSS("background-color", "rgb(255, 255, 255)");
    }
  }

  for (const style of ["classic", "unknown"]) {
    await page.goto(
      `http://127.0.0.1:18732/product?ak=${project.ak}&theme=light&uiStyle=${style}&primaryColor=%23fff1cc`
    );
    await page.getByRole("button", { name: "提出建议" }).click();
    await expect(page.locator("echo-feedback")).toHaveAttribute(
      "data-ui-style",
      style === "classic" ? "classic" : "paper"
    );
    await expect(page.getByRole("button", { name: "提交反馈", exact: true })).toHaveCSS(
      "background-color",
      "rgb(255, 241, 204)"
    );
    await expect(page.getByRole("button", { name: "提交反馈", exact: true })).toHaveCSS("color", "rgb(48, 43, 38)");
  }
});

[
  ["celadon", "rgb(250, 247, 239)", "rgb(32, 45, 39)", "rgb(82, 121, 106)"],
  ["gilded", "rgb(246, 239, 223)", "rgb(36, 41, 37)", "rgb(181, 154, 98)"],
  ["cyber", "rgb(244, 246, 237)", "rgb(16, 17, 20)", "rgb(252, 238, 9)"],
  ["freedom", "rgb(245, 247, 250)", "rgb(20, 30, 48)", "rgb(36, 91, 214)"],
  ["justice", "rgb(247, 244, 245)", "rgb(35, 29, 39)", "rgb(166, 47, 80)"],
].forEach(([uiStyle, light, dark, accent]) => {
  test(`${uiStyle} 明暗、窄屏、图片及失败重试完整流程`, async ({ page }) => {
    const externalAssets: string[] = [];
    page.on("request", request => {
      if (["image", "font", "stylesheet"].includes(request.resourceType()) && request.url().startsWith("http")) {
        externalAssets.push(request.url());
      }
    });
    await page.emulateMedia({ colorScheme: "dark" });
    for (const theme of ["light", "dark", "system"]) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(
        `http://127.0.0.1:18732/product?ak=${project.ak}&theme=${theme}&uiStyle=${uiStyle}&primaryColor=invalid`
      );
      await page.getByRole("button", { name: "提出建议" }).click();
      await expect(page.getByRole("dialog")).toHaveCSS("background-color", theme === "light" ? light : dark);
      await expect(page.getByRole("button", { name: "提交反馈", exact: true })).toHaveCSS("background-color", accent);
      await page.screenshot({ path: `${screenshots}/${uiStyle}-${theme}.png` });
      await page.setViewportSize({ width: 1024, height: 768 });
      await expect(page.getByRole("button", { name: "提交反馈", exact: true })).toBeInViewport();
      await page.screenshot({ path: `${screenshots}/${uiStyle}-${theme}-1024.png` });
      for (const width of [390, 360]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
        await expect(page.getByRole("button", { name: "提交反馈", exact: true })).toBeInViewport();
        expect((await page.getByRole("dialog").boundingBox())!.width).toBe(width);
        await page.screenshot({ path: `${screenshots}/${uiStyle}-${theme}-${width}.png` });
      }

      if (theme === "system") {
        await page.emulateMedia({ colorScheme: "light" });
        await expect(page.getByRole("dialog")).toHaveCSS("background-color", light);
      }
    }

    expect(externalAssets).toEqual([]);
    await page.setViewportSize({ width: 691, height: 480 });
    await expect(page.getByRole("button", { name: "关闭反馈" })).toBeInViewport();
    await expect(page.getByRole("button", { name: "提交反馈", exact: true })).toBeInViewport();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel("反馈内容").fill(`${uiStyle} 风格图片反馈验收`);
    const buffer = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#52796a" } })
      .png()
      .toBuffer();
    await page.getByLabel("选择反馈图片").setInputFiles({ name: "sample.png", mimeType: "image/png", buffer });
    await page.getByRole("button", { name: "移除图片" }).click();
    await page.getByLabel("选择反馈图片").setInputFiles({ name: "sample.png", mimeType: "image/png", buffer });
    await page.route("**/api/public/**", route => route.fulfill({ status: 503, json: { code: "SERVICE_BUSY" } }));
    await page.getByRole("button", { name: "提交反馈", exact: true }).click();
    await expect(page.getByRole("button", { name: "重试本次提交" })).toBeVisible();
    await page.screenshot({ path: `${screenshots}/${uiStyle}-error.png` });
    await page.unroute("**/api/public/**");
    await page.getByRole("button", { name: "重试本次提交" }).click();
    await expect(page.getByRole("heading", { name: "已收到你的反馈" })).toBeVisible();
    await page.screenshot({ path: `${screenshots}/${uiStyle}-success.png` });
    await page.getByRole("button", { name: "完成", exact: true }).click();
    await expect(page.locator("#canvas")).toBeFocused();
    await page.goto(
      `http://127.0.0.1:18732/product?ak=${project.ak}&theme=light&uiStyle=${uiStyle}&primaryColor=%23fff1cc`
    );
    await page.getByRole("button", { name: "提出建议" }).click();
    await expect(page.getByRole("button", { name: "提交反馈", exact: true })).toHaveCSS("color", "rgb(48, 43, 38)");
  });
});

test("旧轨道配置映射为正义之翼", async ({ page }) => {
  await page.goto(`http://127.0.0.1:18732/product?ak=${project.ak}&theme=light&uiStyle=orbital`);
  await page.getByRole("button", { name: "提出建议" }).click();
  await expect(page.locator("echo-feedback")).toHaveAttribute("data-ui-style", "justice");
  await expect(page.getByRole("button", { name: "提交反馈", exact: true })).toHaveCSS(
    "background-color",
    "rgb(166, 47, 80)"
  );
});
