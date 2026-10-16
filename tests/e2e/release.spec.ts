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
 * Decision release (FR-19a, DRD 6.7b). The end-to-end tests share one database and one
 * open cycle with every other test running in parallel, so they never actually hold it:
 * holding would hold other tests' approvals. Hold, release, Release now and Cancel are
 * covered by tests/integration/annual-release.test.ts (AC-17 to AC-19).
 */

test.describe("Decision release (FR-19a)", () => {
  for (const [name, size] of [
    ["360 px", MOBILE],
    ["1440 px", DESKTOP],
  ] as const) {
    test(`the accountant sees how decisions go out, axe clean at ${name}`, async ({ page }) => {
      await page.setViewportSize(size);
      await signInAs(page, PEOPLE.pat);
      await page.goto("/annual/release");
      await expect(page.getByRole("heading", { level: 1, name: "Decision release" })).toBeVisible();
      const card = page.getByRole("region", { name: "Decision emails" });
      await expect(card.getByText("Send immediately", { exact: true })).toBeVisible();
      await expect(card.getByText("Decisions are sent as soon as you confirm them.")).toBeVisible();
      await expect(card.getByText("Undecided", { exact: true })).toBeVisible();
      await expect(page.getByText("No decisions are waiting to be released.")).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
    });
  }

  test("a release time in the past is refused, and nothing changes", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.pat);
    await page.goto("/annual/release");
    await page.getByLabel("Release date and time").fill("2020-01-01T09:00");
    await page.getByRole("button", { name: "Hold and release on a date" }).click();
    await expect(page.getByText("Choose a time in the future, or use Release now.")).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("region", { name: "Decision emails" }).getByText("Send immediately", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("the review dashboard links to it", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.pat);
    await page.goto("/annual/review");
    const card = page.getByRole("region", { name: "Decision emails" });
    await card.getByRole("link", { name: "Decision release" }).click();
    await expect(page).toHaveURL(/\/annual\/release\?cycle=/);
  });

  test("a department leader can't open it", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.sam);
    await page.goto("/annual/release");
    await expect(
      page.getByRole("heading", { level: 1, name: /You don't have access/ }),
    ).toBeVisible();
  });
});
