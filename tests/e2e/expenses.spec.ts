import { expect, test } from "@playwright/test";
import { confirm, EXP, fillDetails, preview, startExpense } from "./expense-helpers";
import {
  DESKTOP,
  expectAxeClean,
  expectNoHorizontalScroll,
  MOBILE,
  PEOPLE,
  signInAs,
} from "./helpers";

/* Expense submissions, the requester's side (Stage 3; 6B.3, DRD 6.9a). */

test.describe("Expense submissions (Stage 3)", () => {
  test("AC-65 AC-115 purchase request: 2 × $450.00 = $1,008.00 incl. tax", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.sam);
    await startExpense(page, "Purchase request");
    await expect(page.getByRole("region", { name: "Budget: Media Team" })).toBeVisible();
    await expectAxeClean(page);

    await fillDetails(page, "Wireless microphones");
    const item = page.getByRole("group", { name: "Item 1" });
    await item.getByLabel("Item", { exact: true }).fill("Microphone");
    await item.getByLabel("Qty").fill("2");
    await item.getByLabel("Unit price (before tax)").fill("450.00");
    const summary = page.getByRole("complementary", { name: "Summary" });
    await expect(summary.getByText("$900.00")).toBeVisible();
    await expect(summary.getByText("$108.00")).toBeVisible();
    await expect(summary.getByText("$1,008.00")).toBeVisible();

    // AC-115: How it will be bought is required.
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByText("Choose how this will be bought.")).toBeVisible();
    await page.getByLabel("The Church Administrator buys it on the church account").check();
    await preview(page);
    await expectAxeClean(page);
    await confirm(page);
    await expect(page.getByText(EXP).first()).toBeVisible();
    await expect(page.getByText("Submitted", { exact: true }).first()).toBeVisible();
    await expectAxeClean(page);

    // AC-71: editable while it waits for the accountant.
    await expect(page.getByRole("link", { name: "Edit" })).toBeVisible();
    await page.goto("/expenses/mine");
    await expect(page.getByRole("link", { name: EXP }).first()).toBeVisible();
    await expectAxeClean(page);
  });

  test("AC-68 expense claim: $112.00 + $56.00 = $168.00 with no tax", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await signInAs(page, PEOPLE.sam);
    await startExpense(page, "Expense claim");
    await fillDetails(page, "Cables and tape");
    const first = page.getByRole("group", { name: "Receipt line 1" });
    await first.getByLabel("Date").fill("2026-10-01");
    await first.getByLabel("Vendor").fill("Long & McQuade");
    await first.getByLabel("Description").fill("XLR cables");
    await first.getByLabel("Amount paid (incl. tax)").fill("112.00");
    await page.getByRole("button", { name: "Add receipt line" }).click();
    const second = page.getByRole("group", { name: "Receipt line 2" });
    await second.getByLabel("Date").fill("2026-10-02");
    await second.getByLabel("Vendor").fill("Staples");
    await second.getByLabel("Description").fill("Gaffer tape");
    await second.getByLabel("Amount paid (incl. tax)").fill("56.00");
    await page.getByLabel("Cheque", { exact: true }).check();
    await page.getByLabel("No receipt available").check();
    await page.getByLabel("Why there's no receipt").fill("Paper receipts, handed to the office.");
    await expect(page.getByText("$168.00").first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    await preview(page);
    await expect(page.getByText("Sales tax")).toHaveCount(0);
    await confirm(page);
    await expect(page.getByText("$168.00").first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("AC-70 over budget: warned, explanation required, still submitted", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.sam);
    await startExpense(page, "Purchase request");
    await fillDetails(page, "New sound desk");
    const item = page.getByRole("group", { name: "Item 1" });
    await item.getByLabel("Item", { exact: true }).fill("Digital mixer");
    await item.getByLabel("Qty").fill("1");
    await item.getByLabel("Unit price (before tax)").fill("40000.00");
    await expect(page.getByText(/This takes Media Team over budget by \$/)).toBeVisible();
    await expect(page.getByText(/Over budget by \$/).first()).toBeVisible();
    await page.getByLabel("The supplier will invoice the church").check();

    await page.getByRole("button", { name: "Preview" }).click();
    await expect(
      page.getByText("Explain why this is needed even though it takes the department over budget."),
    ).toBeVisible();
    await page.getByLabel("Over-budget explanation").fill("The old desk failed; the board agreed.");
    await preview(page);
    await confirm(page);
    await expect(page.getByText(/This takes Media Team over budget by \$/).first()).toBeVisible();
    await expect(page.getByText("The old desk failed; the board agreed.")).toBeVisible();
  });

  test("withdraws a submitted expense (FR-44)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.sam);
    await startExpense(page, "Purchase request");
    await fillDetails(page, "Spare batteries");
    const item = page.getByRole("group", { name: "Item 1" });
    await item.getByLabel("Item", { exact: true }).fill("AA batteries");
    await item.getByLabel("Unit price (before tax)").fill("20.00");
    await page.getByLabel("I'll buy it and submit a claim").check();
    await preview(page);
    await confirm(page);
    await page.getByRole("button", { name: "Withdraw" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Withdraw" }).click();
    await page.waitForURL(/\?done=withdrawn$/);
    await expect(page.getByRole("heading", { name: "Expense withdrawn" })).toBeVisible();
  });

  test("AC-81 receipts: upload a photo, refuse other types, view it", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.sam);
    await startExpense(page, "Expense claim");
    await fillDetails(page, "Batteries");
    const line = page.getByRole("group", { name: "Receipt line 1" });
    await line.getByLabel("Date").fill("2026-10-05");
    await line.getByLabel("Vendor").fill("Costco");
    await line.getByLabel("Description").fill("AA batteries");
    await line.getByLabel("Amount paid (incl. tax)").fill("22.40");
    await page.getByLabel("Cheque", { exact: true }).check();

    // A file that isn't a JPG, PNG, HEIC or PDF is refused before upload.
    await page.getByLabel("Choose file").setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not a receipt"),
    });
    await expect(page.getByText("Add a JPG, PNG, HEIC photo or a PDF.")).toBeVisible();

    // A JPG uploads straight to storage and is checked by the server.
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0]);
    await page.getByLabel("Choose file").setInputFiles({
      name: "costco.jpg",
      mimeType: "image/jpeg",
      buffer: jpeg,
    });
    await expect(page.getByText("costco.jpg added.")).toBeVisible();
    await expect(page.getByRole("link", { name: "View costco.jpg" })).toBeVisible();
    await expectAxeClean(page);

    await preview(page);
    await confirm(page);
    const link = page.getByRole("link", { name: "costco.jpg" });
    await expect(link).toBeVisible();
    const response = await page.request.get((await link.getAttribute("href"))!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/jpeg");
  });
});
