import { expect, test, type Browser } from "@playwright/test";
import { submitPurchase } from "./expense-helpers";
import {
  DESKTOP,
  expectAxeClean,
  expectNoHorizontalScroll,
  MOBILE,
  PEOPLE,
  signInAs,
} from "./helpers";

/* The Board Chair's approval, asked alongside the accountant (6B.4, DRD 6.9a; AC-142). */

/** Pat approves it as the accountant, in their own browser. */
async function accountantApproves(browser: Browser, id: string, done = /\?done=waiting$/) {
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();
  await signInAs(page, PEOPLE.pat);
  await page.goto(`/expenses/review/${id}`);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click();
  await page.waitForURL(done);
  await context.close();
}

test.describe("Expense review: Board Chair (Stage 3)", () => {
  // Each test signs in as several people in turn; under the full parallel run that takes time.
  test.describe.configure({ timeout: 90_000 });

  test("AC-73 AC-74 the second approval, on a phone, charges the budget", async ({
    page,
    browser,
  }) => {
    const { id, reference } = await submitPurchase(browser, "Monitor speakers");
    await accountantApproves(browser, id);

    await page.setViewportSize(MOBILE);
    await signInAs(page, PEOPLE.cleo);
    await page.goto("/expenses/awaiting-approval");
    await page.getByRole("link", { name: reference }).click();
    await expect(
      page.getByText(/The accountant \(Pat Accountant\) approved \$504\.00\./),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL(/\?done=fully_approved$/);
    await expect(page.getByText(/Both approvals are given/)).toBeVisible();
    await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
  });

  test("AC-142 AC-143 the Board Chair approves first; the lower amount is final", async ({
    page,
    browser,
  }) => {
    const { id } = await submitPurchase(browser, "Cable ties");
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.cleo);
    await page.goto(`/expenses/awaiting-approval/${id}`);
    // AC-75: never more than asked.
    await page.getByLabel("Approve a smaller amount").check();
    await page.getByLabel("Approved total (incl. tax)").fill("900.00");
    await page.getByLabel("Reason").fill("More");
    await page.getByRole("button", { name: "Approve a smaller amount" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click();
    await expect(
      page.getByText("The approved amount can't be more than the $504.00 asked for."),
    ).toBeVisible();
    await page.getByLabel("Approved total (incl. tax)").fill("400.00");
    await page.getByLabel("Reason").fill("Half the ties.");
    await page.getByRole("button", { name: "Approve a smaller amount" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL(/\?done=waiting$/);
    await expect(page.getByText("Awaiting accountant", { exact: true }).first()).toBeVisible();

    await accountantApproves(browser, id, /\?done=fully_approved$/);
    await page.goto(`/expenses/awaiting-approval/${id}`);
    await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("$400.00").first()).toBeVisible();
  });

  test("AC-112 the Vice-Chair waits while the Board Chair can decide", async ({
    page,
    browser,
  }) => {
    const { id } = await submitPurchase(browser, "Lens cloths");
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.vic);
    await page.goto(`/expenses/awaiting-approval/${id}`);
    await expect(
      page.getByText(
        "The Board Chair is available and not conflicted, so the Board Chair gives this approval.",
      ),
    ).toBeVisible();
  });
});
