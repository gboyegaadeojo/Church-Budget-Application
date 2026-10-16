import { expect, test, type Page } from "@playwright/test";
import {
  DESKTOP,
  expectAxeClean,
  expectNoHorizontalScroll,
  MOBILE,
  TABLET,
  PEOPLE,
  signInAs,
} from "./helpers";

/**
 * Signs in as a person with every role; Home has streamed in once My tasks shows. Other
 * tests give this person drafts, so the list may or may not be empty.
 */
async function gotoHome(page: Page) {
  await signInAs(page, PEOPLE.gina);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2, name: "My tasks" })).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}

test.describe("Home and app shell", () => {
  test("AC-108 one sign-in reaches every role: one navigation and one My tasks list", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await gotoHome(page);

    // One navigation, grouped by area, combining every role the preview person holds.
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav).toHaveCount(1);
    await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");

    // Areas are groups that open one at a time, so the list stays short.
    const annual = nav.getByRole("button", { name: "Annual Budget" });
    const expenses = nav.getByRole("button", { name: "Expenses" });
    await expect(annual).toHaveAttribute("aria-expanded", "false");
    await expect(nav.getByRole("link", { name: "Review dashboard" })).toBeHidden();
    await annual.click();
    await expect(annual).toHaveAttribute("aria-expanded", "true");
    for (const link of ["My department's budget", "Review dashboard"]) {
      await expect(nav.getByRole("link", { name: link }).first()).toBeVisible();
    }
    await expenses.click();
    await expect(annual).toHaveAttribute("aria-expanded", "false");
    await expect(nav.getByRole("link", { name: "Review dashboard" })).toBeHidden();
    for (const link of ["Awaiting my approval", "Ready to process"]) {
      await expect(nav.getByRole("link", { name: link })).toBeVisible();
    }
    await nav.getByRole("button", { name: "Admin" }).click();
    await expect(nav.getByRole("link", { name: "Users & Roles" })).toBeVisible();

    // The group of the current page opens by itself.
    await nav.getByRole("link", { name: "Users & Roles" }).click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(nav.getByRole("button", { name: "Admin" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(nav.getByRole("link", { name: "Users & Roles" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.goto("/");

    // One My tasks list.
    await expect(page.getByRole("heading", { level: 2, name: "My tasks" })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 2, name: "At a glance" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Recent activity" })).toBeVisible();

    // Roles are chips in the account menu, not a role switcher.
    await page.getByRole("button", { name: "Open account menu" }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByText("Accountant", { exact: true })).toBeVisible();
    // Other tests add departments, so which ones are listed first varies.
    await expect(menu.getByText(/^Requester: /).first()).toBeVisible();
    await expect(menu.getByRole("menuitemradio", { name: "System" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Sign out/ })).toBeVisible();
  });

  test("AC-102 Home works at 1440 px with the desktop sidebar", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await gotoHome(page);

    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Quick navigation" })).toBeHidden();
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "Help" })).toBeVisible();
    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("AC-102 Home works at 360 px with the bottom bar and More menu", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await gotoHome(page);

    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeHidden();
    const bar = page.getByRole("navigation", { name: "Quick navigation" });
    await expect(bar).toBeVisible();
    for (const name of ["Home", "Annual Budget", "Expenses", "Spending", "More"]) {
      await expect(bar.getByRole(name === "More" ? "button" : "link", { name })).toBeVisible();
    }
    await expect(bar.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    await expectNoHorizontalScroll(page);

    // The footer is not hidden behind the fixed bottom bar.
    const footer = page.getByRole("contentinfo");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const footerBox = await footer.boundingBox();
    const barBox = await bar.boundingBox();
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(barBox!.y + 1);

    // More opens a sheet with every page, grouped by area like the sidebar.
    const more = bar.getByRole("button", { name: "More" });
    await more.click();
    const sheet = page.getByRole("dialog", { name: "All pages" });
    await expect(sheet).toBeVisible();
    await expectAxeClean(page);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(more).toBeFocused();

    await more.click();
    await sheet.getByRole("button", { name: "Admin" }).click();
    await sheet.getByRole("link", { name: "Users & Roles" }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.getByRole("heading", { level: 1, name: "Users & Roles" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "People" })).toBeVisible();
  });

  test("AC-102 Home works at 820 px with the side rail and flyouts", async ({ page }) => {
    await page.setViewportSize(TABLET);
    await gotoHome(page);

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Quick navigation" })).toBeHidden();
    await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    await expectNoHorizontalScroll(page);

    // Each area is one coloured icon; its pages are in a flyout.
    await nav.getByRole("button", { name: "Admin" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole("menuitem", { name: "Users & Roles" }).click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(nav.getByRole("button", { name: "Admin" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  test("AC-103 keyboard: area groups open with Enter and Space; closed pages are skipped", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await gotoHome(page);
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    const annual = nav.getByRole("button", { name: "Annual Budget" });

    await annual.focus();
    await page.keyboard.press("Enter");
    await expect(annual).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Tab");
    await expect(nav.getByRole("link", { name: "My department's budget" }).first()).toBeFocused();

    await annual.focus();
    await page.keyboard.press("Space");
    await expect(annual).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Tab");
    await expect(nav.getByRole("button", { name: "Expenses" })).toBeFocused();
  });

  test("AC-103 keyboard: skip link, account menu and theme choice", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await gotoHome(page);

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();

    const trigger = page.getByRole("button", { name: "Open account menu" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.getByRole("menuitemradio", { name: "Dark" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(trigger).toBeFocused();

    // The choice survives a reload without a flash: the class is set before React runs.
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("AC-103 unknown pages are a 404 and coming-soon pages are reachable", async ({ page }) => {
    await signInAs(page, PEOPLE.gina);
    await page.waitForURL("/");
    const missing = await page.goto("/no-such-page");
    expect(missing?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();

    await page.goto("/expenses/new");
    await expect(page.getByRole("heading", { level: 1, name: "New expense" })).toBeVisible();
  });

  for (const scheme of ["light", "dark"] as const) {
    for (const [label, viewport] of [
      ["360 px", MOBILE],
      ["820 px", TABLET],
      ["1440 px", DESKTOP],
    ] as const) {
      test(`AC-103 Home is axe clean in ${scheme} theme at ${label}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize(viewport);
        await gotoHome(page);
        await expect(page.locator("html")).toHaveClass(scheme === "dark" ? /dark/ : /light/);
        await expectAxeClean(page);

        if (viewport === DESKTOP) {
          // An open group: its tinted panel and coloured pages are checked too.
          const nav = page.getByRole("navigation", { name: "Main navigation" });
          await nav.getByRole("button", { name: "Annual Budget" }).click();
          await expect(nav.getByRole("link", { name: "Review dashboard" })).toBeVisible();
          await expectAxeClean(page);
        }

        await page.getByRole("button", { name: "Open account menu" }).click();
        await expect(page.getByRole("menu")).toBeVisible();
        await expectAxeClean(page);
      });
    }
  }

  test("FR-37 nothing waiting shows the all-caught-up state", async ({ page }) => {
    // Noah has no drafts and no review work; the accountant now has reviews waiting.
    await signInAs(page, PEOPLE.noah);
    await page.goto("/");
    await expect(page.getByText("You're all caught up.")).toBeVisible();
  });
});
