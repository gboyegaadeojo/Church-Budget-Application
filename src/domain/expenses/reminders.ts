import { and, asc, eq, inArray, lte, max } from "drizzle-orm";
import { emailCopy } from "@/copy/email";
import { expenseEmailCopy as x } from "@/copy/expense-email";
import { expenseRevisions, expenseSubmissions } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { emailBrand } from "@/domain/notifications/notice";
import {
  accountantRecipients,
  boardCover,
  usersWithRole,
  type NamedRecipient,
} from "@/domain/notifications/recipients";
import { daysSetting, getChurchTimeZone } from "@/domain/settings";
import { appUrl } from "@/lib/email/layout";
import { enqueueEmail, type Recipient } from "@/lib/email/outbox";
import { formatCAD } from "@/lib/money";
import { zonedDate } from "@/lib/time-zone";
import { requesterGroup } from "./emails";
import { isProcessable } from "./payment";
import { ACCOUNTANT_WAITING, BOARD_WAITING, type ExpenseStatus } from "./status";

/** Waiting for at least one approval (returned ones wait for the department instead). */
const PENDING_APPROVAL: readonly ExpenseStatus[] = [
  "submitted",
  "in_review",
  "awaiting_board",
  "awaiting_accountant",
];

/**
 * The daily expense reminders (FR-49, last three rows):
 * - an approval still needed more than `approval_reminder_days` (5) after it was last
 *   submitted: **every day**, the accountant and the Board Chair (or Vice-Chair covering),
 *   each for the expenses still waiting on them (decided by the church 2026-10-16);
 * - approved but not processed after `payment_reminder_days` (14): the accountant and the
 *   Church Administrator;
 * - an approved purchase request not bought or claimed after
 *   `unclaimed_purchase_reminder_days` (60): the requester and the Church Administrator.
 * The approval reminders repeat daily and the others weekly while still waiting; the
 * outbox's dedupe key makes a repeated run on the same day send nothing new.
 */

const DAY = 86_400_000;

export type ExpenseReminderSummary = {
  /** Approval reminders queued, to the accountant and to the board. */
  approval: number;
  payment: number;
  unclaimed: number;
};

/** "2026-W47": the week a reminder belongs to, so it goes at most once a week. */
function weekKey(now: Date): string {
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  const week = Math.floor((now.getTime() - start) / (7 * DAY));
  return `${now.getUTCFullYear()}-W${week}`;
}

type Row = typeof expenseSubmissions.$inferSelect;

const listItem = (r: Row) =>
  `${r.referenceNumber} · ${r.departmentNameSnapshot} · ${r.title} · ${formatCAD(r.approvedTotalCents ?? r.totalCents ?? 0)}`;

async function queueList(
  tx: Tx,
  input: {
    template: string;
    audience: "board" | "accountant" | "church_admin" | "requester";
    to: Recipient[];
    subject: string;
    heading: string;
    intro: string;
    rows: Row[];
    action: string;
    button: { label: string; href: string };
    key: string;
    now: Date;
  },
) {
  if (input.to.length === 0 || input.rows.length === 0) return 0;
  return enqueueEmail(tx, {
    template: input.template,
    audience: input.audience,
    to: input.to,
    brand: await emailBrand(tx),
    dedupeKey: input.key,
    now: input.now,
    content: {
      subject: input.subject,
      heading: input.heading,
      status: input.heading,
      paragraphs: [input.intro],
      list: { heading: x.facts.title, items: input.rows.map(listItem) },
      action: input.action,
      button: input.button,
    },
  });
}

