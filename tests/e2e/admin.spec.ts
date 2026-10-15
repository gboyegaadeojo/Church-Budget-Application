import { expect, test } from "@playwright/test";
import {
  DESKTOP,
  expectAxeClean,
  expectNoHorizontalScroll,
  MOBILE,
  PEOPLE,
  signInAs,
} from "./helpers";

const ADMIN_PAGES = [
  ["/admin/users", "Users & Roles"],
  ["/admin/departments", "Departments"],
  ["/admin/cycles", "Budget Cycles"],
  ["/admin/settings", "Settings"],
] as const;

test.describe("Admin (Stage 1 step 4)", () => {
  for (const [label, viewport] of [
    ["360 px", MOBILE],
    ["1440 px", DESKTOP],
  ] as const) {
    test(`AC-103 admin pages are axe clean with no sideways scroll at ${label}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await signInAs(page, PEOPLE.gina);
      for (const [path, title] of ADMIN_PAGES) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
        await expectNoHorizontalScroll(page);
        await expectAxeClean(page);
      }
    });
  }

  test("AC-11 test a person against the Group Leader field before saving", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.gina);
    await page.goto("/admin/settings");

    await expect(page.getByText("Connected", { exact: true })).toBeVisible();
    const query = page.getByLabel("Name or email");

    await query.fill("Sam Lee");
    await query.press("Enter");
    const results = page.getByRole("list", { name: "Test a person" });
    await expect(results.getByText("Sam Lee")).toBeVisible();
    await expect(results.getByText("Passes: Group Leader")).toBeVisible();

    await query.fill("Jo Member");
    await page.getByRole("button", { name: "Test", exact: true }).click();
    await expect(results.getByText("Jo Member")).toBeVisible();
    await expect(results.getByText("Doesn't pass")).toBeVisible();
    await expect(results.getByText('Field value: "false"')).toBeVisible();

    // Testing with values typed but not saved: accepting "No" flips the result.
    await page.getByLabel("Accepted values, one per line").fill("No");
    await page.getByRole("button", { name: "Test", exact: true }).click();
    await expect(results.getByText("Passes: Group Leader")).toBeVisible();

    await query.fill("Nobody Here");
    await query.press("Enter");
    await expect(page.getByText("No one in Planning Center matches that search.")).toBeVisible();

    // Testing never resets what was typed but not saved.
    await expect(page.getByLabel("Accepted values, one per line")).toHaveValue("No");

    // An empty search is explained under the search box.
    await query.fill("");
    await page.getByRole("button", { name: "Test", exact: true }).click();
    await expect(page.getByText("Enter at least 2 characters.")).toBeVisible();

    await expect(
      page.getByRole("region", { name: "Requesters failing verification" }),
    ).toBeVisible();
  });

  test("AC-5 administrator changes the sales tax rate with a confirmation", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.gina);
    await page.goto("/admin/settings");

    const rate = page.getByLabel("Sales tax rate (%)");
    await expect(rate).toHaveValue("12");
    await expect(page.getByText("Changes apply to new submissions only.")).toBeVisible();

    await rate.fill("abc");
    await page.getByRole("button", { name: "Change tax rate" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText("Change the sales tax rate to abc%?")).toBeVisible();
    await dialog.getByRole("button", { name: "Change tax rate" }).click();
    await expect(page.getByText(/Enter a rate between 0 and 100/)).toBeVisible();

    // Cancel leaves the form untouched.
    await rate.fill("12");
    await page.getByRole("button", { name: "Change tax rate" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("alertdialog")).toBeHidden();
    await expect(page.getByRole("button", { name: "Change tax rate" })).toBeFocused();
  });

  test("AC-5 people without the administrator role see permission denied", async ({ page }) => {
    await signInAs(page, PEOPLE.pat);
    for (const [path] of ADMIN_PAGES) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { level: 1, name: "You don't have access to this page" }),
      ).toBeVisible();
      await expect(page.getByLabel("Sales tax rate (%)")).toHaveCount(0);
    }
  });
});
