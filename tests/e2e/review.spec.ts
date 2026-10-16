import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  DESKTOP,
  expectAxeClean,
  expectNoHorizontalScroll,
  MOBILE,
  PEOPLE,
  signInAs,
} from "./helpers";

/*
 * The accountant dashboard and review (Stage 1 step 6; DRD 6.6, 6.7). Tests run in
 * parallel against one database, so each uses its own department. Every request is
 * 1 × $1,025.00: $1,025.00 + $123.00 tax = $1,148.00.
 */

/** Sam submits a one-item budget for `department`; returns the request id. */
async function submitAsSam(browser: Browser, department: string): Promise<string> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize(DESKTOP);
  await signInAs(page, PEOPLE.sam);
  await page.goto("/annual/new");
  await page.getByRole("radio", { name: department, exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/annual\/[0-9a-f-]+\/edit$/);
  await page.getByLabel("Request title").fill(`${department} 2027`);
  await page.getByLabel("Why are you requesting this budget?").fill("For the year.");
  await page.getByRole("button", { name: "Next" }).click();
  const row = page.getByRole("group", { name: "Item 1" });
  await row.getByLabel("Item name").fill("Microphone");
  await row.getByLabel("Quantity").fill("1");
  await row.getByLabel("Unit price (before tax)").fill("1025.00");
  await page.getByRole("button", { name: "Preview" }).click();
  await page.getByRole("button", { name: "Confirm submission" }).click();
  await page.getByRole("button", { name: "Submit request" }).click();
  await page.waitForURL(/\/annual\/[0-9a-f-]+\?done=submitted$/);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  await context.close();
  return id;
}

/** The accountant opens the request from the review queue. */
async function openFromQueue(page: Page, department: string) {
  await page.goto("/annual/review");
  const queue = page.getByRole("region", { name: "Submitted budget requests" });
  await queue
    .getByRole("row")
    .filter({ hasText: department })
    .getByRole("link", { name: /^(Review|Open) / })
    .click();
  await page.waitForURL(/\/annual\/review\/[0-9a-f-]+$/);
}

async function chooseDecision(page: Page, label: string) {
  await page.getByRole("radio", { name: label }).check();
}

async function confirmDecision(page: Page, button: RegExp | string, confirm: string) {
  await page.getByRole("button", { name: button }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: confirm }).click();
}

