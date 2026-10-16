import { expect, type Browser, type Page } from "@playwright/test";
import { DESKTOP, PEOPLE, signInAs } from "./helpers";

/*
 * Shared steps for the expense tests (Stage 3). The fake server seeds a closed FY2026
 * cycle where Media Team's $30,000.00 budget is approved and released; Sam Lee (Media's
 * Backup) submits against it. Tests run in parallel against one database, so none of
 * them relies on Media's exact Remaining.
 */

export const EXP = /EXP-2026-\d{4}/;

export async function startExpense(page: Page, type: "Purchase request" | "Expense claim") {
  await page.goto("/expenses/new");
  await page.getByRole("radio", { name: new RegExp(`^${type}`) }).check({ force: true });
  await page.getByLabel("Department", { exact: true }).selectOption({ label: "Media Team" });
  await page.getByLabel("Budget year").selectOption({ label: "FY2026" });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/expenses\/[0-9a-f-]+\/edit$/);
}

export async function fillDetails(page: Page, title: string) {
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Why it's needed").fill("Two microphones have failed.");
}

export async function preview(page: Page) {
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
}

export async function confirm(page: Page) {
  await page.getByRole("button", { name: "Confirm submission" }).click();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.waitForURL(/\/expenses\/[0-9a-f-]+\?done=submitted$/);
  await expect(page.getByRole("heading", { name: "Expense submitted" })).toBeVisible();
}

/**
 * Sam submits a purchase request (1 × price, bought on the church account) in their own
 * browser; returns its id and reference.
 */
export async function submitPurchase(
  browser: Browser,
  title: string,
  price = "450.00",
): Promise<{ id: string; reference: string }> {
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();
  await signInAs(page, PEOPLE.sam);
  await startExpense(page, "Purchase request");
  await fillDetails(page, title);
  const item = page.getByRole("group", { name: "Item 1" });
  await item.getByLabel("Item", { exact: true }).fill("Microphone");
  await item.getByLabel("Unit price (before tax)").fill(price);
  await page.getByLabel("The Church Administrator buys it on the church account").check();
  if (await page.getByLabel("Over-budget explanation").isVisible()) {
    await page.getByLabel("Over-budget explanation").fill("Needed regardless.");
  }
  await preview(page);
  await confirm(page);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  const reference = (await page.getByText(EXP).first().textContent())!.match(EXP)![0];
  await context.close();
  return { id, reference };
}
