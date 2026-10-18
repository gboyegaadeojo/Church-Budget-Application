import { expect, test } from "@playwright/test";
import {
  DESKTOP,
  expectAxeClean,
  expectNoHorizontalScroll,
  MOBILE,
  PEOPLE,
  signInAs,
} from "./helpers";

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
    await page.getByLabel("Budget cycle", { exact: true }).selectOption({ label: "FY2026" });
    await page.getByLabel("Search payee, description or reference").fill(payee);
    await page.getByRole("button", { name: "Apply" }).click();
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

  test("DRD 6.8 Record spending shows Remaining before and after as the amount is typed", async ({
    page,
  }) => {
    await signInAs(page, PEOPLE.gina);
    await page.goto("/spending/record");
    await page.getByLabel("Budget year", { exact: true }).selectOption({ label: "FY2026" });
    await page.getByLabel("Department", { exact: true }).selectOption({ label: "Media Team" });
    await page.getByRole("button", { name: "Continue" }).click();
    const preview = page.getByText("Remaining:").locator("..");
    await expect(preview).toBeVisible();
    await page.getByLabel("Amount paid (incl. tax)").fill("999,999.00");
    await expect(preview.getByText(/Over budget by \$/)).toBeVisible();
    await page.getByLabel("Type").selectOption({ label: "Refund" });
    await expect(preview.getByText(/Over budget by/)).toHaveCount(0);
    await expectAxeClean(page);
  });

  test("AC-88 a department leader can't record spending", async ({ page }) => {
    await signInAs(page, PEOPLE.sam);
    await page.goto("/spending/record");
    await expect(
      page.getByRole("heading", { name: "You don't have access to this page" }),
    ).toBeVisible();
  });

  test("FR-26 the dashboard shows each department, axe clean at 360 and 1440 px", async ({
    page,
  }) => {
    await signInAs(page, PEOPLE.pat);
    for (const size of [MOBILE, DESKTOP]) {
      await page.setViewportSize(size);
      await page.goto("/spending");
      await page.getByLabel("Budget year", { exact: true }).selectOption({ label: "FY2026" });
      await page.getByRole("button", { name: "Show" }).click();
      // The year is chosen with a GET form: wait for that page before looking.
      await page.waitForURL(/[?&]cycle=/);
      await expect(page.getByRole("link", { name: "Media Team", exact: true })).toBeVisible();
      await expectAxeClean(page);
    }
    await page.getByRole("link", { name: "Media Team", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Media Team · FY2026" })).toBeVisible();
    // The accountant can amend; amending is covered by integration tests (AC-84).
    await expect(page.getByRole("button", { name: "Amend budget" })).toBeVisible();
    await expectAxeClean(page);
  });

  test("AC-89 a leader sees their own department's budget, axe clean at 360 and 1440 px", async ({
    page,
  }) => {
    await signInAs(page, PEOPLE.sam);
    for (const size of [MOBILE, DESKTOP]) {
      await page.setViewportSize(size);
      await page.goto("/spending/my-department");
      await expect(
        page.getByRole("heading", { level: 1, name: "My department's spending" }),
      ).toBeVisible();
      await page.getByLabel("Budget year", { exact: true }).selectOption({ label: "FY2026" });
      await page.getByRole("button", { name: "Show" }).click();
      const panel = page.getByRole("region", { name: "Media Team budget" });
      await expect(panel.getByText("$30,000.00").first()).toBeVisible();
      await expect(panel.getByText("Remaining", { exact: true })).toBeVisible();
      // Payment method and reference numbers aren't shown to requesters.
      await expect(panel.getByRole("columnheader", { name: "Method" })).toHaveCount(0);
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
    }
    // Other tests make Sam a leader of more departments, so the integration test checks
    // that no other department's spending is shown (AC-89). Sam can't open the dashboard.
    await page.goto("/spending");
    await expect(
      page.getByRole("heading", { name: "You don't have access to this page" }),
    ).toBeVisible();
  });

  // Locking would stop other tests recording FY2026 spending, so the lock, reopen and
  // carry-over are covered by integration tests (AC-90, FR-46).
  test("FR-29 the accountant opens Year-end, axe clean at 360 and 1440 px", async ({ page }) => {
    await signInAs(page, PEOPLE.pat);
    await page.goto("/spending");
    await page.getByLabel("Budget year", { exact: true }).selectOption({ label: "FY2026" });
    await page.getByRole("button", { name: "Show" }).click();
    await page.getByRole("link", { name: "Year-end" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Year-end · FY2026" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Before you lock" })).toBeVisible();
    for (const size of [MOBILE, DESKTOP]) {
      await page.setViewportSize(size);
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
    }
  });

  test("FR-29 only the accountant opens Year-end", async ({ page }) => {
    await signInAs(page, PEOPLE.cleo);
    await page.goto("/spending/year-end");
    await expect(
      page.getByRole("heading", { name: "You don't have access to this page" }),
    ).toBeVisible();
  });

  test("the Board Chair reads Budget vs actual without changing anything", async ({ page }) => {
    await signInAs(page, PEOPLE.cleo);
    await page.goto("/spending/budget-vs-actual");
    await expect(page.getByRole("heading", { name: "Budget vs actual" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Record spending" })).toHaveCount(0);
    await expectAxeClean(page);
  });
});

test.describe("Spending export (Stage 4)", () => {
  test("AC-91 the Church Administrator downloads the spending workbook for FY2026", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.gina);
    await page.goto("/reports");
    const card = page.getByRole("region", { name: "Spending and budget vs actual" });
    await expect(card).toBeVisible();
    await card
      .getByLabel("Budget cycle", { exact: true })
      .selectOption({ label: "FY2026 (Closed)" });
    await expectAxeClean(page);
    const download = page.waitForEvent("download");
    await card.getByRole("button", { name: "Download Excel" }).click();
    expect((await download).suggestedFilename()).toBe("Spending_2026.xlsx");
  });

  test("the accountant exports from the Spending dashboard; a requester can't", async ({
    page,
    browser,
  }) => {
    await signInAs(page, PEOPLE.pat);
    await page.goto("/spending");
    await page.getByLabel("Budget year", { exact: true }).selectOption({ label: "FY2026" });
    await page.getByRole("button", { name: "Show" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export to Excel" }).click();
    expect((await download).suggestedFilename()).toBe("Spending_2026.xlsx");

    const other = await browser.newContext();
    const sam = await other.newPage();
    await signInAs(sam, PEOPLE.sam);
    const response = await sam.request.get(
      "/api/exports/spending?cycle=00000000-0000-0000-0000-000000000000",
    );
    expect(response.status()).toBe(403);
    await other.close();
  });
});
