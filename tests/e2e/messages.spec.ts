import { expect, test } from "@playwright/test";
import {
  DESKTOP,
  expectAxeClean,
  expectNoHorizontalScroll,
  MOBILE,
  PEOPLE,
  signInAs,
} from "./helpers";

/*
 * Request messages (FR-31, AC-59, DRD 6.11a). Tests run in parallel against one
 * database, so this one uses its own department.
 */

const DEPARTMENT = "Youth Ministry";

test("AC-59 a leader and the accountant exchange messages on a request", async ({ browser }) => {
  // Sam submits Youth Ministry's budget and asks a question with a link.
  const sam = await (await browser.newContext()).newPage();
  await sam.setViewportSize(DESKTOP);
  await signInAs(sam, PEOPLE.sam);
  await sam.goto("/annual/new");
  await sam.getByRole("radio", { name: DEPARTMENT, exact: true }).check();
  await sam.getByRole("button", { name: "Continue" }).click();
  await sam.waitForURL(/\/annual\/[0-9a-f-]+\/edit$/);
  await sam.getByLabel("Request title").fill("Youth retreat");
  await sam.getByLabel("Why are you requesting this budget?").fill("Annual retreat.");
  await sam.getByRole("button", { name: "Next" }).click();
  const row = sam.getByRole("group", { name: "Item 1" });
  await row.getByLabel("Item name").fill("Cabin rental");
  await row.getByLabel("Quantity").fill("1");
  await row.getByLabel("Unit price (before tax)").fill("800.00");
  await sam.getByRole("button", { name: "Preview" }).click();
  await sam.getByRole("button", { name: "Confirm submission" }).click();
  await sam.getByRole("button", { name: "Submit request" }).click();
  await sam.waitForURL(/\/annual\/[0-9a-f-]+\?done=submitted$/);
  const id = new URL(sam.url()).pathname.split("/").at(-1)!;

  const panel = sam.getByRole("region", { name: "Messages" });
  await expect(panel.getByText("No messages yet.")).toBeVisible();
  await expect(panel.getByText("Sends an email to the accountant.")).toBeVisible();
  await panel.getByLabel("Your message").fill("Can we book https://camp.example.org/cabins?");
  await panel.getByRole("button", { name: "Send" }).click();
  await expect(panel.getByText("Message sent.")).toBeVisible();
  const link = panel.getByRole("link", { name: "https://camp.example.org/cabins?" });
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(panel.getByText("(camp.example.org)")).toBeVisible();
  await expectAxeClean(sam);

  // Pat sees it waiting on the queue, opens the request and replies.
  const pat = await (await browser.newContext()).newPage();
  await pat.setViewportSize(DESKTOP);
  await signInAs(pat, PEOPLE.pat);
  await pat.goto("/annual/review");
  const queueRow = pat
    .getByRole("region", { name: "Submitted budget requests" })
    .getByRole("row")
    .filter({ hasText: DEPARTMENT });
  await expect(queueRow.getByText("1 new message")).toBeVisible();
  await pat.goto(`/annual/review/${id}`);
  const thread = pat.getByRole("region", { name: "Messages" });
  await expect(thread.getByText("Can we book")).toBeVisible();
  await expect(
    thread.getByText("Sends an email to the department's representatives."),
  ).toBeVisible();
  await thread.getByLabel("Your message").fill("Yes, that's fine.");
  await thread.getByRole("button", { name: "Send" }).click();
  await expect(thread.getByText("Yes, that's fine.")).toBeVisible();
  await expectAxeClean(pat);

  // Sam sees the reply, and an unread count on the dashboard until it's opened.
  await sam.goto("/annual");
  await expect(sam.getByText("1 new message").first()).toBeVisible();
  await sam.goto(`/annual/${id}`);
  await expect(
    sam.getByRole("region", { name: "Messages" }).getByText("Yes, that's fine."),
  ).toBeVisible();
  await sam.setViewportSize(MOBILE);
  await expectNoHorizontalScroll(sam);
});
