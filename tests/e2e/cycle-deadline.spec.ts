import { expect, test } from "@playwright/test";
import {
  DESKTOP,
  expectAxeClean,
  MOBILE,
  expectNoHorizontalScroll,
  PEOPLE,
  signInAs,
} from "./helpers";

/*
 * A cycle's deadline card shows each change with its reason, who made it and when, so
 * nobody needs the activity log to see it (decided by the church 2026-10-20). Uses its own
 * draft cycle: the shared FY2026 cycle is never changed by an e2e test.
 */
test("changing a draft cycle's deadline shows the change, with its reason, on the card", async ({
  page,
}) => {
  const year = 2060 + (Date.now() % 30);
  await page.setViewportSize(DESKTOP);
  await signInAs(page, PEOPLE.gina);
  await page.goto("/admin/cycles");
  const create = page.getByRole("form", { name: "Create a budget cycle" });
  await create.getByLabel("Name").fill(`Deadline test ${year}`);
  await create.getByLabel("Budget year").fill(String(year));
  await create.getByLabel("Start date").fill(`${year}-01-01`);
  await create.getByLabel("Submission deadline").fill(`${year - 1}-12-01T17:00`);
  await create.getByRole("button", { name: "Create cycle" }).click();
  await page.getByRole("link", { name: `Deadline test ${year}`, exact: true }).click();

  const card = page.getByRole("region", { name: "Submission deadline" });
  await expect(card.getByText(`Dec 1, ${year - 1}`)).toBeVisible();
  await card.getByText("Change the deadline", { exact: true }).click();
  const form = card.getByRole("form", { name: "Change the deadline" });
  await form.getByLabel("New deadline").fill(`${year - 1}-12-15T17:00`);
  await form.getByLabel("Reason").fill("Leaders asked for two more weeks.");
  await form.getByRole("button", { name: "Change deadline" }).click();

  await expect(card.getByText(new RegExp(`^Changed to Dec 15, ${year - 1}`))).toBeVisible();
  await expect(card.getByText(/Leaders asked for two more weeks\. · Gina Admin/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Department extensions" })).toBeVisible();
  await expectAxeClean(page);

  await page.setViewportSize(MOBILE);
  await expectNoHorizontalScroll(page);
  await expectAxeClean(page);
});
