import { expect, test } from "@playwright/test";
import { DESKTOP, expectAxeClean, MOBILE, PEOPLE, signInAs } from "./helpers";

/*
 * Away (FR-33, FR-38). Tests share one database and run in parallel, so these never
 * make anyone Away today (that would move other tests' accountant emails): they set a
 * future Away and turn it off. Routing while Away is covered by
 * tests/integration/away.test.ts (AC-61, AC-119).
 */

test("an accountant sets a future Away from the account menu and turns it off", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await signInAs(page, PEOPLE.pat);
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("menuitem", { name: "Away" }).click();
  await expect(page).toHaveURL(/\/account#away$/);
  const away = page.getByRole("region", { name: "Away" });
  await expect(away.getByText("You're not away.")).toBeVisible();
  await away.getByLabel("Away from").fill("2030-07-01");
  await away.getByLabel(/Back on/).fill("2030-07-15");
  await away.getByRole("button", { name: "Set Away" }).click();
  await expect(away.getByText("Away is set.")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Away" }).getByText(/You'll be away from Jul 1, 2030/),
  ).toBeVisible();
  await expectAxeClean(page);

  await page.getByRole("button", { name: "Turn off Away" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Turn off Away" }).click();
  // The form goes once Away is off; the status line says so (role="status").
  await expect(
    page.getByRole("region", { name: "Away" }).getByText("You're not away."),
  ).toBeVisible();
});

test("the account page is axe clean on a phone, and says Away is for approvers", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await signInAs(page, PEOPLE.sam);
  await page.goto("/account");
  await expect(page.getByText("Away is for the accountant and backup approvers.")).toBeVisible();
  await expectAxeClean(page);
});

test("a department's Primary sees the Away form under their leaders", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signInAs(page, PEOPLE.gina);
  await page.goto("/annual");
  const panel = page.getByRole("region", { name: "Media Team: leaders" });
  await expect(panel.getByRole("heading", { name: "Away" })).toBeVisible();
  await expect(panel.getByLabel("Away from")).toBeVisible();
});