export async function runExpenseReminders(
  db: Db,
  now: Date = new Date(),
): Promise<ExpenseReminderSummary> {
  return db.transaction(async (tx) => {
    const week = weekKey(now);
    const summary: ExpenseReminderSummary = { approval: 0, payment: 0, unclaimed: 0 };

    // Approvals still needed: since the expense was last submitted (or answered).
    const approvalDays = await daysSetting(tx, "approval_reminder_days");
    const today = zonedDate(now, await getChurchTimeZone(tx));
    const pending = await tx
      .select({ e: expenseSubmissions, at: max(expenseRevisions.createdAt) })
      .from(expenseSubmissions)
      .innerJoin(expenseRevisions, eq(expenseRevisions.expenseSubmissionId, expenseSubmissions.id))
      .where(inArray(expenseSubmissions.status, [...PENDING_APPROVAL]))
      .groupBy(expenseSubmissions.id)
      .orderBy(asc(expenseSubmissions.submittedAt));
    const overdue = pending.filter(
      (p) => p.at !== null && now.getTime() - new Date(p.at).getTime() > approvalDays * DAY,
    );
    const r = x.reminders.approval;

    // The accountant: one list of everything still waiting for their approval.
    const forAccountant = overdue.filter((o) => ACCOUNTANT_WAITING.includes(o.e.status));
    for (const who of await accountantRecipients(tx, now)) {
      summary.approval += await queueList(tx, {
        template: "expenses.reminder.approval.accountant",
        audience: "accountant",
        to: [who],
        subject: r.subject(forAccountant.length),
        heading: r.heading,
        intro: r.intro(approvalDays),
        rows: forAccountant.map((o) => o.e),
        action: r.action,
        button: { label: r.accountantButton, href: appUrl("/expenses/review") },
        key: `expense-approval-reminder:accountant:${who.userId}:${today}`,
        now,
      });
    }

    // The board: each Board Chair (or Vice-Chair covering) gets the list of theirs.
    const byPerson = new Map<string, { who: NamedRecipient; rows: Row[] }>();
    for (const { e } of overdue.filter((o) => BOARD_WAITING.includes(o.e.status))) {
      for (const who of (await boardCover(tx, e, now)).recipients) {
        const entry = byPerson.get(who.userId) ?? { who, rows: [] };
        entry.rows.push(e);
        byPerson.set(who.userId, entry);
      }
    }
    for (const { who, rows } of byPerson.values()) {
      summary.approval += await queueList(tx, {
        template: "expenses.reminder.approval.board",
        audience: "board",
        to: [who],
        subject: r.subject(rows.length),
        heading: r.heading,
        intro: r.intro(approvalDays),
        rows,
        action: r.action,
        button: { label: r.boardButton, href: appUrl("/expenses/awaiting-approval") },
        key: `expense-approval-reminder:board:${who.userId}:${today}`,
        now,
      });
    }

    // Approved but not processed.
    const paymentDays = await daysSetting(tx, "payment_reminder_days");
    const unpaid = (
      await tx
        .select()
        .from(expenseSubmissions)
        .where(
          and(
            inArray(expenseSubmissions.status, ["approved", "processing"]),
            lte(expenseSubmissions.approvedAt, new Date(now.getTime() - paymentDays * DAY)),
          ),
        )
        .orderBy(asc(expenseSubmissions.approvedAt))
    ).filter(isProcessable);
    const p = x.reminders.payment;
    const officeAndAccountant = [
      ...(await accountantRecipients(tx, now)),
      ...(await usersWithRole(tx, ["church_admin"])),
    ];
    summary.payment += await queueList(tx, {
      template: "expenses.reminder.payment",
      audience: "church_admin",
      to: officeAndAccountant,
      subject: p.subject(unpaid.length),
      heading: p.heading,
      intro: p.intro(paymentDays),
      rows: unpaid,
      action: p.action,
      button: { label: p.button, href: appUrl("/expenses/ready") },
      key: `expense-payment-reminder:${week}`,
      now,
    });

    // Approved purchase requests the requester buys themselves, still open.
    const unclaimedDays = await daysSetting(tx, "unclaimed_purchase_reminder_days");
    const open = await tx
      .select()
      .from(expenseSubmissions)
      .where(
        and(
          eq(expenseSubmissions.type, "purchase_request"),
          eq(expenseSubmissions.status, "approved"),
          eq(expenseSubmissions.howBought, "requester_claims"),
          lte(expenseSubmissions.approvedAt, new Date(now.getTime() - unclaimedDays * DAY)),
        ),
      );
    const u = x.reminders.unclaimed;
    for (const e of open) {
      summary.unclaimed += await queueList(tx, {
        template: "expenses.reminder.unclaimed",
        audience: "requester",
        to: await requesterGroup(tx, e),
        subject: u.subject(e.referenceNumber ?? ""),
        heading: u.heading,
        intro: u.intro(unclaimedDays),
        rows: [e],
        action: u.action,
        button: { label: x.viewExpense, href: appUrl(`/expenses/${e.id}`) },
        key: `expense-unclaimed-reminder:${e.id}:${week}`,
        now,
      });
    }
    summary.unclaimed += await queueList(tx, {
      template: "expenses.reminder.unclaimed.church_admin",
      audience: "church_admin",
      to: await usersWithRole(tx, ["church_admin"]),
      subject: u.officeSubject(open.length),
      heading: u.heading,
      intro: u.intro(unclaimedDays),
      rows: open,
      action: emailCopy.noAction,
      button: { label: p.button, href: appUrl("/expenses/ready") },
      key: `expense-unclaimed-reminder-office:${week}`,
      now,
    });
    return summary;
  });
}
