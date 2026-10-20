import { expect, test } from "@playwright/test";
import { submitPurchase } from "./expense-helpers";
import {
  DESKTOP,
  expectAxeClean,
  expectNoHorizontalScroll,
  MOBILE,
  PEOPLE,
  signInAs,
  TABLET,
} from "./helpers";

/* In-app notifications: the bell (docs/decisions.md 2026-10-19). */

test.describe("Notifications", () => {
  test("the Board Chair sees a new expense on the bell, opens it, and it's marked read", async ({
    page,
    browser,
  }) => {
    const { id } = await submitPurchase(browser, "Bell test cables");
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.cleo);

    const bell = page.getByRole("button", { name: /^Notifications, \d+ unread$/ });
    await expect(bell).toBeVisible();
    await bell.click();
    const panel = page.getByRole("dialog", { name: "Notifications" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button", { name: "Needs action" })).toBeVisible();
    await expectAxeClean(page);
    await panel.getByRole("link", { name: "See all notifications" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();

    const row = page.locator(`main a[href*="${id}"]`).first();
    await expect(row).toContainText("Unread:");
    await expect(row).toContainText("An expense needs your approval");
    await row.click();
    await expect(page).toHaveURL(new RegExp(id));

    await page.goto("/notifications");
    await expect(page.locator(`main a[href*="${id}"]`).first()).not.toContainText("Unread:");
  });

  test("on a phone the bell opens the Notifications page, with filters", async ({
    page,
    browser,
  }) => {
    const { id } = await submitPurchase(browser, "Bell test phone");
    await page.setViewportSize(MOBILE);
    await signInAs(page, PEOPLE.sam);
    await page.getByRole("link", { name: /^Notifications/ }).click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
    await expect(page.locator(`main a[href*="${id}"]`).first()).toContainText(
      "Your expense was submitted",
    );
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    const filters = page.getByRole("navigation", { name: "Show" });
    await filters.getByRole("link", { name: /^Expenses \d+$/ }).click();
    await expect(page).toHaveURL(/filter=expenses/);
    await expect(page.locator(`main a[href*="${id}"]`).first()).toBeVisible();

    await page.getByRole("button", { name: "Mark all as read" }).click();
    await expect(page.locator(`main a[href*="${id}"]`).first()).not.toContainText("Unread:");
  });

  for (const [label, viewport] of [
    ["360 px", MOBILE],
    ["820 px", TABLET],
    ["1440 px", DESKTOP],
  ] as const) {
    test(`the Notifications page is axe clean with no sideways scroll at ${label}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await signInAs(page, PEOPLE.gina);
      await page.goto("/notifications");
      await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
      if (viewport !== MOBILE) {
        await page.getByRole("button", { name: /^Notifications/ }).click();
        await expect(page.getByRole("dialog", { name: "Notifications" })).toBeVisible();
        await expectNoHorizontalScroll(page);
        await expectAxeClean(page);
      }
    });
  }
});
