import { eq } from "drizzle-orm";
import { spendingCopy } from "@/copy/spending";
import { spendingEmailCopy as m } from "@/copy/spending-email";
import { departments, spendingEntries, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { emailBrand } from "@/domain/notifications/notice";
import { usersWithRole } from "@/domain/notifications/recipients";
import { getChurchTimeZone } from "@/domain/settings";
import { appUrl } from "@/lib/email/layout";
import { enqueueEmail } from "@/lib/email/outbox";
import { formatCAD } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/time-zone";

/**
 * Every spending entry recorded, corrected or voided by hand emails the Church
 * Administrators, for transparency and record-keeping (decided by the church
 * 2026-10-24). Payments on approved expenses already email them (`expenses.paid`).
 * Queued in the same transaction as the change; sent after commit.
 */

type EntryRow = typeof spendingEntries.$inferSelect;
export type EntryEmailKind = "recorded" | "corrected" | "voided";

const f = m.entry.facts;

export async function queueSpendingEntryEmail(
  tx: Tx,
  input: {
    kind: EntryEmailKind;
    entryId: string;
    actorId: string;
    reason?: string;
    /** For a correction: the amount before. */
    beforeCents?: number;
    now: Date;
  },
): Promise<void> {
  const [row] = await tx
    .select()
    .from(spendingEntries)
    .where(eq(spendingEntries.id, input.entryId));
  const [department] = await tx
    .select({ name: departments.name })
    .from(departments)
    .where(eq(departments.id, row.departmentId));
  const [actor] = await tx
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, input.actorId));
  const zone = await getChurchTimeZone(tx);
  const words = m.entry[input.kind];
  const amount = formatCAD(signed(row));
  const who = actor?.name ?? "";

  await enqueueEmail(tx, {
    template: `spending.entry_${input.kind}`,
    audience: "church_admin",
    to: await usersWithRole(tx, ["church_admin"]),
    brand: await emailBrand(tx),
    cycleId: row.budgetCycleId,
    now: input.now,
    content: {
      subject: words.subject(department.name, amount),
      heading: words.heading,
      status: words.status,
      paragraphs: [words.intro(who, department.name)],
      facts: [
        { label: m.facts.department, value: department.name },
        { label: f.type, value: spendingCopy.types[row.entryType] },
        { label: f.spentOn, value: formatDate(row.spentOn) },
        { label: f.payee, value: row.payee },
        { label: f.description, value: row.description },
        { label: f.amount, value: amount },
        ...(input.beforeCents !== undefined && input.beforeCents !== row.amountCents
          ? [{ label: f.before, value: formatCAD(input.beforeCents) }]
          : []),
        ...(row.paymentMethod
          ? [
              {
                label: f.method,
                value: spendingCopy.methods[row.paymentMethod] ?? row.paymentMethod,
              },
            ]
          : []),
        ...(row.referenceNumber ? [{ label: f.reference, value: row.referenceNumber }] : []),
        ...(input.reason ? [{ label: f.reason, value: input.reason }] : []),
        { label: f.by, value: who },
        { label: f.when, value: formatDateTime(input.now, zone) },
      ],
      action: m.entry.action,
      button: { label: m.entry.button, href: appUrl(`/spending/entries/${row.id}`) },
    },
  });
}

/** A refund reduces spending, so it shows as a negative amount. */
function signed(row: EntryRow): number {
  return row.entryType === "refund" ? -row.amountCents : row.amountCents;
}
