import { eq } from "drizzle-orm";
import { spendingEmailCopy as m } from "@/copy/spending-email";
import { budgetCycles, departments } from "@/db/schema";
import type { Tx } from "@/db/types";
import {
  budgetFigures,
  budgetStatus,
  formatPercentTenths,
  nearLimitThreshold,
  usedTenthsOfPercent,
} from "@/domain/expenses/budget";
import { emailBrand } from "@/domain/notifications/notice";
import { accountantRecipients, usersWithRole } from "@/domain/notifications/recipients";
import { appUrl } from "@/lib/email/layout";
import { enqueueEmail } from "@/lib/email/outbox";
import { formatCAD } from "@/lib/money";

/**
 * Spending alerts (FR-28, AC-85, AC-86): the accountant and the Church Administrator are
 * emailed the first time a department reaches the near-limit threshold in a cycle, and
 * the first time it goes over budget. "First" is kept by the outbox's dedupe key, one per
 * cycle, department and kind for each person, so later entries never repeat it. The
 * emails are the notification log (FR-28 "Alerts are logged").
 */

export type AlertsSent = { nearLimit: boolean; overBudget: boolean };

export async function checkSpendingAlerts(
  tx: Tx,
  cycleId: string,
  departmentId: string,
  options: { now?: Date; overBudget?: boolean } = {},
): Promise<AlertsSent> {
  const now = options.now ?? new Date();
  const figures = await budgetFigures(tx, cycleId, departmentId);
  const status = budgetStatus(figures, await nearLimitThreshold(tx));
  const sent: AlertsSent = { nearLimit: false, overBudget: false };
  if (status !== "nearing_limit" && status !== "over_budget") return sent;

  const [cycle] = await tx
    .select({ name: budgetCycles.name })
    .from(budgetCycles)
    .where(eq(budgetCycles.id, cycleId));
  const [department] = await tx
    .select({ name: departments.name })
    .from(departments)
    .where(eq(departments.id, departmentId));
  const to = [
    ...(await accountantRecipients(tx, now)),
    ...(await usersWithRole(tx, ["church_admin"])),
  ];
  const brand = await emailBrand(tx);
  const used = usedTenthsOfPercent(figures);
  const facts = [
    { label: m.facts.department, value: department.name },
    { label: m.facts.cycle, value: cycle.name },
    { label: m.facts.available, value: formatCAD(figures.available) },
    { label: m.facts.committed, value: formatCAD(figures.committed) },
    { label: m.facts.spent, value: formatCAD(figures.spent) },
    {
      label: m.facts.remaining,
      value:
        figures.remaining < 0
          ? m.overBy(formatCAD(-figures.remaining))
          : formatCAD(figures.remaining),
    },
    ...(used !== null ? [{ label: m.facts.used, value: formatPercentTenths(used) }] : []),
  ];
  const button = { label: m.button, href: appUrl(`/spending?cycle=${cycleId}`) };

  // Going over also counts as having reached the limit: one email, not two.
  const kinds: ("near" | "over")[] =
    status === "over_budget" ? (options.overBudget === false ? [] : ["over"]) : ["near"];
  for (const kind of kinds) {
    const words = kind === "over" ? m.over : m.near;
    const queued = await enqueueEmail(tx, {
      template: `spending.alert.${kind === "over" ? "over_budget" : "near_limit"}`,
      audience: "accountant",
      to,
      brand,
      cycleId,
      now,
      dedupeKey: `spending-alert:${kind}:${cycleId}:${departmentId}`,
      content: {
        subject: words.subject(department.name),
        heading: words.heading,
        status: words.status,
        paragraphs: [words.intro(department.name, cycle.name)],
        facts,
        action: words.action,
        button,
      },
    });
    if (kind === "over") sent.overBudget = queued > 0;
    else sent.nearLimit = queued > 0;
  }
  return sent;
}
