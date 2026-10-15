import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const MOBILE = { width: 360, height: 780 };
export const TABLET = { width: 820, height: 1180 };
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
  const { overflow, culprits } = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    // The outermost visible elements past the right edge, outside any scrolling region.
    const culprits = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.right <= width + 0.5) return false;
        for (let p = el.parentElement; p; p = p.parentElement) {
          if (["auto", "hidden", "scroll", "clip"].includes(getComputedStyle(p).overflowX)) {
            return false;
          }
        }
        return true;
      })
      .slice(0, 5)
      .map(
        (el) =>
          `<${el.tagName.toLowerCase()} class="${el.className}"> ${el.textContent?.slice(0, 60)}`,
      );
    return { overflow: document.documentElement.scrollWidth - width, culprits };
  });
  expect(overflow, `Wider than the screen:\n${culprits.join("\n")}`).toBeLessThanOrEqual(0);
}

export async function expectAxeClean(page: Page) {
  // Measure settled colours, not text halfway through a fade-in.
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running"),
  );
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}
