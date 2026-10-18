import { expect, test, type Page } from "@playwright/test";
import { startExpense } from "./expense-helpers";
import { expectNoHorizontalScroll, PEOPLE, signInAs } from "./helpers";

/*
 * Stage 5 phone check, automated part (DRD 9, DRD 8 "Responsive"). Runs in the "phone"
 * project: a Pixel 7 with touch, so taps are real touch events. Layout at 360 px and
 * axe are covered page by page in the other specs; this sweeps every main page for each
 * role. The real-device part is docs/phone-check.md.
 */

/** Touch targets: 24 px minimum (WCAG 2.5.8), 44 px for the bottom bar (DRD 9). */
async function expectTappable(page: Page) {
  const small = await page.evaluate(() => {
    const visible = (el: Element) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden";
    };
    // A link inside a sentence is exempt (WCAG 2.5.8 "inline").
    const inline = (el: Element) =>
      el.tagName === "A" && Boolean(el.closest("p, li p, td, dd, figcaption, label"));
    return [
      ...document.querySelectorAll(
        "main button, main a[href], main select, main input:not([type=hidden]), main [role=tab], nav button, nav a[href]",
      ),
    ]
      .filter((el) => visible(el) && !inline(el))
      .filter((el) => {
        const box = el.getBoundingClientRect();
        const target = el.closest("label") ?? el;
        const t = target.getBoundingClientRect();
        return Math.max(box.height, t.height) < 24 || Math.max(box.width, t.width) < 24;
      })
      .slice(0, 20)
      .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 40)}"`);
  });
  expect.soft(small, `Too small to tap on ${page.url()}:\n${small.join("\n")}`).toEqual([]);
  const bar = page.getByRole("navigation", { name: "Quick navigation" });
  for (const item of await bar.getByRole("link").or(bar.getByRole("button")).all()) {
    const box = (await item.boundingBox())!;
    expect.soft(box.height, "bottom bar item height").toBeGreaterThanOrEqual(44);
  }
}

const PAGES: [string, string, string[]][] = [
  [
    "a department leader",
    PEOPLE.sam,
    ["/", "/annual", "/expenses/new", "/expenses/mine", "/spending/my-department", "/help"],
  ],
  [
    "the accountant",
    PEOPLE.pat,
    [
      "/annual/review",
      "/annual/departments",
      "/annual/release",
      "/annual/cycles",
      "/expenses/review",
      "/expenses/ready",
      "/expenses/all",
      "/spending",
      "/spending/record",
      "/spending/ledger",
      "/reports",
      "/reports/analytics",
    ],
  ],
  ["the Board Chair", PEOPLE.cleo, ["/expenses/awaiting-approval", "/spending/budget-vs-actual"]],
  [
    "the System Administrator",
    PEOPLE.gina,
    ["/admin/users", "/admin/departments", "/admin/cycles", "/admin/settings", "/admin/audit"],
  ],
];

test.describe("Phone check (Stage 5)", () => {
  test.describe.configure({ timeout: 120_000 });

  for (const [who, person, paths] of PAGES) {
    test(`every main page for ${who} fits the phone and can be tapped`, async ({ page }) => {
      await signInAs(page, person);
      for (const path of paths) {
        await test.step(path, async () => {
          await page.goto(path);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          // Measure the settled page, not a panel or toast halfway through sliding in.
          await page.waitForLoadState("networkidle");
          await page.waitForFunction(() =>
            document.getAnimations().every((a) => a.playState !== "running"),
          );
          await expectNoHorizontalScroll(page);
          await expectTappable(page);
        });
      }
    });
  }

  test("the bottom bar and More work by touch", async ({ page }) => {
    await signInAs(page, PEOPLE.sam);
    const bar = page.getByRole("navigation", { name: "Quick navigation" });
    await bar.getByRole("link", { name: "Expenses" }).tap();
    await expect(page).toHaveURL(/\/expenses/);
    await bar.getByRole("button", { name: "More" }).tap();
    const sheet = page.getByRole("dialog", { name: "All pages" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("link", { name: "Help" }).tap();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("heading", { level: 1, name: "Help" })).toBeVisible();
  });

  test("a receipt can come straight from the camera", async ({ page }) => {
    await signInAs(page, PEOPLE.sam);
    await startExpense(page, "Expense claim");
    const camera = page.locator('input[type=file][capture="environment"]');
    await expect(camera).toHaveAttribute("accept", "image/*");
    await expect(page.getByText("Take photo").first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
