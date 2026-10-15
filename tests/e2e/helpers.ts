import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const MOBILE = { width: 360, height: 780 };
export const DESKTOP = { width: 1440, height: 900 };

/** People in tests/fixtures/fake-identities.json, by the start of their label. */
export const PEOPLE = {
  gina: "Gina Admin",
  sam: "Sam Lee",
  ada: "Ada Obi",
  jo: "Jo Member",
  kim: "Kim Former",
  stranger: "Stranger",
  pat: "Accountant Pat",
} as const;

/** Signs in through the real Auth.js flow with the fake provider (test-only). */
export async function signInAs(page: Page, who: string, path = "/sign-in") {
  await page.goto(path);
  await page.getByRole("button", { name: new RegExp(`^Sign in as ${who}`) }).click();
  // Wait for the sign-in round trip to finish before the test navigates anywhere else.
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

export async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}
