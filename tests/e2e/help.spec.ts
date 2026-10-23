import { expect, test } from "@playwright/test";
import {
  DESKTOP,
  expectAxeClean,
  expectNoHorizontalScroll,
  MOBILE,
  PEOPLE,
  signInAs,
} from "./helpers";

test.describe("Help and privacy (FR-36, DRD 6.11c)", () => {
  for (const [name, size] of [
    ["360 px", MOBILE],
    ["1440 px", DESKTOP],
  ] as const) {
    test(`Help shows the guides for your roles first, axe clean at ${name}`, async ({ page }) => {
      await page.setViewportSize(size);
      await signInAs(page, PEOPLE.pat);
      await page.goto("/help");
      await expect(page.getByRole("heading", { level: 1, name: "Help" })).toBeVisible();
      const yours = page.getByRole("region", { name: "Guides for your roles" });
      await expect(
        yours.getByRole("heading", { name: /^Accountant and backup approver/ }),
      ).toBeVisible();
      await expect(yours.getByRole("heading", { name: /^Department leaders/ })).toHaveCount(0);
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
      // The questions are grouped by topic and open in place.
      await page
        .getByRole("navigation", { name: "Common questions" })
        .getByRole("link", { name: "Your annual budget" })
        .click();
      await expect(page).toHaveURL(/\/help#faq-annual$/);
      await page.getByText("How is sales tax calculated?").click();
      await expect(
        page.getByText("$1,025.00 + $123.00 tax = $1,148.00", { exact: false }),
      ).toBeVisible();
      // A link straight to an answer opens it.
      await page.goto("/help#who-approves");
      await expect(page.getByText("the lower one stands", { exact: false })).toBeVisible();
    });
  }

  test("the form's tax help opens in a side panel and keeps what was typed", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.sam);
    await page.goto("/annual/new");
    // A department of its own, so no other test's budget gets in the way.
    await page.getByRole("radio", { name: "Other (type your department)" }).check();
    await page.getByLabel("Department name").fill("Library Team");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/\/annual\/[0-9a-f-]+\/edit$/);
    await page.getByLabel("Request title").fill("Library 2027");
    await page.getByLabel("Why are you requesting this budget?").fill("Crafts.");
    await page.getByRole("button", { name: "Next" }).click();
    const item = page.getByRole("group", { name: "Item 1" }).getByLabel("Item name");
    await item.fill("Glue sticks");

    const trigger = page.getByRole("button", { name: "How is tax calculated?" });
    await trigger.click();
    const panel = page.getByRole("dialog", { name: "How is sales tax calculated?" });
    await expect(
      panel.getByText("$1,025.00 + $123.00 tax = $1,148.00", { exact: false }),
    ).toBeVisible();
    await expectAxeClean(page);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(item).toHaveValue("Glue sticks");
  });

  test("the privacy notice is open without signing in, and linked from sign-in", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/sign-in");
    await page.getByRole("link", { name: "Read the privacy notice" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { level: 1, name: "Privacy notice" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "How long we keep it" })).toBeVisible();
    await expect(
      page.getByText("Questions about your information? Email office@example.org."),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
    await page.getByRole("link", { name: "Back to sign in" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("a signed-in person can ask to correct their information", async ({ page }) => {
    await signInAs(page, PEOPLE.noah);
    await page.goto("/help");
    const section = page.getByRole("region", { name: "Your personal information" });
    await section.getByLabel("What would you like?").selectOption("correct");
    await section.getByRole("button", { name: "Send request" }).click();
    await expect(section.getByText("Say what should be corrected.")).toBeVisible();
    await section.getByLabel(/^Details/).fill("My surname is Obi-Adeyemi.");
    await section.getByRole("button", { name: "Send request" }).click();
    await expect(
      section.getByText("Your request was sent to the administrator. They'll reply by email."),
    ).toBeVisible();
  });
});
