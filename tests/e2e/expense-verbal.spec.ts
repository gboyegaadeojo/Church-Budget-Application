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
 * The Church Administrator records the Accountant's and the Board Chair's verbal
 * approvals (decided by the church 2026-10-24). Gina holds every role, including Church
 * Administrator; the panel never offers her own name.
 */

async function recordVerbal(page: Page, who: RegExp, done: RegExp) {
  const panel = page.getByRole("region", { name: "Record a verbal approval" });
  await panel.getByRole("radio", { name: who }).check();
  await panel.getByLabel("When and how they told you").fill("By phone, Oct 24");
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "Record verbal approval" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("It won't say they approved in the app.");
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await page.waitForURL(done);
}

test.describe("Verbal approvals (decided 2026-10-24)", () => {
  test.describe.configure({ timeout: 90_000 });

  test("the Church Administrator records both approvals; each says verbal and who recorded it", async ({
    page,
    browser,
  }) => {
    const { id } = await submitPurchase(browser, "Verbal approval stands");
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.gina);
    await page.goto(`/expenses/${id}`);

    const panel = page.getByRole("region", { name: "Record a verbal approval" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("radio", { name: /Gina Admin/ })).toHaveCount(0);
    await expectAxeClean(page);

    // Without the confirmation, nothing is recorded.
    await panel.getByRole("radio", { name: /Pat Accountant.*Accountant approval/ }).check();
    await panel.getByLabel("When and how they told you").fill("By phone, Oct 24");
    await panel.getByRole("button", { name: "Record verbal approval" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click();
    await expect(panel.getByText(/Tick the box to confirm/)).toBeVisible();

    await recordVerbal(page, /Pat Accountant.*Accountant approval/, /\?done=verbal_waiting$/);
    await expect(page.getByText(/Pat Accountant \(Accountant\), verbally/)).toBeVisible();
    await expect(page.getByText(/Recorded by Gina Admin \(Church Administrator\)/)).toBeVisible();

    await recordVerbal(page, /Cleo Chair.*Board Chair approval/, /\?done=verbal_fully_approved$/);
    await expect(page.getByText(/Both approvals are given, so it's approved/)).toBeVisible();
    await expect(page.getByText(/Cleo Chair \(Board Chair\), verbally/)).toBeVisible();
    await expect(page.getByText(/Pat Accountant \(verbal\)/)).toBeVisible();
    // Nothing more to record once it's approved.
    await expect(panel).toHaveCount(0);
  });

  test("the panel works at 360 px and is axe clean", async ({ page, browser }) => {
    const { id } = await submitPurchase(browser, "Verbal on a phone");
    await page.setViewportSize(MOBILE);
    await signInAs(page, PEOPLE.gina);
    await page.goto(`/expenses/${id}`);
    await expect(page.getByRole("region", { name: "Record a verbal approval" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });

  test("an approver doesn't see the panel", async ({ page, browser }) => {
    const { id } = await submitPurchase(browser, "Verbal not for approvers");
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.pat);
    await page.goto(`/expenses/${id}`);
    await expect(page.getByRole("heading", { name: "Verbal not for approvers" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Record a verbal approval" })).toHaveCount(0);
  });
});
