import { expect, test } from "@playwright/test";
import { DESKTOP, expectAxeClean, PEOPLE, signInAs } from "./helpers";

/*
 * Email preferences (FR-21, DRD 6.11b). Tests share one database and run in parallel, so
 * nothing here changes the accountant's emails (other tests count them). Who gets what,
 * and the daily digest, are covered by tests/integration/email-preferences.test.ts.
 */

test("a leader turns reminders off from the account menu, and back on", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signInAs(page, PEOPLE.sam);
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("menuitem", { name: "Email preferences" }).click();
  await expect(page).toHaveURL(/\/account#email$/);

  const section = page.getByRole("region", { name: "Email preferences" });
  await expect(section.getByText("Always sent")).toBeVisible();
  // Copies and the digest are the accountant's.
  await expect(section.getByLabel("Copies of my own decisions")).toHaveCount(0);
  await expectAxeClean(page);

  const reminders = section.getByLabel("Reminders");
  await expect(reminders).toBeChecked();
  await reminders.uncheck();
  await section.getByRole("button", { name: "Save email preferences" }).click();
  await expect(section.getByText("Email preferences saved.")).toBeVisible();
  await page.reload();
  const after = page.getByRole("region", { name: "Email preferences" });
  await expect(after.getByLabel("Reminders")).not.toBeChecked();

  await after.getByLabel("Reminders").check();
  await after.getByRole("button", { name: "Save email preferences" }).click();
  await expect(after.getByText("Email preferences saved.")).toBeVisible();
});

test("the accountant can choose copies and a daily digest", async ({ page }) => {
  await signInAs(page, PEOPLE.pat);
  await page.goto("/account");
  const section = page.getByRole("region", { name: "Email preferences" });
  await expect(section.getByLabel("Copies of my own decisions")).toBeChecked();
  await expect(section.getByLabel("New submissions and revisions")).toHaveValue("instant");
});
