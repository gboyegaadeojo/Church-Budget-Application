import { expect, test } from "@playwright/test";
import { approveBoth, submitClaim } from "./expense-helpers";
import { DESKTOP, expectAxeClean, MOBILE, PEOPLE, signInAs } from "./helpers";

/* Processing and payment (Stage 3; 6B.5, DRD 6.9a). Pat, the accountant, may process too. */

test.describe("Ready to process and Record payment (Stage 3)", () => {
  // Each test signs in as several people in turn; under the full parallel run that takes time.
  test.describe.configure({ timeout: 90_000 });

  test("AC-77 AC-80 an approved claim is processed and paid by e-transfer", async ({
    page,
    browser,
  }) => {
    const { id, reference } = await submitClaim(browser, "Cables for Sunday");
    await approveBoth(browser, id);

    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.pat);
    await page.goto("/expenses/ready");
    const row = page.getByRole("row", { name: new RegExp(reference) });
    await expect(row).toBeVisible();
    await expectAxeClean(page);
    await row.getByRole("button", { name: "Start processing" }).click();
    await expect(row.getByText("Processing", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: `Record payment: ${reference}` }).click();
    await expect(page.getByLabel("E-transfer", { exact: true })).toBeChecked();
    await page.getByLabel("E-transfer reference").fill("CA9xQ2");
    await expectAxeClean(page);
    await page.getByRole("button", { name: "Record $168.00 paid by e-transfer" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL(/\/expenses\/ready\?done=/);
    await expect(page.getByText("Payment recorded.", { exact: false })).toBeVisible();

    await page.goto(`/expenses/${id}`);
    await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Reference: CA9xQ2")).toBeVisible();
  });

  test("AC-76 a cheque needs its number and signers", async ({ page, browser }) => {
    const { id } = await submitClaim(browser, "Batteries for mics");
    await approveBoth(browser, id);
    await page.setViewportSize(MOBILE);
    await signInAs(page, PEOPLE.pat);
    await page.goto(`/expenses/ready/${id}`);
    await page.getByLabel("Cheque", { exact: true }).check();
    await page.getByRole("button", { name: "Record $168.00 paid by cheque" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Enter the cheque number.")).toBeVisible();
    await expectAxeClean(page);
  });
});
