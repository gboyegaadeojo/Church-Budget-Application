import { expect, test } from "@playwright/test";
import { DESKTOP, expectAxeClean, MOBILE, PEOPLE, signInAs } from "./helpers";

/*
 * A department's page: its leaders, adding a leader from Planning Center, and its details
 * (FR-38). Team mapping (FR-39) is turned off for the church (docs/decisions.md
 * 2026-10-19): its panel shows only on a department already linked, and the mapping
 * itself is covered by tests/integration/pco-mapping.test.ts. Tests share one database,
 * so nothing here is changed for good.
 */

test("a department's page shows its leaders and details, with no team mapping", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await signInAs(page, PEOPLE.gina);
  await page.goto("/admin/departments");
  await page.getByRole("link", { name: "Women's Fellowship Team" }).click();
  await expect(page.getByRole("region", { name: "Leaders" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Department details" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Planning Center mapping" })).toHaveCount(0);
  await expectAxeClean(page);
});

test("the administrator finds a person in Planning Center to add as a leader, and is told who can't lead", async ({
  page,
}) => {
  // Jo Member isn't a Group Leader, so nothing is added.
  await page.setViewportSize(DESKTOP);
  await signInAs(page, PEOPLE.gina);
  await page.goto("/admin/departments");
  await page.getByRole("link", { name: "Visitation Team" }).click();
  const search = page.getByRole("search", { name: "Add a leader" });
  await search.getByLabel("Name or email in Planning Center").fill("Jo Member");
  await search.getByRole("button", { name: "Find" }).click();
  await expect(page).toHaveURL(/pco=Jo/);
  const add = page.getByRole("form", { name: "Add Jo Member as" });
  await expect(add).toBeVisible();
  await expectAxeClean(page);
  await add.getByRole("button", { name: "Add" }).click();
  await expect(add.getByRole("alert")).toContainText("Jo Member isn't marked as a Group Leader");
});

test("a department's page works on a phone", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await signInAs(page, PEOPLE.gina);
  await page.goto("/admin/departments");
  await page.getByRole("link", { name: "Prime Adult/Young Adult Ministry" }).click();
  await expect(page.getByRole("region", { name: "Leaders" })).toBeVisible();
  await expectAxeClean(page);
});
