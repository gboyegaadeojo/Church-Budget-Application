import { expect, test, type Browser, type Page } from "@playwright/test";
import { approveBoth, submitClaim, submitPurchase } from "../e2e/expense-helpers";
import { PEOPLE, signInAs } from "../e2e/helpers";

/*
 * Screenshots for docs/user-manual.md (Requirements Section 22). The fake server starts
 * with little in it, so this first does what people would: Media Team submits its FY2027
 * budget, Choir Team another, and Media submits three expenses at different stages. Then
 * it captures each page as a role sees it. Run `npm run screenshots` after a change to a
 * screen the manual shows, and commit the images.
 */

const DIR = "docs/images/manual";

async function settle(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running"),
  );
}

async function shoot(page: Page, name: string, path?: string) {
  if (path) await page.goto(path);
  await settle(page);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function as(browser: Browser, who: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signInAs(page, who);
  return { page, close: () => context.close() };
}

async function item(page: Page, n: number, name: string, quantity: string, price: string) {
  if (n > 1) await page.getByRole("button", { name: "Add item" }).click();
  const row = page.getByRole("group", { name: `Item ${n}` });
  await row.getByLabel("Item name").fill(name);
  await row.getByLabel("Quantity").fill(quantity);
  await row.getByLabel("Unit price (before tax)").fill(price);
}

/** A budget through details and items to submitted; returns its id. */
async function submitBudget(
  page: Page,
  department: string,
  title: string,
  items: [string, string, string][],
  shots: { items?: string } = {},
) {
  await page.goto("/annual/new");
  await page.getByRole("radio", { name: department, exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/annual\/[0-9a-f-]+\/edit$/);
  await page.getByLabel("Request title").fill(title);
  await page
    .getByLabel("Why are you requesting this budget?")
    .fill("Live-streaming every Sunday service and replacing worn-out equipment.");
  await page.getByRole("button", { name: "Next" }).click();
  for (const [i, [name, quantity, price]] of items.entries()) {
    await item(page, i + 1, name, quantity, price);
  }
  if (shots.items) await shoot(page, shots.items);
  await page.getByRole("button", { name: "Preview" }).click();
  await page.getByRole("button", { name: "Confirm submission" }).click();
  await page.getByRole("button", { name: "Submit request" }).click();
  await page.waitForURL(/\/annual\/[0-9a-f-]+\?done=submitted$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

test("User manual screenshots", async ({ browser }) => {
  test.setTimeout(300_000);

  // A department leader: the budget form, then their pages.
  const sam = await as(browser, PEOPLE.sam);
  const mediaId = await submitBudget(
    sam.page,
    "Media Team",
    "Media ministry 2027",
    [
      ["Wireless microphone kit", "2", "1025.00"],
      ["Streaming encoder", "1", "1899.00"],
      ["HDMI cables (25 ft)", "6", "34.50"],
    ],
    { items: "annual-items" },
  );

  const gina = await as(browser, PEOPLE.gina);
  await submitBudget(gina.page, "Choir Team", "Choir 2027", [
    ["Choir folders", "40", "18.00"],
    ["Sheet music licences", "1", "650.00"],
  ]);

  // Expenses at three stages: fully approved, waiting for the Board Chair, new.
  const approved = await submitPurchase(browser, "Replacement microphones", "450.00");
  await approveBoth(browser, approved.id);
  const claim = await submitClaim(browser, "Cables for the sound desk");
  const pat = await as(browser, PEOPLE.pat);
  await pat.page.goto(`/expenses/review/${claim.id}`);
  await pat.page.getByRole("button", { name: "Approve", exact: true }).click();
  await pat.page.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click();
  await pat.page.waitForURL(/\?done=waiting$/);
  await submitPurchase(browser, "Projector bulb", "289.00");

  await shoot(sam.page, "annual-my-budget", "/annual");
  await shoot(sam.page, "expense-new", "/expenses/new");
  await shoot(sam.page, "expenses-mine", "/expenses/mine");
  await shoot(sam.page, "spending-my-department", "/spending/my-department");
  await sam.close();

  // The accountant.
  await shoot(pat.page, "home-accountant", "/");
  await shoot(pat.page, "annual-review-dashboard", "/annual/review");
  await shoot(pat.page, "annual-review-request", `/annual/review/${mediaId}`);
  await shoot(pat.page, "expenses-review", "/expenses/review");
  await shoot(pat.page, "spending-dashboard", "/spending");
  await pat.close();

  // The Board Chair.
  const cleo = await as(browser, PEOPLE.cleo);
  await shoot(cleo.page, "expenses-board-approval", "/expenses/awaiting-approval");
  await cleo.close();

  // The Church Administrator and System Administrator (Gina holds every role).
  await shoot(gina.page, "expenses-ready-to-process", "/expenses/ready");
  await shoot(gina.page, "admin-users", "/admin/users");
  await gina.page.goto("/admin/departments");
  await gina.page.getByRole("link", { name: "Media Team", exact: true }).click();
  await shoot(gina.page, "admin-department");
  await gina.page.goto("/reports/analytics");
  await gina.page.getByRole("link", { name: "Overview", exact: true }).click();
  await shoot(gina.page, "analytics-overview");
  await gina.close();
});
