import { expect, test } from "@playwright/test";
import {
  DESKTOP,
  expectAxeClean,
  expectNoHorizontalScroll,
  MOBILE,
  PEOPLE,
  signInAs,
} from "./helpers";

test.describe("Activity, search and breadcrumbs (FR-22, FR-52, DRD 6.0, 6.13)", () => {
  for (const [name, size] of [
    ["360 px", MOBILE],
    ["1440 px", DESKTOP],
  ] as const) {
    test(`AC-125 the administrator reads the activity log, axe clean at ${name}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await signInAs(page, PEOPLE.gina);
      await page.goto("/reports/analytics");
      await expect(
        page.getByRole("heading", { level: 1, name: "Analytics & Audit" }),
      ).toBeVisible();
      const log = page.getByRole("region", { name: "Activity, newest first" });
      // Gina's own sign-in is there, with the method in its details.
      const row = log.getByRole("row").filter({ hasText: "Signed in" }).first();
      await expect(row).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
    });
  }

  test("AC-126 quick views and filters live in the address, and the view exports", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.gina);
    await page.goto("/reports/analytics");
    await page.getByRole("link", { name: "Settings and role changes" }).click();
    await expect(page).toHaveURL(/quick=settings/);
    await page.getByLabel("Kind of event").selectOption("access");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/group=access/);
    await page.getByRole("link", { name: "Reset filters" }).first().click();
    await expect(page).toHaveURL(/\/reports\/analytics$/);

    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export to Excel" }).click();
    expect((await downloading).suggestedFilename()).toMatch(/^Activity_\d{4}-\d{2}-\d{2}\.xlsx$/);
    // The export is itself in the log.
    await page.reload();
    await expect(
      page.getByRole("row").filter({ hasText: "Exported the activity log to Excel" }).first(),
    ).toBeVisible();
  });

  test("a department leader's log holds only their own activity", async ({ page }) => {
    await signInAs(page, PEOPLE.sam);
    await page.goto("/reports/analytics");
    const log = page.getByRole("region", { name: "Activity, newest first" });
    await expect(log.getByRole("row").filter({ hasText: "Signed in" }).first()).toBeVisible();
    await expect(log.getByText("Gina Admin")).toHaveCount(0);
  });

  test("global search opens with / and goes to a page by keyboard", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.pat);
    await page.keyboard.press("/");
    const search = page.getByRole("combobox", { name: /Search budgets/ });
    await expect(search).toBeFocused();
    await search.fill("review dash");
    await expect(page.getByRole("option", { name: /Review dashboard/ })).toBeVisible();
    await expectAxeClean(page);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/annual\/review$/);

    await page.keyboard.press("Control+k");
    await expect(page.getByRole("combobox", { name: /Search budgets/ })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("breadcrumbs lead back from a person's page", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.gina);
    await page.goto("/admin/users");
    await page.getByRole("link", { name: "Pat Accountant", exact: true }).first().click();
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs.getByText("Admin")).toBeVisible();
    await crumbs.getByRole("link", { name: "Users & Roles" }).click();
    await expect(page).toHaveURL(/\/admin\/users$/);
  });

  test("Home's recent activity shows what happened on the person's budgets", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.sam);
    await page.goto("/annual/new");
    await page.getByRole("radio", { name: "Other (type your department)" }).check();
    await page.getByLabel("Department name").fill("Activity Team");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/\/annual\/[0-9a-f-]+\/edit$/);
    const id = new URL(page.url()).pathname.split("/")[2];

    // The budget's own activity page (FR-52 "History tab").
    await page.goto(`/annual/${id}/activity`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const own = page.getByRole("region", { name: "Activity on this budget" });
    await expect(own.getByText("Started a draft budget")).toBeVisible();
    await expectAxeClean(page);

    await page.goto("/");
    const recent = page.getByRole("region", { name: "Recent activity" });
    await expect(recent.getByText("Started a draft budget").first()).toBeVisible();
    await recent.getByRole("link", { name: "See all activity" }).click();
    await expect(page).toHaveURL(/\/reports\/analytics$/);
  });
});
