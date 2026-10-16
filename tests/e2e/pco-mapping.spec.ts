import { expect, test } from "@playwright/test";
import { DESKTOP, expectAxeClean, MOBILE, PEOPLE, signInAs } from "./helpers";

/*
 * Planning Center team mapping (FR-39, AC-121, AC-122). Tests share one database and run
 * in parallel, so this uses a department no other test touches, stays in Suggest mode
 * (a suggestion gives nobody access), ignores the suggestion and unlinks at the end.
 * Automatic mode and AC-123/AC-124 are covered by tests/integration/pco-mapping.test.ts.
 */

const DEPARTMENT = "Women's Fellowship Team";

test("AC-121 AC-122 the administrator links a department to a team and handles a suggestion", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await signInAs(page, PEOPLE.gina);
  await page.goto("/admin/departments");
  await page.getByRole("link", { name: DEPARTMENT }).click();
  const panel = page.getByRole("region", { name: "Planning Center mapping" });
  await expect(panel.getByText(/Not linked to a team, group or tag/)).toBeVisible();
  await expectAxeClean(page);

  await panel.getByLabel("Linked to").selectOption({ label: "Services team: Media / Production" });
  await panel.getByRole("button", { name: "Save mapping" }).click();
  await expect(panel.getByText("Planning Center mapping saved.")).toBeVisible();
  await page.reload();
  const linked = page.getByRole("region", { name: "Planning Center mapping" });
  await expect(linked.getByText('Linked to the Services team "Media / Production".')).toBeVisible();

  await linked.getByRole("button", { name: "Sync now" }).click();
  await expect(linked.getByText(/Checked with Planning Center\./)).toBeVisible();
  await page.reload();
  const suggestions = page
    .getByRole("region", { name: "Planning Center mapping" })
    .getByRole("list", { name: "Suggested by Planning Center" });
  await expect(suggestions.getByText("Sam Lee", { exact: true })).toBeVisible();
  await expect(suggestions.getByLabel("Add as (Sam Lee)")).toBeVisible();
  await expectAxeClean(page);

  // Ignoring takes the person off the list (the row, and its message, go with it).
  await suggestions.getByRole("button", { name: "Ignore" }).click();
  const cleared = page.getByRole("region", { name: "Planning Center mapping" });
  await expect(cleared.getByText("No suggestions waiting.")).toBeVisible();
  await page.reload();
  await expect(cleared.getByText("No suggestions waiting.")).toBeVisible();

  // Leave the department as it was.
  await cleared.getByLabel("Linked to").selectOption({ label: "Not linked" });
  await cleared.getByRole("button", { name: "Save mapping" }).click();
  await expect(cleared.getByText("Planning Center mapping saved.")).toBeVisible();
});

test("the mapping panel works on a phone", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await signInAs(page, PEOPLE.gina);
  await page.goto("/admin/departments");
  await page.getByRole("link", { name: "Prime Adult/Young Adult Ministry" }).click();
  await expect(page.getByRole("region", { name: "Planning Center mapping" })).toBeVisible();
  await expectAxeClean(page);
});
