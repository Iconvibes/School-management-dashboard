import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    // Clear cookies/storage between tests so each starts unauthenticated
    storageState: { cookies: [], origins: [] },
    // The PWA service worker is registered in dev too; its shell cache must
    // never decide what an E2E test sees (auth bounces cached as HTML,
    // stale dev chunks). Tests exercise the network, not the offline layer.
    serviceWorkers: "block",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
  ],
});
