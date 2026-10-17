import { expect, test } from "@playwright/test";
import { DESKTOP, expectAxeClean, PEOPLE, signInAs } from "./helpers";

/* The expense workbook on Reports (Stage 3; FR-50, DRD 6.10). */

test("FR-50 the accountant downloads the expense workbook for FY2026", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signInAs(page, PEOPLE.pat);
  await page.goto("/reports");
  const card = page.getByRole("region", { name: "Expenses and payments" });
  await expect(card).toBeVisible();
  await card.getByLabel("Budget cycle").selectOption({ label: "FY2026 (Closed)" });
  await expectAxeClean(page);
  const download = page.waitForEvent("download");
  await card.getByRole("button", { name: "Download Excel" }).click();
  expect((await download).suggestedFilename()).toBe("Expenses_2026.xlsx");
});

test("a requester can't download the expense workbook", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signInAs(page, PEOPLE.sam);
  const response = await page.request.get(
    "/api/exports/expenses?cycle=00000000-0000-0000-0000-000000000000",
  );
  expect(response.status()).toBe(403);
});
