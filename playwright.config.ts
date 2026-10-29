import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: ".tmp/playwright/results",
  timeout: 45000,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: ".tmp/playwright/report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:18730",
    locale: "zh-CN",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm exec tsx tests/e2e/server.ts",
    url: "http://127.0.0.1:18730/api/health/ready",
    reuseExistingServer: false,
    timeout: 30000,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium", launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } },
    },
  ],
});
