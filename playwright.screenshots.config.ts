import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/**
 * Screenshots for the user manual (Requirements Section 22): `npm run screenshots`.
 * The same fake server as the end-to-end tests, with its seeded people and data, in the
 * light theme at a laptop size. The images go to docs/images/manual/. Not part of CI.
 */
export default defineConfig({
  ...base,
  testDir: "tests/screenshots",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  projects: [
    {
      name: "manual",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        colorScheme: "light",
      },
    },
  ],
});
