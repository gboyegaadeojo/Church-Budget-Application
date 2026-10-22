import { expect, test } from "@playwright/test";
import {
  DESKTOP,
  expectAxeClean,
  expectNoHorizontalScroll,
  MOBILE,
  PEOPLE,
  signInAs,
} from "./helpers";

/* Get the app: install it on a phone or computer, and phone alerts (docs/decisions.md 2026-10-22). */

test.describe("Get the app", () => {
  test("the app can be installed: manifest, icons and service worker", async ({ request }) => {
    const manifest = await request.get("/app.webmanifest");
    expect(manifest.ok()).toBe(true);
    expect(manifest.headers()["content-type"]).toContain("application/manifest+json");
    const body = await manifest.json();
    expect(body).toMatchObject({ short_name: "IFC Budget", display: "standalone", start_url: "/" });
    for (const icon of body.icons as { src: string }[]) {
      expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
    }
    const worker = await request.get("/sw.js");
    expect(worker.ok()).toBe(true);
    expect(worker.headers()["cache-control"]).toContain("no-cache");
    expect((await request.get("/icons/apple-touch-icon.png")).ok()).toBe(true);
  });

  test.describe("in a browser that can show alerts", () => {
    test("a leader finds Get the app in the account menu and sees how to install and turn on alerts", async ({
      page,
    }) => {
      // Headless Chromium always reports notifications as blocked; a real browser asks first.
      await page.addInitScript(() =>
        Object.defineProperty(Notification, "permission", { get: () => "default" }),
      );
      await page.setViewportSize(DESKTOP);
      await signInAs(page, PEOPLE.sam);
      await page.getByRole("button", { name: "Open account menu" }).click();
      await page.getByRole("menuitem", { name: "Get the app" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Get the app" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Install on this device" })).toBeVisible();
      // A desktop browser: computer steps first, open.
      await expect(page.getByText("On a computer")).toBeVisible();
      const alerts = page.getByRole("region", { name: "Alerts on this device" });
      await expect(alerts.getByRole("button", { name: "Turn on alerts" })).toBeVisible();
      await expectAxeClean(page);

      await page.setViewportSize(MOBILE);
      await page.reload();
      await expect(page.getByRole("heading", { level: 1, name: "Get the app" })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
    });
  });

  test("the Notifications page links to Get the app", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.sam);
    await page.goto("/notifications");
    await page.getByRole("link", { name: "Get these on your phone" }).click();
    await expect(page).toHaveURL(/\/get-app$/);
    // Alerts can be allowed but not turned off by the person (decided 2026-10-22).
    await expect(page.getByRole("button", { name: /Turn off/ })).toHaveCount(0);
  });

  test("the System Administrator controls alerts: church-wide in Settings, and per person", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.gina);
    await page.goto("/admin/settings?section=texts");
    const group = page.getByRole("region", { name: "Phone alerts" });
    await expect(group.getByText("Alert keys")).toBeVisible();
    await expect(group.getByText("Set up", { exact: true })).toBeVisible();
    await expect(group.getByText("Alerts for the church")).toBeVisible();
    await expectAxeClean(page);

    // Vic's alerts: off, then back on (shared test data stays as it was).
    await page.goto("/admin/users");
    await page
      .getByRole("list", { name: "Users & Roles" })
      .getByRole("link", { name: PEOPLE.vic, exact: true })
      .click();
    const alerts = page.getByRole("region", { name: "Phone alerts" });
    await alerts.getByRole("button", { name: "Turn off alerts" }).click();
    await expect(page.getByText(`Phone alerts are off for ${PEOPLE.vic}.`)).toBeVisible();
    await alerts.getByRole("button", { name: "Turn on alerts" }).click();
    await expect(page.getByText(`Phone alerts are on for ${PEOPLE.vic}.`)).toBeVisible();
    await expectAxeClean(page);
  });
});