test.describe("Accountant review (Stage 1 step 6)", () => {
  test("AC-47 AC-49 AC-35 AC-51 approve a different amount incl. tax, and the department sees it", async ({
    page,
    browser,
  }) => {
    const id = await submitAsSam(browser, "Prayer Warrior Team");
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.pat);

    // The dashboard lists the department with its requested total.
    await page.goto("/annual/review");
    const departments = page.getByRole("region", {
      name: "Each expected department and where its budget is",
    });
    const deptRow = departments.getByRole("row").filter({ hasText: "Prayer Warrior Team" });
    await expect(deptRow.getByText("$1,148.00")).toBeVisible();

    await openFromQueue(page, "Prayer Warrior Team");
    // Opening it starts the review.
    await expect(page.getByText("In Review", { exact: true }).first()).toBeVisible();

    await chooseDecision(page, "Approve a different amount");
    await page.getByLabel("Approved total (incl. tax)").fill("1,000.00");
    await expect(page.getByText("Includes $107.14 sales tax (12%) on $892.86")).toBeVisible();
    await expect(page.getByText("$148.00 less than requested")).toBeVisible();

    // A note is required.
    await page.getByRole("button", { name: "Review decision" }).click();
    await expect(page.getByLabel("Note (required)")).toBeFocused();
    await page.getByLabel("Note (required)").fill("The board approved $1,000.00.");
    await page
      .getByLabel("Board approval reference (optional)")
      .fill("Board minutes, Nov 12, 2026");

    await page.getByRole("button", { name: "Review decision" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Approve this budget?" });
    await expect(dialog.getByText("$148.00 less than requested")).toBeVisible();
    await expectAxeClean(page);
    await dialog.getByRole("button", { name: "Approve", exact: true }).click();

    await page.waitForURL(/\?done=approved$/);
    await expect(page.getByRole("heading", { name: "Budget approved" })).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Financial summary" })
        .getByText("Board approval reference: Board minutes, Nov 12, 2026"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();

    // The department sees the approved amount beside what it asked for.
    const sam = await browser.newContext();
    const samPage = await sam.newPage();
    await signInAs(samPage, PEOPLE.sam);
    await samPage.goto(`/annual/${id}`);
    await expect(samPage.getByRole("heading", { name: "Approved budget" })).toBeVisible();
    await expect(samPage.getByText("$148.00 less than requested")).toBeVisible();
    await sam.close();
  });

  test("AC-35 adjust individual items: tax is added to the approved items", async ({
    page,
    browser,
  }) => {
    await submitAsSam(browser, "Children Sunday School");
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.pat);
    await openFromQueue(page, "Children Sunday School");

    await chooseDecision(page, "Adjust individual items");
    await page.getByLabel("Approved unit price for Microphone").fill("900.00");
    await page.getByLabel("Note (required)").fill("Cheaper model");
    // $900.00 + 12% = $1,008.00
    await expect(page.getByText("$140.00 less than requested")).toBeVisible();
    await confirmDecision(page, "Review decision", "Approve");
    await page.waitForURL(/\?done=approved$/);
    await expect(page.getByText("→ $900.00")).toBeVisible();
  });

  test("AC-54 return for clarification; the department sees the question", async ({
    page,
    browser,
  }) => {
    const id = await submitAsSam(browser, "Quality Control Team");
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.pat);
    await openFromQueue(page, "Quality Control Team");

    await chooseDecision(page, "Return for clarification");
    await page.getByRole("button", { name: "Review decision" }).click();
    await expect(page.getByText("Write what the department needs to clarify.")).toBeVisible();
    await page
      .getByLabel("What does the department need to clarify?")
      .fill("Which microphone model?");
    await confirmDecision(page, "Review decision", "Return request");
    await page.waitForURL(/\?done=returned$/);
    await expect(page.getByRole("heading", { name: "Returned for clarification" })).toBeVisible();

    const sam = await browser.newContext();
    const samPage = await sam.newPage();
    await signInAs(samPage, PEOPLE.sam);
    await samPage.goto(`/annual/${id}`);
    await expect(samPage.getByRole("heading", { name: "The accountant asked" })).toBeVisible();
    await expect(samPage.getByText("Which microphone model?")).toBeVisible();
    await sam.close();
  });

  test("AC-55 decline with a reason, then reopen", async ({ page, browser }) => {
    await submitAsSam(browser, "Young Couples Ministry");
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.pat);
    await openFromQueue(page, "Young Couples Ministry");

    await chooseDecision(page, "Decline");
    await page.getByLabel("Reason for declining").fill("No funds this year");
    await confirmDecision(page, "Review decision", "Decline request");
    await page.waitForURL(/\?done=declined$/);
    await expect(page.getByRole("heading", { name: "Budget declined" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Decision", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Reopen" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Reopen this budget?" });
    await dialog.getByLabel("Reason for reopening").fill("The board reconsidered");
    await dialog.getByRole("button", { name: "Reopen" }).click();
    await page.waitForURL(/\?done=reopened$/);
    await expect(page.getByText("Reopened by Pat Accountant")).toBeVisible();
  });

  test("AC-62 an accountant who represents the department can't decide it", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.gina);
    // Gina is an accountant and a requester; she submits for a department she then represents.
    await page.goto("/annual/new");
    await page.getByRole("radio", { name: "Women's Fellowship Team", exact: true }).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/\/annual\/[0-9a-f-]+\/edit$/);
    await page.getByLabel("Request title").fill("Women's Fellowship 2027");
    await page.getByLabel("Why are you requesting this budget?").fill("Retreat");
    await page.getByRole("button", { name: "Next" }).click();
    const row = page.getByRole("group", { name: "Item 1" });
    await row.getByLabel("Item name").fill("Venue");
    await row.getByLabel("Unit price (before tax)").fill("500");
    await page.getByRole("button", { name: "Preview" }).click();
    await page.getByRole("button", { name: "Confirm submission" }).click();
    await page.getByRole("button", { name: "Submit request" }).click();
    await page.waitForURL(/\?done=submitted$/);

    await openFromQueue(page, "Women's Fellowship Team");
    await expect(
      page.getByText(
        "You represent this department, so another approver must decide this request.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("radio", { name: "Approve as requested" })).toHaveCount(0);
  });

  test("All budgets lists every department (administrator view; read-only is covered by integration tests)", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.gina);
    await page.goto("/annual/all");
    await expect(page.getByRole("heading", { level: 1, name: "All budgets" })).toBeVisible();
    // Gina is also an accountant, so she isn't view-only: permissions are the union of roles.
    await expect(
      page.getByRole("region", { name: "Each expected department and where its budget is" }),
    ).toBeVisible();
  });

  for (const [label, viewport] of [
    ["360 px", MOBILE],
    ["1440 px", DESKTOP],
  ] as const) {
    test(`AC-103 review screens are axe clean with no sideways scroll at ${label}`, async ({
      page,
      browser,
    }) => {
      const department =
        label === "360 px" ? "Social Media Team" : "Prime Adult/Young Adult Ministry";
      await submitAsSam(browser, department);
      await page.setViewportSize(viewport);
      await signInAs(page, PEOPLE.pat);
      await page.goto("/annual/review");
      await expectAxeClean(page);
      await expectNoHorizontalScroll(page);
      await openFromQueue(page, department);
      await chooseDecision(page, "Adjust individual items");
      await expectAxeClean(page);
      await expectNoHorizontalScroll(page);
    });
  }
});
