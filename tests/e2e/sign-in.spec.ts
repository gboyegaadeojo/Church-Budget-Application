import { expect, test, type Page } from "@playwright/test";
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
    await expect(
      page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening), / }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /, Gina$/ })).toBeVisible();

    await page.getByRole("button", { name: "Open account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("a session cookie the server can't read (e.g. after AUTH_SECRET changes) means signed out", async ({
    page,
    context,
    baseURL,
  }) => {
    // A cookie sealed with some other secret, like one left from before a restart.
    await context.addCookies([
      {
        name: "authjs.session-token",
        value:
          "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2Q0JDLUhTNTEyIn0..c3RhbGU.c3RhbGUtc2Vzc2lvbg.c3RhbGU",
        url: baseURL!,
      },
    ]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in/);
    await signInAs(page, PEOPLE.gina);
    await expect(
      page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening), / }),
    ).toBeVisible();
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

  test("AC-8 a Planning Center profile the church can't find is not found", async ({ page }) => {
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

  test("a new leader whose Ministry Department names a department lands on it", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.noah);
    await expect(page).toHaveURL("/");
    await page.goto("/annual/new");
    // Suggest mode (the default): their department comes first, chosen, from Planning Center.
    const radio = page.getByRole("radio", { name: "Sanctuary Keepers Team", exact: true });
    await expect(radio).toBeChecked();
    await expect(radio).toHaveAccessibleDescription(/Yours/);
    await expect(page.getByRole("radio", { name: "Other (type your department)" })).toBeVisible();
    await expectAxeClean(page);
  });

  test("AC-10 the accountant signs in without the Planning Center field", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.pat);
    await expect(page).toHaveURL("/");
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await nav.getByRole("button", { name: "Annual Budget" }).click();
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
    // At least one noindex tag. Next.js sometimes streams the not-found metadata twice;
    // two identical tags still mean "don't index" (docs/decisions.md 2026-10-17).
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  });
});

test.describe("Linking a staff member's Planning Center profile (FR-01a, AC-6)", () => {
  test("AC-6 the administrator links Bo, who then signs in with Planning Center", async ({
    page,
    browser,
  }) => {
    await signInAs(page, PEOPLE.bo);
    await expect(page).toHaveURL(/\/access-denied\/link-required$/);
    await expect(
      page.getByRole("heading", { name: "Your Planning Center profile isn't linked yet" }),
    ).toBeVisible();

    const adminContext = await browser.newContext({ viewport: DESKTOP });
    const admin = await adminContext.newPage();
    await signInAs(admin, PEOPLE.gina, "/sign-in?callbackUrl=%2Fadmin%2Fusers");
    await admin.getByRole("link", { name: "Bo Chair", exact: true }).click();
    const section = admin.getByRole("region", { name: "Planning Center profile" });
    await expect(section.getByText("Not linked.", { exact: false })).toBeVisible();
    await expectAxeClean(admin);
    await section.getByRole("button", { name: "Link to Bo Chair" }).click();
    await expect(section.getByText("Linked to Bo Chair")).toBeVisible();
    await adminContext.close();

    await page.getByRole("button", { name: "Use a different account" }).click();
    await signInAs(page, PEOPLE.bo);
    await expect(page).toHaveURL("/");
  });
});

test.describe("Continue with email (FR-01b, DRD 6.1)", () => {
  const CAROL = "carol.office@outlook.com";

  /** The newest code the fake sender emailed to this address (test-only route). */
  async function emailedCode(page: Page, to: string): Promise<string> {
    let code = "";
    await expect(async () => {
      const res = await page.request.get(`/api/test/emails?to=${encodeURIComponent(to)}`);
      const { emails } = (await res.json()) as { emails: { text: string }[] };
      code = emails[0]?.text.match(/\b(\d{6})\b/)?.[1] ?? "";
      expect(code).not.toBe("");
    }).toPass({ timeout: 10_000 });
    return code;
  }

  async function askForCode(page: Page, email: string) {
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Continue with email" }).click();
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page.getByText(`If ${email} can sign in here`)).toBeVisible();
  }

  test("AC-132 the Church Administrator signs in with an emailed code", async ({ page }) => {
    await askForCode(page, CAROL);
    await expect(page.getByLabel("6-digit code")).toBeFocused();
    await page.getByLabel("6-digit code").fill(await emailedCode(page, CAROL));
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1, name: /, Carol$/ })).toBeVisible();
  });

  test("a ministry leader with only a Church Center login signs in with an emailed code", async ({
    page,
  }) => {
    // Decided 2026-10-23: the code goes to the email on a verified leader's Planning Center
    // profile, and the sign-in counts as that Planning Center person's.
    const lena = "lena.centre@example.org";
    await askForCode(page, lena);
    await page.getByLabel("6-digit code").fill(await emailedCode(page, lena));
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "You're verified" })).toBeVisible();
  });

  test("AC-133 an unknown address sees the same message, and a wrong code says so", async ({
    page,
  }) => {
    await askForCode(page, "someone.else@outlook.com");
    const code = page.getByLabel("6-digit code");
    await code.fill("000000");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("That code isn't right. 4 tries left.")).toHaveRole("alert");
    await expect(code).toHaveAttribute("aria-invalid", "true");

    await page.getByRole("button", { name: "Use a different email" }).click();
    await expect(page.getByLabel("Email address")).toHaveValue("someone.else@outlook.com");
  });

  for (const [name, size] of [
    ["360 px", MOBILE],
    ["1440 px", DESKTOP],
  ] as const) {
    test(`the email and code steps are axe clean at ${name}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/sign-in");
      await page.getByRole("button", { name: "Continue with email" }).click();
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
      await page.getByLabel("Email address").fill(`axe-${size.width}@outlook.com`);
      await page.getByRole("button", { name: "Email me a code" }).click();
      await expect(page.getByLabel("6-digit code")).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
    });
  }
});
