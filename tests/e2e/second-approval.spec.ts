import { expect, test } from "@playwright/test";
import { DESKTOP, expectAxeClean, PEOPLE, signInAs } from "./helpers";

/*
 * Second approval for large budgets (FR-34). Tests run in parallel against one database,
 * so this only sets a threshold far above any budget the other tests approve, and turns
 * it off again. Approving, the second approval and refusing are covered by
 * tests/integration/second-approval.test.ts.
 */

test("the administrator turns second approval on and off in Settings", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signInAs(page, PEOPLE.gina);
  await page.goto("/admin/settings");
  const section = page.getByRole("region", { name: "Second approval for large budgets" });
  await expect(section.getByText("Off: every approval is final.")).toBeVisible();
  await expectAxeClean(page);

  await section.getByLabel(/Second approval at or above/).fill("5,000,000.00");
  await section.getByRole("button", { name: "Save" }).click();
  await expect(section.getByText("Second approval threshold saved.")).toBeVisible();
  await page.reload();
  const after = page.getByRole("region", { name: "Second approval for large budgets" });
  await expect(
    after.getByText("On: approvals of $5,000,000.00 or more need a second sign-off."),
  ).toBeVisible();

  await after.getByLabel(/Second approval at or above/).fill("");
  await after.getByRole("button", { name: "Save" }).click();
  await expect(after.getByText("Second approval threshold saved.")).toBeVisible();
});
