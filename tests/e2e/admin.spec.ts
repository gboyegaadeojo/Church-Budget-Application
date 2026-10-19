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
  ["/admin/audit", "Notifications & Audit"],
] as const;

test.describe("Admin (Stage 1 step 4)", () => {
  test("FR-21 the email log filters by status, and only the administrator can open it", async ({
    page,
    browser,
  }) => {
    await signInAs(page, PEOPLE.gina);
    await page.goto("/admin/audit");
    const counts = page.getByRole("region", { name: "Emails by status" });
    await expect(counts.getByRole("link", { name: /Couldn.t be sent/ })).toBeVisible();
    // The fake sender never fails, so the failed filter is empty and offers no bulk retry.
    await page.getByLabel("Status", { exact: true }).selectOption("failed");
    await page.getByRole("button", { name: "Show" }).click();
    await expect(page).toHaveURL(/status=failed/);
    await expect(page.getByText("No emails match.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send all failed again" })).toHaveCount(0);

    const pat = await browser.newContext();
    const patPage = await pat.newPage();
    await signInAs(patPage, PEOPLE.pat);
    await patPage.goto("/admin/audit");
    await expect(
      patPage.getByRole("heading", { name: "You don't have access to this page" }),
    ).toBeVisible();
    await pat.close();
  });

  test("go-live step 3 the administrator sends a test email and sees it in the log", async ({
    page,
  }) => {
    const to = `deliverability.${Date.now()}@example.org`;
    await signInAs(page, PEOPLE.gina);
    await page.goto("/admin/audit");
    const form = page.getByRole("form", { name: "Send a test email" });
    await form.getByLabel("Send to").fill("not an address");
    await form.getByRole("button", { name: "Send test email" }).click();
    await expect(form.getByText("Enter an email address, like name@example.org.")).toBeVisible();

    await form.getByLabel("Send to").fill(to);
    await form.getByRole("button", { name: "Send test email" }).click();
    await expect(form.getByRole("status")).toContainText(`Test email on its way to ${to}`);
    await page.getByLabel("Search subject or recipient").fill(to);
    await page.getByRole("button", { name: "Show" }).click();
    await expect(
      page.getByRole("cell", { name: /Test email from the budget app/ }).first(),
    ).toBeVisible();
  });

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

    await expect(
      page.getByRole("region", { name: "Planning Center" }).getByText("Connected", { exact: true }),
    ).toBeVisible();
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

  test("AC-134 AC-135 the administrator keeps the cheque signers list", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.gina);
    await page.goto("/admin/settings");
    const section = page.getByRole("region", { name: "Signing authorities" });
    await expect(section.getByText("There are no active signers.", { exact: false })).toBeVisible();

    const add = section.getByRole("form", { name: "Add a signer" });
    for (const name of ["Pat Treasurer", "Lee Chair"]) {
      await add.getByLabel("Name").fill(name);
      await add.getByRole("button", { name: "Add signer" }).click();
      await expect(add.getByText(`${name} was added.`)).toBeVisible();
    }
    await expect(section.getByText(/Cheque payments need two signers/)).toHaveCount(0);

    await section.getByText("Edit Lee Chair").click();
    await section
      .getByRole("form", { name: "Remove" })
      .getByRole("button", { name: "Remove" })
      .click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
    // The status badge ("Inactive from Oct 20, 2026"), not the Remove form's date label.
    await expect(section.getByText(/^Inactive from \w{3} \d{1,2}, \d{4}$/)).toBeVisible();
    await expect(section.getByText("Only one signer is active.", { exact: false })).toBeVisible();
    // Removed signers stay on the list.
    await expect(section.getByText("Lee Chair", { exact: true })).toBeVisible();
    await expectAxeClean(page);
  });

  test("FR-33 the administrator picks the Primary accountant", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await signInAs(page, PEOPLE.gina);
    await page.goto("/admin/settings");
    const section = page.getByRole("region", { name: "Accountants" });
    await section
      .getByRole("combobox", { name: "Primary accountant" })
      .selectOption({ label: "Pat Accountant" });
    await section.getByRole("button", { name: "Save Primary accountant" }).click();
    await expect(section.getByText("Primary accountant saved.")).toBeVisible();
    await expect(section.getByText("No Primary accountant is set.", { exact: false })).toHaveCount(
      0,
    );
    await expectNoHorizontalScroll(page);
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

test.describe("Budget cycles for finance and board staff (decided 2026-10-17)", () => {
  test("the Board Chair opens Annual Budget → Budget cycles and a cycle to edit, axe clean", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAs(page, PEOPLE.cleo);
    await page.goto("/annual/cycles");
    await expect(page.getByRole("heading", { level: 1, name: "Budget Cycles" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Budget Cycles" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create cycle" })).toBeVisible();
    await expectAxeClean(page);
    // Each cycle opens its page to edit it (decided 2026-10-17). Nothing is saved here:
    // other tests share FY2026; editing is covered by integration tests.
    await page.getByRole("link", { name: "FY2026", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "FY2026" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Edit details" })).toBeVisible();
    await expect(
      page
        .getByRole("form", { name: "Edit details" })
        .getByLabel("Board-approved church total, incl. tax"),
    ).toBeVisible();
    await expectAxeClean(page);
  });
});
