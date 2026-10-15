import { expect, test } from "@playwright/test";
import {
  DESKTOP,
  expectAxeClean,
  expectNoHorizontalScroll,
  MOBILE,
  PEOPLE,
  signInAs,
} from "./helpers";

test.describe("Sign-in (FR-01, FR-01a, DRD 6.1, 6.1a)", () => {
  test("AC-2 nothing is shown without signing in", async ({ page }) => {
    await page.goto("/annual/review");
    await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Fannual%2Freview$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Sign in to Church Budget" }),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
  });

  test("AC-1 a signed-in person lands on Home, and sign out ends the session", async ({ page }) => {
    await signInAs(page, PEOPLE.gina);
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
    await expect(page.getByText("Welcome, Gina")).toBeVisible();

    await page.getByRole("button", { name: "Open account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("returns to the page that asked for sign-in", async ({ page }) => {
    await page.goto("/expenses/new");
    await signInAs(page, PEOPLE.gina, page.url());
    await expect(page).toHaveURL(/\/expenses\/new$/);
  });

  test("AC-7 a Group Leader signing in with Planning Center gets requester pages", async ({
    page,
  }) => {
    await signInAs(page, PEOPLE.sam);
    await expect(page).toHaveURL("/");
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await page.setViewportSize(DESKTOP);
    await expect(nav.getByRole("link", { name: "My department's budget" }).first()).toBeVisible();
    await expect(nav.getByRole("link", { name: "Review dashboard" })).toHaveCount(0);
  });

  test("AC-7 someone who isn't a Group Leader is told so, with the email used", async ({
    page,
  }) => {
    await signInAs(page, PEOPLE.jo);
    await expect(page).toHaveURL(/\/access-denied\/not-leader$/);
    await expect(
      page.getByRole("heading", { name: "Submitting budgets is for Group Leaders" }),
    ).toBeVisible();
    await expect(page.getByText("You signed in with jo.member@example.org.")).toBeVisible();
    await expect(
      page.getByText("If you think this is a mistake, email office@example.org.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Use a different account" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("AC-8 a Google account with no Planning Center person is not found", async ({ page }) => {
    await signInAs(page, PEOPLE.stranger);
    await expect(page).toHaveURL(/\/access-denied\/not-found$/);
    await expect(
      page.getByRole("heading", { name: "We couldn't find you in the church's Planning Center" }),
    ).toBeVisible();
  });

  test("AC-9 a leader removed in Planning Center is suspended, drafts kept", async ({ page }) => {
    await signInAs(page, PEOPLE.kim);
    await expect(page).toHaveURL(/\/access-denied\/suspended$/);
    await expect(page.getByText("Your drafts are saved")).toBeVisible();
  });

  test("a new Group Leader waits for a department, calmly", async ({ page }) => {
    await signInAs(page, PEOPLE.ada);
    await expect(page).toHaveURL(/\/access-denied\/waiting$/);
    await expect(page.getByRole("heading", { name: "You're verified" })).toBeVisible();
    await expect(page.getByText("You signed in with ada.obi@example.org.")).toBeVisible();
    // Still signed in, but every app page leads back here until a department is assigned.
    await page.goto("/annual");
    await expect(page).toHaveURL(/\/access-denied\/waiting$/);
    // While a cycle is open, they can pick their department on the form (FR-03, FR-38).
    await page.getByRole("link", { name: "Choose your department" }).click();
    await expect(page).toHaveURL(/\/annual\/new$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Start a budget request" }),
    ).toBeVisible();
    await expect(page.getByText(/You don't represent a department yet/)).toBeVisible();
  });

  test("AC-10 the accountant signs in without the Planning Center field", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.pat);
    await expect(page).toHaveURL("/");
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link", { name: "Review dashboard" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "My department's budget" })).toHaveCount(0);
  });

  for (const scheme of ["light", "dark"] as const) {
    for (const [label, viewport] of [
      ["360 px", MOBILE],
      ["1440 px", DESKTOP],
    ] as const) {
      test(`sign-in screen is axe clean in ${scheme} theme at ${label}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize(viewport);
        await page.goto("/sign-in");
        await expect(page.getByRole("button", { name: /Sign in as Gina/ })).toBeVisible();
        await expectNoHorizontalScroll(page);
        await expectAxeClean(page);
      });
    }
  }

  test("access-denied screens are axe clean at 360 px", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    for (const reason of [
      "not-found",
      "not-leader",
      "suspended",
      "waiting",
      "unavailable",
      "not-allowed",
      "link-required",
    ]) {
      await page.goto(`/access-denied/${reason}`);
      await expect(page.getByRole("button", { name: "Use a different account" })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
    }
  });

  test("unknown access-denied reasons show Page not found and are not indexed", async ({
    page,
  }) => {
    // The status stays 200 because the page streams before the reason is checked
    // (Cache Components); the not-found UI and the noindex tag still apply.
    await page.goto("/access-denied/whatever");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
  });
});
