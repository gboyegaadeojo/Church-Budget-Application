import { expect, test } from "@playwright/test";
import { approveBoth, submitClaim, submitPurchase } from "./expense-helpers";
import { DESKTOP, expectAxeClean, MOBILE, PEOPLE, signInAs } from "./helpers";

/*
 * Expenses across the app (Stage 3): emails, My tasks, the ledger, All expenses, search,
 * and the over-budget warning on the approver's screen.
 */

test.describe("Expenses across the app (Stage 3)", () => {
  // Each test signs in as several people in turn; under the full parallel run that takes time.
  test.describe.configure({ timeout: 90_000 });

  test("AC-79 the requester gets a receipt email with the reference", async ({ page, browser }) => {
    const { reference } = await submitPurchase(browser, "Receipt email check");
    await signInAs(page, PEOPLE.sam);
    // Emails go out just after the change commits, so wait for it.
    await expect
      .poll(async () => {
        const response = await page.request.get("/api/test/emails?to=sam.lee@example.org");
        const { emails } = (await response.json()) as { emails: { subject: string }[] };
        return emails.map((e) => e.subject);
      })
      .toContain(`Received: ${reference} (Media Team)`);
  });

  test("AC-109 the accountant's My tasks lists an expense to review", async ({ page, browser }) => {
    const { reference } = await submitPurchase(browser, "Task list check");
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.pat);
    await page.goto("/");
    const task = page.getByRole("listitem").filter({ hasText: reference });
    await expect(task.getByText("Expense to review")).toBeVisible();
    await task.getByRole("link", { name: "Review" }).click();
    await page.waitForURL(/\/expenses\/review\//);
  });

  test("AC-70 the accountant sees the overage and the explanation", async ({ page, browser }) => {
    const { id } = await submitPurchase(browser, "Projector for the hall", "40000.00");
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.pat);
    await page.goto(`/expenses/review/${id}`);
    await expect(page.getByText(/This takes Media Team over budget by \$/)).toBeVisible();
    await expect(page.getByText("Needed regardless.")).toBeVisible();
  });

  test("AC-80 a paid claim is in the spending ledger without re-typing", async ({
    page,
    browser,
  }) => {
    const { id, reference } = await submitClaim(browser, "Ledger check");
    await approveBoth(browser, id);
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.pat);
    await page.goto("/spending/ledger");
    await page.getByLabel("Budget cycle", { exact: true }).selectOption({ label: "FY2026" });
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("link", { name: reference })).toBeVisible();
    await expectAxeClean(page);
  });

  test("FR-48 All expenses searches every submission; global search finds a reference", async ({
    page,
    browser,
  }) => {
    const { reference } = await submitPurchase(browser, "Searchable tripod");
    await page.setViewportSize(MOBILE);
    await signInAs(page, PEOPLE.pat);
    await page.goto(`/expenses/all?q=${encodeURIComponent("Searchable tripod")}`);
    await expect(page.getByRole("link", { name: reference })).toBeVisible();
    await expectAxeClean(page);

    await page.setViewportSize(DESKTOP);
    await page.keyboard.press("/");
    await page.getByRole("combobox", { name: /Search budgets/ }).fill(reference);
    await expect(page.getByRole("option", { name: new RegExp(reference) })).toBeVisible();
  });

  test("6B.4 the accountant asks a question in the messages; the department sees it", async ({
    page,
    browser,
  }) => {
    const { id } = await submitPurchase(browser, "Message check");
    await page.setViewportSize(MOBILE);
    await signInAs(page, PEOPLE.pat);
    await page.goto(`/expenses/review/${id}`);
    const messages = page.getByRole("region", { name: "Messages" });
    await messages.getByLabel("Your message").fill("Which model is it? https://example.org/mic");
    await messages.getByRole("button", { name: "Send" }).click();
    await expect(messages.getByText("Which model is it?")).toBeVisible();
    await expect(messages.getByText("(example.org)")).toBeVisible();
    await expectAxeClean(page);

    const context = await browser.newContext({ viewport: DESKTOP });
    const sam = await context.newPage();
    await signInAs(sam, PEOPLE.sam);
    await sam.goto(`/expenses/${id}`);
    await expect(
      sam.getByRole("region", { name: "Messages" }).getByText("Which model is it?"),
    ).toBeVisible();
    await context.close();
  });
});
