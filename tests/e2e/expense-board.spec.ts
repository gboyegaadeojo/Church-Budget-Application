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

/* The Board Chair's final approval (Stage 3; 6B.4 level 2, DRD 6.9a). */

/** Pat approves it as the accountant, in their own browser. */
async function accountantApproves(browser: Browser, id: string) {
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();
  await signInAs(page, PEOPLE.pat);
  await page.goto(`/expenses/review/${id}`);
  await page.getByRole("button", { name: "Approve and send to Board Chair" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click();
  await page.waitForURL(/\?done=approve$/);
  await context.close();
}

test.describe("Expense review: Board Chair (Stage 3)", () => {
  // Each test signs in as several people in turn; under the full parallel run that takes time.
  test.describe.configure({ timeout: 90_000 });

  test("AC-73 AC-74 final approval on a phone charges the budget", async ({ page, browser }) => {
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
    await page.getByRole("button", { name: "Give final approval" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL(/\?done=final_approve$/);
    await expect(page.getByText("Final approval given.")).toBeVisible();
    await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
  });

  test("AC-75 the board can't approve more than the accountant did", async ({ page, browser }) => {
    const { id } = await submitPurchase(browser, "Cable ties");
    await accountantApproves(browser, id);
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.cleo);
    await page.goto(`/expenses/awaiting-approval/${id}`);
    await page.getByLabel("Approve a smaller amount").check();
    await page.getByLabel("Approved total (incl. tax)").fill("900.00");
    await page.getByLabel("Reason").fill("More");
    await page.getByRole("button", { name: "Approve a smaller amount" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click();
    await expect(
      page.getByText(
        "The Board Chair can't approve more than the $504.00 the accountant approved.",
      ),
    ).toBeVisible();
  });

  test("AC-112 the Vice-Chair waits while the Board Chair can decide", async ({
    page,
    browser,
  }) => {
    const { id } = await submitPurchase(browser, "Lens cloths");
    await accountantApproves(browser, id);
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
