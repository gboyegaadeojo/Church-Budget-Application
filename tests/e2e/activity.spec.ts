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
      // Gina's own sign-in is there: a table row on a wide screen, a card on a phone.
      await expect(log.getByText("Signed in").filter({ visible: true }).first()).toBeVisible();
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
    await page.getByText("More filters").click();
    await page.getByLabel("Kind of event").selectOption("access");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/group=access/);
    // Each applied filter is a chip that removes just itself.
    const applied = page.getByRole("list", { name: "Filters applied" });
    await expect(applied.getByRole("link")).toHaveCount(2);
    await applied.getByRole("link", { name: "Remove filter: Access and sign-in" }).click();
    await expect(page).toHaveURL(/quick=settings$/);
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

  test("AC-128 a department leader can't open Analytics & Audit or export the log", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.sam);
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link", { name: "Analytics & Audit" })).toHaveCount(0);
    await page.goto("/reports/analytics");
    await expect(page.getByText("Analytics & Audit is for church staff.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Activity, newest first" })).toHaveCount(0);
    const response = await page.request.get("/api/exports/activity");
    expect(response.status()).toBe(403);
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

  test("a leader keeps their budget's history, without Recent activity on Home", async ({
    page,
  }) => {
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
    await expect(own.getByText("Started a draft budget").filter({ visible: true })).toBeVisible();
    await expectAxeClean(page);

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Recent activity" })).toHaveCount(0);
  });

  test("staff see Recent activity on Home, linked to the full log", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.pat);
    const recent = page.getByRole("region", { name: "Recent activity" });
    await expect(recent).toBeVisible();
    await recent.getByRole("link", { name: "See all activity" }).click();
    await expect(page).toHaveURL(/\/reports\/analytics$/);
  });

  for (const [name, size] of [
    ["360 px", MOBILE],
    ["1440 px", DESKTOP],
  ] as const) {
    test(`FR-52 the administrator's Access tab lists sign-ins and what to fix, axe clean at ${name}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await signInAs(page, PEOPLE.gina);
      await page.goto("/reports/analytics");
      await page
        .getByRole("navigation", { name: "Analytics & Audit tabs" })
        .getByRole("link", { name: "Access" })
        .click();
      await expect(page).toHaveURL(/\/reports\/analytics\/access$/);
      await expect(page.getByRole("region", { name: "Sign-ins per day" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Failed sign-ins" })).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Departments without a Backup" }),
      ).toBeVisible();
      await expectAxeClean(page);
      await expectNoHorizontalScroll(page);
    });
  }

  test("FR-52 staff don't see the Access tab, and can't open it", async ({ page }) => {
    await signInAs(page, PEOPLE.pat);
    await page.goto("/reports/analytics");
    await expect(
      page.getByRole("navigation", { name: "Analytics & Audit tabs" }).getByRole("link", {
        name: "Access",
      }),
    ).toHaveCount(0);
    await page.goto("/reports/analytics/access");
    await expect(page.getByText("The Access tab is for the System Administrator.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Sign-ins per day" })).toHaveCount(0);
  });

  test("the accountant's log has no sign-in, settings or email views", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.pat);
    await page.goto("/reports/analytics");
    const quick = page.getByRole("region", { name: "Quick views" });
    await expect(quick.getByRole("link", { name: "Money changes" })).toBeVisible();
    for (const name of [
      "Failed sign-ins and access denied",
      "Settings and role changes",
      "Emails that failed",
    ]) {
      await expect(quick.getByRole("link", { name })).toHaveCount(0);
    }
    await page.getByText("More filters").click();
    await expect(
      page.getByLabel("Role used").locator("option", { hasText: "System Administrator" }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel("Area", { exact: true }).locator("option", { hasText: "Access" }),
    ).toHaveCount(0);
    await expectAxeClean(page);
  });
});
