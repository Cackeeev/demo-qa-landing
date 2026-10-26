import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: "**/pages.spec.ts",
  use: { ...base.use, baseURL: "http://localhost:4173/demo-qa-landing/" },
  webServer: {
    command: "node scripts/serve-pages.mjs",
    url: "http://localhost:4173/demo-qa-landing/",
    reuseExistingServer: false,
  },
});
