import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * End-to-end tests run against a production build (`next start`), Chromium only.
 * In CI the workflow builds first; locally the web server builds before starting.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "en-CA",
    timezoneId: "America/Winnipeg",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: /phone\.spec\.ts/ },
    // The Stage 5 phone check: a Pixel 7 (Chromium) with touch.
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /phone\.spec\.ts/ },
  ],
  // The fake server runs the built app against an in-process Postgres (PGlite), seeded
  // with test people, with fake Google and Planning Center sign-in. No credentials needed.
  webServer: {
    command: process.env.CI
      ? "node scripts/fake-server.mjs"
      : "npm run build && node scripts/fake-server.mjs",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
