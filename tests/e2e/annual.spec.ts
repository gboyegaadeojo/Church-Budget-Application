import { expect, test, type Page } from "@playwright/test";
import {
  DESKTOP,
  expectAxeClean,
  expectNoHorizontalScroll,
  MOBILE,
  PEOPLE,
  signInAs,
} from "./helpers";

/*
 * The requester's annual budget form (Stage 1 step 5; DRD 6.2 to 6.5). The fake server
 * seeds an open FY2027 cycle at 12% tax. Tests run in parallel against one database, so
 * each one uses its own department.
 */

const IFC = /IFC-2027-\d{4}/;

async function startBudget(page: Page, department: string) {
  await page.goto("/annual/new");
  await page.getByRole("radio", { name: department, exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/annual\/[0-9a-f-]+\/edit$/);
}

async function fillDetails(page: Page, title: string) {
  await page.getByLabel("Request title").fill(title);
  await page.getByLabel("Why are you requesting this budget?").fill("Line one\nLine two");
}

async function fillItem(
  page: Page,
  n: number,
  item: { name: string; quantity: string; price: string; link?: string; notes?: string },
) {
  const row = page.getByRole("group", { name: `Item ${n}` });
  await row.getByLabel("Item name").fill(item.name);
  await row.getByLabel("Quantity").fill(item.quantity);
  await row.getByLabel("Unit price (before tax)").fill(item.price);
  if (item.link) await row.getByLabel("Product link").fill(item.link);
  if (item.notes) await row.getByLabel("Notes").fill(item.notes);
}

/** A whole draft → items → preview → submit; returns the request's page URL. */
async function submitBudget(page: Page, department: string) {
  await startBudget(page, department);
  await fillDetails(page, `${department} 2027`);
  await page.getByRole("button", { name: "Next" }).click();
  await fillItem(page, 1, { name: "Microphone", quantity: "1", price: "1025.00" });
  await page.getByRole("button", { name: "Preview" }).click();
  await page.getByRole("button", { name: "Confirm submission" }).click();
  await page.getByRole("button", { name: "Submit request" }).click();
  await page.waitForURL(/\/annual\/[0-9a-f-]+\?done=submitted$/);
  return page.url().replace(/\?.*$/, "");
}

async function reviseQuantity(page: Page, quantity: string) {
  await page.getByRole("link", { name: "Edit request" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("group", { name: "Item 1" }).getByLabel("Quantity").fill(quantity);
  await page.getByRole("button", { name: "Preview" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("button", { name: "Use 1 edit and save" }).click();
  await page.waitForURL(/\?done=revised$/);
  await expect(page.getByRole("heading", { name: "Changes saved" })).toBeVisible();
}

test.describe("Annual budget form (Stage 1 step 5)", () => {
  test("AC-20 AC-21 AC-26 AC-28 AC-29 AC-30 AC-31 AC-37 draft, items, preview, submit", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.gina);
    await page.goto("/annual");
    await expect(page.getByText("FY2027 is open for submissions.")).toBeVisible();
    await page.getByRole("link", { name: "Submit annual budget" }).click();

    // Step 1: the department list has the person's own first and Other last (AC-13).
    const radios = page.getByRole("radio");
    await expect(radios.first()).toHaveAccessibleName(/Media Team/);
    await expect(radios.last()).toHaveAccessibleName("Other (type your department)");
    await page.getByRole("radio", { name: "Drama Team", exact: true }).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/\/edit$/);

    // AC-20 / AC-21: the draft autosaves and is there after a reload.
    await fillDetails(page, "Drama Team 2027");
    const summary = page.getByRole("complementary", { name: "Financial summary" });
    await expect(summary.getByText("Saved just now")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Request title")).toHaveValue("Drama Team 2027");

    // AC-26 / AC-31: totals update as quantities and prices change; tax once on the subtotal.
    await page.getByRole("button", { name: "Next" }).click();
    await fillItem(page, 1, {
      name: "Stage lights",
      quantity: "2",
      price: "500.00",
      link: "https://shop.example.com/lights",
    });
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page.getByRole("group", { name: "Item 2" }).getByLabel("Item name")).toBeFocused();
    await fillItem(page, 2, { name: "Gaffer tape", quantity: "1", price: "25" });
    await expect(summary.getByText("$1,025.00")).toBeVisible();
    await expect(summary.getByText("$123.00")).toBeVisible();
    await expect(summary.getByText("$1,148.00")).toBeVisible();
    await page.getByRole("group", { name: "Item 1" }).getByLabel("Quantity").fill("1");
    await expect(summary.getByText("$525.00")).toBeVisible();
    await page.getByRole("group", { name: "Item 1" }).getByLabel("Quantity").fill("2");

    // Move up / Move down reorder without a mouse drag.
    await page.getByRole("button", { name: "Move item 2 up" }).click();
    await expect(page.getByRole("group", { name: "Item 1" }).getByLabel("Item name")).toHaveValue(
      "Gaffer tape",
    );

    // AC-28: the preview shows every item, its link's domain, and the summary.
    await page.getByRole("button", { name: "Preview" }).click();
    const preview = page.getByRole("article");
    await expect(preview.getByRole("heading", { name: "Drama Team 2027" })).toBeVisible();
    await expect(preview.getByText("Stage lights")).toBeVisible();
    await expect(preview.getByText("Gaffer tape")).toBeVisible();
    await expect(preview.getByRole("link", { name: "shop.example.com" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    await expect(preview.getByText("Sales tax (12%)")).toBeVisible();
    await expect(preview.getByText("$1,148.00")).toBeVisible();

    // AC-29: nothing is sent until the confirmation is accepted.
    await page.getByRole("button", { name: "Confirm submission" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Submit $1,148.00?" });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page).toHaveURL(/\/edit$/);
    await page.getByRole("button", { name: "Confirm submission" }).click();
    await dialog.getByRole("button", { name: "Submit request" }).click();

    // AC-37: one reference; the confirmation states the total and remaining edits.
    await page.waitForURL(/\?done=submitted$/);
    await expect(page.getByRole("heading", { name: "Request submitted" })).toBeVisible();
    await expect(page.getByText(IFC)).toHaveCount(2);
    await expect(page.getByText("You can make 2 changes before it's reviewed.")).toBeVisible();
    await expect(page.getByText("We'll email your receipt shortly.")).toBeVisible();

    await page.goto("/annual");
    const mine = page.getByRole("table", { name: "My budget requests" });
    await expect(mine.getByRole("link", { name: "Drama Team 2027" })).toHaveCount(1);
    const row = mine.getByRole("row", { name: /Drama Team 2027/ });
    await expect(row.getByText("$1,148.00")).toBeVisible();
    await expect(row.getByText("2 of 2 edits left")).toBeVisible();
  });

  test("AC-23 AC-24 missing and invalid values are shown next to their fields", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.gina);
    await startBudget(page, "Transportation Team");

    await page.getByRole("button", { name: "Next" }).click();
    const row = page.getByRole("group", { name: "Item 1" });
    await row.getByLabel("Item name").fill("Bus rental");
    await row.getByLabel("Quantity").fill("1.5");
    await row.getByLabel("Unit price (before tax)").fill("-20");
    await row.getByLabel("Product link").fill("ftp://example.com/bus");
    await page.getByRole("button", { name: "Preview" }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: "Check the highlighted fields." }),
    ).toBeVisible();
    await expect(row.getByText("Enter a whole number from 1 to 10,000.")).toBeVisible();
    await expect(row.getByText(/Enter a price before tax/)).toBeVisible();
    await expect(
      row.getByText("Enter a web address starting with http:// or https://."),
    ).toBeVisible();
    await expect(row.getByLabel("Quantity")).toHaveAttribute("aria-invalid", "true");

    // Fixed formats, but no title, justification or note on a $0.00 item (AC-23, rule 8).
    await row.getByLabel("Quantity").fill("1");
    await row.getByLabel("Unit price (before tax)").fill("0");
    await row.getByLabel("Product link").fill("");
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByRole("heading", { name: "Request information" })).toBeFocused();
    await expect(page.getByText("Give the request a title.")).toBeVisible();
    await expect(page.getByText("Explain what the budget is for.")).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(row.getByText("Explain a $0.00 item in its notes.")).toBeVisible();
  });

  test("AC-41 AC-42 AC-45 AC-60 two leaders share two edits", async ({ page, browser }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.gina);
    const url = await submitBudget(page, "Evangelism Team");

    // Sam picks the same department and is offered the existing request (FR-32).
    const samContext = await browser.newContext({ viewport: DESKTOP });
    const sam = await samContext.newPage();
    await signInAs(sam, PEOPLE.sam);
    await sam.goto("/annual/new");
    await sam.getByRole("radio", { name: "Evangelism Team", exact: true }).check();
    await expect(
      sam.getByText("Evangelism Team already has a budget started by Gina Admin."),
    ).toBeVisible();
    await sam.getByRole("button", { name: "Open it" }).click();
    await sam.waitForURL(url);
    await expect(sam.getByText("2 of 2 edits left for this request")).toBeVisible();
    await reviseQuantity(sam, "2");
    await expect(sam.getByText("You can make 1 change before it's reviewed.")).toBeVisible();
    await samContext.close();

    // Gina sees the shared count, uses the last edit, and then can't edit again.
    await page.goto(url);
    await expect(page.getByText("1 of 2 edits left for this request")).toBeVisible();
    await expect(page.getByText("$2,296.00")).toBeVisible();
    await reviseQuantity(page, "3");
    await expect(page.getByText("No changes are left before it's reviewed.")).toBeVisible();
    await expect(page.getByText(/No edits left/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit request" })).toHaveCount(0);
    await page.goto(`${url}/edit`);
    await expect(page).toHaveURL(url);
  });

  test("a populated item asks before it's removed, and a draft can be deleted", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.gina);
    await startBudget(page, "Ushering Team");
    await page.getByRole("button", { name: "Next" }).click();
    await fillItem(page, 1, { name: "Name badges", quantity: "20", price: "3.50" });

    await page.getByRole("button", { name: "Remove item 1" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Remove Name badges?" });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("group", { name: "Item 1" })).toBeVisible();
    await page.getByRole("button", { name: "Remove item 1" }).click();
    await dialog.getByRole("button", { name: "Remove item" }).click();
    await expect(page.getByRole("group", { name: "Item 1" })).toHaveCount(0);

    await page.getByRole("button", { name: "Delete draft" }).click();
    await page
      .getByRole("alertdialog", { name: "Delete this draft?" })
      .getByRole("button", { name: "Delete draft" })
      .click();
    await page.waitForURL(/\/annual$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "My department budget" }),
    ).toBeVisible();
    await expect(page.getByText("Ushering Team").filter({ visible: true })).toHaveCount(0);
  });

  test("AC-14 Other suggests a close match before creating a proposed department", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.gina);
    await page.goto("/annual/new");
    await page.getByRole("radio", { name: "Other (type your department)" }).check();
    await page.getByLabel("Department name").fill("Choir Teem");
    await page.getByRole("button", { name: "Use Choir Team" }).click();
    await expect(page.getByRole("radio", { name: "Choir Team", exact: true })).toBeChecked();

    await page.getByRole("radio", { name: "Other (type your department)" }).check();
    await page.getByLabel("Department name").fill("Hospitality Team");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/\/edit$/);
    await expect(page.getByText("New department, waiting for administrator")).toBeVisible();

    // FR-37: the draft is waiting on Home.
    await page.goto("/");
    await expect(page.getByText("Finish and submit your budget").first()).toBeVisible();
  });

  test("AC-103 keyboard only: details, items and submit", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.gina);
    await startBudget(page, "Visitation Team");
    await fillDetails(page, "Visitation Team 2027");
    await page.getByRole("button", { name: "Next" }).focus();
    await page.keyboard.press("Enter");

    // Enter in the last row adds a row and moves focus to its item name.
    const first = page.getByRole("group", { name: "Item 1" });
    await first.getByLabel("Item name").fill("Gift bags");
    await first.getByLabel("Quantity").fill("10");
    await first.getByLabel("Unit price (before tax)").fill("4.00");
    await first.getByLabel("Unit price (before tax)").press("Enter");
    await expect(page.getByRole("group", { name: "Item 2" }).getByLabel("Item name")).toBeFocused();

    await page.getByRole("button", { name: "Preview" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Confirm submission" }).focus();
    await page.keyboard.press("Enter");
    // The dialog opens on Cancel, the safe choice; Tab reaches the confirm button.
    await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Submit request" })).toBeFocused();
    await page.keyboard.press("Enter");
    await page.waitForURL(/\?done=submitted$/);
    await expect(page.getByText("$44.80")).toHaveCount(2);
  });

  for (const [label, viewport] of [
    ["360 px", MOBILE],
    ["1440 px", DESKTOP],
  ] as const) {
    test(`AC-103 annual screens are axe clean with no sideways scroll at ${label}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await signInAs(page, PEOPLE.gina);
      const department = label === "360 px" ? "Decoration Team" : "Drama Team";
      const check = async (heading: string | RegExp) => {
        await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
        await expectNoHorizontalScroll(page);
        await expectAxeClean(page);
      };

      await page.goto("/annual");
      await check("My department budget");
      await page.goto("/annual/new");
      await check("Start a budget request");
      if (label === "360 px") {
        await startBudget(page, department);
        await check(/Budget request/);
        await fillDetails(page, "Decoration 2027");
        await page.getByRole("button", { name: "Next" }).click();
        await fillItem(page, 1, {
          name: "Flowers",
          quantity: "4",
          price: "12.50",
          notes: "Easter",
        });
        await expectNoHorizontalScroll(page);
        await expectAxeClean(page);
        await page.getByRole("button", { name: "Show breakdown" }).click();
        // The desktop panel is hidden at this width; the bar shows the breakdown.
        await expect(page.getByText("Sales tax (12%)").filter({ visible: true })).toHaveCount(1);
        await page.getByRole("button", { name: "Preview" }).click();
        await expectNoHorizontalScroll(page);
        await expectAxeClean(page);
        await page.getByRole("button", { name: "Confirm submission" }).click();
        await page.getByRole("button", { name: "Submit request" }).click();
        await page.waitForURL(/\?done=submitted$/);
        await check("Decoration 2027");
      }
    });
  }

  test("a person without the requester role is refused the form", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.pat);
    await page.goto("/annual/new");
    await expect(
      page.getByRole("heading", { name: "You don't have access to this page" }),
    ).toBeVisible();
    await expect(page.getByText(/submitted by department leaders/)).toBeVisible();
  });
});
