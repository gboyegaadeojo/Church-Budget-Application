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
 * Guided tours (decided 2026-11-12): the first-time offer, and walking the real annual
 * budget and new expense forms with the tour card. Tests run in parallel against one
 * database, so each person's tour answers are only changed here.
 */

const card = (page: Page) => page.getByRole("dialog", { name: /^Guided tour/ });

async function expectStep(page: Page, title: string) {
  await expect(card(page).getByRole("heading", { name: title })).toBeVisible();
}

test.describe("Guided tours", () => {
  test("the first-time offer shows until Not now, then Show me how stays", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.ada);
    await page.goto("/annual/new");
    const offer = page.getByRole("region", { name: "Let us show you how to send your budget" });
    await expect(offer).toBeVisible();
    await expectAxeClean(page);
    await offer.getByRole("button", { name: "Not now" }).click();
    await expect(offer).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Start a budget request" })).toBeVisible();
    await expect(offer).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Show me how" })).toBeVisible();
  });

  test("the annual budget tour follows the real form from Help", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.gina);
    await page.goto("/help");
    const tours = page.getByRole("region", { name: "Guided tours" });
    await tours
      .getByRole("listitem")
      .filter({ hasText: "Your first annual budget" })
      .getByRole("button")
      .click();

    await page.waitForURL(/\/annual\/new$/);
    await expectStep(page, "Pick your department");
    await expect(card(page).getByText("Step 1 of 8")).toBeVisible();
    await expect(card(page).getByRole("heading")).toBeFocused();
    await expectAxeClean(page);

    await page.getByRole("radio", { name: "Other (type your department)" }).check();
    await page.getByLabel("Department name").fill(`Tour Ministry ${Date.now()}`);
    await card(page).getByRole("button", { name: "Next" }).click();
    await expectStep(page, "Press Continue");

    // Pressing the lit-up button is the step: the tour follows the form to its next page.
    await page.locator('[data-tour="annual-continue"] button').click();
    await page.waitForURL(/\/annual\/[0-9a-f-]+\/edit$/);
    await expectStep(page, "Give it a title and say why");
    await expect(card(page).getByText("Step 3 of 8")).toBeVisible();
    await expectAxeClean(page);

    await page.getByLabel("Request title").fill("Tour budget");
    await card(page).getByRole("button", { name: "Next" }).click();
    await expectStep(page, "Press Next");
    await page.locator('[data-tour="annual-next"]').click();
    await expectStep(page, "One line per item");

    await card(page).getByRole("button", { name: "End tour" }).click();
    await expect(card(page)).toHaveCount(0);
    // The draft is the person's own: the tour saved nothing of its own.
    await expect(page.getByRole("heading", { name: "Budget items" })).toBeVisible();
  });

  test("the new expense tour on a phone, skipping to Finish", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await signInAs(page, PEOPLE.sam);
    await page.goto("/expenses/new");
    await page.getByRole("button", { name: "Show me how" }).first().click();

    await expectStep(page, "Before or after you buy?");
    await expect(card(page)).toBeInViewport();
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    const purchase = page.getByRole("radio", { name: /^Purchase request/ });
    await page.locator("label").filter({ has: purchase }).click();
    await expect(purchase).toBeChecked();
    await page.getByLabel("Department", { exact: true }).selectOption({ label: "Media Team" });
    await page.getByLabel("Budget year").selectOption({ label: "FY2026" });
    await card(page).getByRole("button", { name: "Next" }).click();
    await expectStep(page, "Which budget pays?");
    await card(page).getByRole("button", { name: "Next" }).click();
    await expectStep(page, "Press Continue");
    await page.locator('[data-tour="expense-continue"] button').click();
    await page.waitForURL(/\/expenses\/[0-9a-f-]+\/edit$/);

    await expectStep(page, "See what's left");
    await expect(card(page)).toBeInViewport();
    await expectNoHorizontalScroll(page);
    await card(page).getByRole("button", { name: "Next" }).click();
    await expectStep(page, "One question at a time");
    await card(page).getByRole("button", { name: "Back" }).click();
    await expectStep(page, "See what's left");
    await card(page).getByRole("button", { name: "Next" }).click();
    await card(page).getByRole("button", { name: "Next" }).click();
    await expectStep(page, "Press Next");

    await page.getByLabel("Title", { exact: true }).fill("Tour cables");
    await page.getByLabel("Why it's needed").fill("Two cables have failed.");
    await page.locator('[data-tour="expense-next"]').click();
    await expectStep(page, "Sales tax: on or off");
    await expect(page.getByRole("switch", { name: "Add 12% sales tax" })).toBeVisible();

    await card(page).getByRole("button", { name: "Next" }).click();
    await expectStep(page, "Check and send");
    await expect(card(page).getByText(/This tip comes back on the last step/)).toBeVisible();
    await card(page).getByRole("button", { name: "Finish" }).click();
    await expect(card(page)).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Tour finished" })).toBeVisible();

    await page.goto("/help");
    await expect(
      page
        .getByRole("region", { name: "Guided tours" })
        .getByRole("listitem")
        .filter({ hasText: "A new expense" })
        .getByText("Finished"),
    ).toBeVisible();
  });
});
