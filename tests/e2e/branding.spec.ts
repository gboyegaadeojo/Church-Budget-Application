import { expect, test } from "@playwright/test";
import {
  DESKTOP,
  expectAxeClean,
  expectNoHorizontalScroll,
  MOBILE,
  PEOPLE,
  signInAs,
} from "./helpers";

/*
 * Settings → Branding (FR-30). Branding shows on every page, and tests run in parallel
 * against one database, so nothing here saves a change. Saving a logo, names and colour,
 * and seeing them in emails and exports (AC-99), is covered by
 * tests/integration/branding.test.ts.
 */

test("AC-100 a colour that fails contrast is refused with a passing shade", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signInAs(page, PEOPLE.gina);
  await page.goto("/admin/settings/branding");
  await expect(page.getByRole("heading", { level: 1, name: "Branding" })).toBeVisible();
  await expectAxeClean(page);

  const accent = page.getByRole("region", { name: "Accent colour" });
  await accent.getByRole("textbox", { name: "Accent colour" }).fill("#FFD400");
  await expect(accent.getByText(/Too light to read/)).toBeVisible();
  const suggestion = accent.getByRole("button", { name: /Use #[0-9A-F]{6} instead/ });
  await expect(suggestion).toBeVisible();

  // The server runs the same check: submitting anyway saves nothing.
  await accent.getByRole("button", { name: "Save colour" }).click();
  await expect(accent.getByText(/That colour is too light .* Try #[0-9A-F]{6}\./)).toBeVisible();

  // The suggestion passes the check in the browser.
  await suggestion.click();
  await expect(accent.getByText(/Readable: contrast/)).toBeVisible();
});

test("FR-30 a file that isn't an image is refused", async ({ page }) => {
  await signInAs(page, PEOPLE.gina);
  await page.goto("/admin/settings/branding");
  const logo = page.getByRole("region", { name: "Logo" });
  await logo.getByLabel("Logo file").setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from("%PDF-1.4 not an image"),
  });
  await logo.getByRole("button", { name: /(Upload|Replace) logo/ }).click();
  await expect(logo.getByText("That isn't a PNG, JPG or SVG file.")).toBeVisible();
});

test("the branding page works on a phone", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await signInAs(page, PEOPLE.gina);
  await page.goto("/admin/settings/branding");
  await expect(page.getByRole("heading", { level: 1, name: "Branding" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("DRD 6.12 printed pages show the church's branding without the navigation", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await signInAs(page, PEOPLE.gina);
  await page.emulateMedia({ media: "print", colorScheme: "dark" });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeHidden();
  await expect(page.locator("main").getByText("Church Budget", { exact: true })).toBeVisible();
  // Print uses the light theme even when the screen is dark.
  const fg = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--fg").trim(),
  );
  expect(fg).toBe("#18181b");
});

test("AC-101 people without the administrator role can't open it", async ({ page }) => {
  await signInAs(page, PEOPLE.pat);
  await page.goto("/admin/settings/branding");
  await expect(
    page.getByRole("heading", { level: 1, name: "You don't have access to this page" }),
  ).toBeVisible();
  await expect(page.getByLabel("Logo file")).toHaveCount(0);
});
