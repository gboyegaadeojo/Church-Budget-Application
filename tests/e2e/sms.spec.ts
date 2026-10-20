import { expect, test } from "@playwright/test";
import { DESKTOP, expectAxeClean, PEOPLE, signInAs } from "./helpers";

/*
 * Reminder texts (docs/decisions.md 2026-10-18). Queuing, quiet hours, the monthly cap and
 * STOP are covered by tests/integration/sms-reminders.test.ts; the reminders job isn't
 * run here because its texts wait for church daytime. This checks the Settings card.
 */

test("the administrator sees reminder texts and keeps the monthly limit", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signInAs(page, PEOPLE.gina);
  await page.goto("/admin/settings?section=texts");
  const section = page.getByRole("region", { name: "Reminder texts" });
  await expect(section.getByText("Connected")).toBeVisible();
  await expect(section.getByText("Sent this month")).toBeVisible();
  await expect(section.getByText(/^\d+ of 300$/)).toBeVisible();
  await section.getByText("Most texts a month", { exact: true }).click();
  await expectAxeClean(page);

  const limit = section.getByLabel("Most texts a month");
  await limit.fill("lots");
  await section.getByRole("button", { name: "Save" }).click();
  await expect(section.getByText(/Enter a whole number of texts/)).toBeVisible();

  // Saving the same limit keeps the shared database as the other tests expect it.
  await limit.fill("300");
  await section.getByRole("button", { name: "Save" }).click();
  await expect(section.getByText("Text limit saved.")).toBeVisible();
});
