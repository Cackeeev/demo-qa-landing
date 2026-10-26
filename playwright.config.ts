import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

export default defineConfig({
  testDir: "./tests",
  testIgnore: "**/pages.spec.ts",
  fullyParallel: true,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    launchOptions: {
      ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : existsSync("/usr/bin/chromium")
          ? { executablePath: "/usr/bin/chromium" }
          : {}),
      args: ["--no-sandbox"],
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm start",
    url: "http://localhost:3000/api/session",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
