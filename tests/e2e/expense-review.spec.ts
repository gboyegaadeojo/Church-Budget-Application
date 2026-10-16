import { expect, test } from "@playwright/test";
import { submitPurchase } from "./expense-helpers";
import { DESKTOP, expectAxeClean, MOBILE, PEOPLE, signInAs } from "./helpers";

/* The accountant's first approval (Stage 3; 6B.4 level 1, DRD 6.9a). */

test.describe("Expense review: accountant (Stage 3)", () => {
  test("AC-69 AC-73 approve a different amount and send to the Board Chair", async ({
    page,
    browser,
  }) => {
    const { id, reference } = await submitPurchase(browser, "Replacement cables");
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.pat);
    await page.goto("/expenses/review");
    await expect(page.getByRole("heading", { name: "Expense review queue" })).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole("link", { name: reference }).click();
    await page.waitForURL(`**/expenses/review/${id}`);
    // Opening it starts the review (FR-44).
    await expect(page.getByText("In Review", { exact: true }).first()).toBeVisible();

    await page.getByLabel("Approve a different amount and send to Board Chair").check();
    await page.getByLabel("Approved total (incl. tax)").fill("500.00");
    await expect(page.getByText("$446.43 before tax + $53.57 tax")).toBeVisible();
    await page.getByLabel("Reason").fill("One microphone for now.");
    await expectAxeClean(page);
    await page
      .getByRole("button", { name: "Approve a different amount and send to Board Chair" })
      .click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL(/\?done=approve_different_amount$/);
    await expect(page.getByText("Approved and sent to the Board Chair.")).toBeVisible();
    await expect(page.getByText("Awaiting Board Chair", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Approved a different amount · Pat Accountant")).toBeVisible();
  });

  test("returns a question to the department on a phone", async ({ page, browser }) => {
    const { id } = await submitPurchase(browser, "Stage tape");
    await page.setViewportSize(MOBILE);
    await signInAs(page, PEOPLE.pat);
    await page.goto(`/expenses/review/${id}`);
    await page.getByLabel("Return for clarification").check();
    await page.getByLabel("Your question").fill("Which brand?");
    await page.getByRole("button", { name: "Return for clarification" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL(/\?done=return$/);
    await expect(page.getByText("Returned to the department.")).toBeVisible();
    await expectAxeClean(page);
  });

  test("AC-72 an accountant who leads the department can't decide it", async ({
    page,
    browser,
  }) => {
    const { id } = await submitPurchase(browser, "Gaffer tape");
    await page.setViewportSize(DESKTOP);
    // Gina holds every role and is Media Team's Primary.
    await signInAs(page, PEOPLE.gina);
    await page.goto(`/expenses/review/${id}`);
    await expect(page.getByText(/You can't decide this one/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve and send to Board Chair" })).toHaveCount(
      0,
    );
  });
});
