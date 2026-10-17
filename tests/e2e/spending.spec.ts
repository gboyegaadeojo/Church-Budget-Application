import { expect, test } from "@playwright/test";
import { DESKTOP, expectAxeClean, MOBILE, PEOPLE, signInAs } from "./helpers";

/*
 * Spending tracking (Stage 4; FR-24, DRD 6.8). The seed has a closed FY2026 cycle with
 * Media Team's $30,000.00 approved. Amounts here are small, so other tests' budget
 * figures for Media aren't pushed over.
 */

test.describe("Spending (Stage 4)", () => {
  test.describe.configure({ timeout: 90_000 });

  test("AC-82 AC-87 record two entries, then correct and void one", async ({ page }) => {
    const payee = `Payee ${Date.now()}`;
    await page.setViewportSize(MOBILE);
    await signInAs(page, PEOPLE.gina);
    await page.goto("/spending/record");
    await page.getByLabel("Budget year", { exact: true }).selectOption({ label: "FY2026" });
    await page.getByLabel("Department", { exact: true }).selectOption({ label: "Media Team" });
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Media Team · FY2026" })).toBeVisible();
    await expectAxeClean(page);

    for (const [name, amount] of [
      [payee, "12.34"],
      [`${payee} second`, "5.00"],
    ]) {
      await page.getByLabel("Date paid").fill("2026-06-01");
      await page.getByLabel("Payee or vendor").fill(name);
      await page.getByLabel("Amount paid (incl. tax)").fill(amount);
      await page.getByLabel("What it was for").fill("Cables");
      await page.getByLabel("How it was paid").selectOption({ label: "Church card" });
      await page.getByRole("button", { name: "Record" }).click();
      await expect(page.getByText("Recorded. Spent and Remaining are updated.")).toBeVisible();
    }

    await page.setViewportSize(DESKTOP);
    await page.goto("/spending/ledger");
    await page.getByLabel("Budget cycle").selectOption({ label: "FY2026" });
    await page.getByRole("button", { name: "Show" }).click();
    await expect(page.getByRole("link", { name: `${payee} second` })).toBeVisible();
    await page.getByRole("link", { name: payee, exact: true }).click();

    await page.getByLabel("Amount paid (incl. tax)").fill("12.50");
    await page.getByLabel("Reason for the change").fill("Receipt said $12.50.");
    await page.getByRole("button", { name: "Save correction" }).click();
    await expect(page.getByText(/Corrected\./)).toBeVisible();

    await page.getByLabel("Reason for voiding").fill("Entered twice.");
    await page.getByRole("button", { name: "Void entry" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Void entry" }).click();
    await expect(page.getByText("Voided.", { exact: true })).toBeVisible();
    await expect(page.getByText("Voided: Entered twice.")).toBeVisible();
    await expectAxeClean(page);
  });

  test("AC-88 a department leader can't record spending", async ({ page }) => {
    await signInAs(page, PEOPLE.sam);
    await page.goto("/spending/record");
    await expect(
      page.getByRole("heading", { name: "You don't have access to this page" }),
    ).toBeVisible();
  });
});
