import { expect, test, type Page } from "@playwright/test";
import { submitPurchase } from "./expense-helpers";
import {
  DESKTOP,
  expectAxeClean,
  expectNoHorizontalScroll,
  MOBILE,
  PEOPLE,
  signInAs,
} from "./helpers";

/*
 * Home's dashboards (decided by the church 2026-10-20): the accountant, the Board Chair
 * and Vice-Chair, and a lighter one for the Church Administrator. Each shows only what
 * the person's roles can see.
 */

async function home(page: Page, who: string) {
  await signInAs(page, who);
  await expect(page.getByRole("heading", { level: 2, name: "My tasks" })).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}

for (const [label, viewport] of [
  ["1440 px", DESKTOP],
  ["360 px", MOBILE],
] as const) {
  test(`the accountant's Home: today, the season, expenses and spending, axe clean at ${label}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await home(page, PEOPLE.pat);
    await expect(
      page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening), Pat$/ }),
    ).toBeVisible();
    const today = page.getByRole("region", { name: "Needs you today" });
    for (const tile of [
      "Expenses to approve",
      "Annual budgets to review",
      "Messages from departments",
      "Decisions to release",
    ]) {
      await expect(today.getByText(tile)).toBeVisible();
    }
    await expect(page.getByRole("region", { name: /budget season$/ })).toBeVisible();
    await expect(page.getByRole("region", { name: /^Expenses in / })).toBeVisible();
    await expect(page.getByRole("region", { name: /spending$/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Departments to watch" })).toBeVisible();
    // The accountant has no board approvals to give.
    await expect(page.getByRole("region", { name: "Waiting for your approval" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open review queue" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });
}

test("the Board Chair sees what waits for them, the year against the board's approval", async ({
  page,
  browser,
}) => {
  await submitPurchase(browser, "Home board card");
  await page.setViewportSize(DESKTOP);
  await home(page, PEOPLE.cleo);
  const approvals = page.getByRole("region", { name: "Waiting for your approval" });
  // Oldest first, five at most; other tests add expenses too, so ours may be further down.
  await expect(approvals.getByRole("link", { name: /^EXP-\d{4}-\d{4} · / }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: /against the board's approval$/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Budget years" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Your recent decisions" })).toBeVisible();
  // Board members don't review annual budgets.
  await expect(page.getByRole("region", { name: "Needs you today" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: /budget season$/ })).toHaveCount(0);
  await expectAxeClean(page);
  await page.setViewportSize(MOBILE);
  await expectNoHorizontalScroll(page);
});

test("the Vice-Chair sees the expenses as the Board Chair's while she's available", async ({
  page,
  browser,
}) => {
  await submitPurchase(browser, "Home vice card");
  await page.setViewportSize(DESKTOP);
  await home(page, PEOPLE.vic);
  const approvals = page.getByRole("region", { name: "Waiting for your approval" });
  await expect(approvals.getByText(/^These are with .+\. You can decide them while/)).toBeVisible();
  await expectAxeClean(page);
});
