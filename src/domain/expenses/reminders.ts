import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { emailCopy } from "@/copy/email";
import { expenseEmailCopy as x } from "@/copy/expense-email";
import { expenseDecisions, expenseSubmissions } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { emailBrand } from "@/domain/notifications/notice";
import {
  accountantRecipients,
  boardCover,
  usersWithRole,
  type NamedRecipient,
} from "@/domain/notifications/recipients";
import { daysSetting } from "@/domain/settings";
import { appUrl } from "@/lib/email/layout";
import { enqueueEmail, type Recipient } from "@/lib/email/outbox";
import { formatCAD } from "@/lib/money";
import { requesterGroup } from "./emails";
import { isProcessable } from "./payment";

/**
 * The daily expense reminders (FR-49, last three rows):
 * - waiting for the Board Chair more than `board_reminder_days` (7): the Board Chair (or
 *   Vice-Chair covering) and the accountant;
 * - approved but not processed after `payment_reminder_days` (14): the accountant and the
 *   Church Administrator;
 * - an approved purchase request not bought or claimed after
 *   `unclaimed_purchase_reminder_days` (60): the requester and the Church Administrator.
 * Each repeats weekly while it's still waiting; the outbox's dedupe key makes a repeated
 * run on the same day send nothing new.
 */

const DAY = 86_400_000;

export type ExpenseReminderSummary = { board: number; payment: number; unclaimed: number };

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
    const summary: ExpenseReminderSummary = { board: 0, payment: 0, unclaimed: 0 };

    // Waiting for the Board Chair: since the accountant's latest approval.
    const boardDays = await daysSetting(tx, "board_reminder_days");
    const waiting = await tx
      .select({ e: expenseSubmissions, at: expenseDecisions.createdAt })
      .from(expenseSubmissions)
      .innerJoin(expenseDecisions, eq(expenseDecisions.expenseSubmissionId, expenseSubmissions.id))
      .where(
        and(
          eq(expenseSubmissions.status, "awaiting_board"),
          eq(expenseDecisions.level, "accountant"),
        ),
      )
      .orderBy(asc(expenseSubmissions.submittedAt));
    const latest = new Map<string, { e: Row; at: Date }>();
    for (const w of waiting) {
      const seen = latest.get(w.e.id);
      if (!seen || seen.at < w.at) latest.set(w.e.id, w);
    }
    const overdue = [...latest.values()].filter(
      (w) => now.getTime() - w.at.getTime() > boardDays * DAY,
    );
    // Each Board Chair (or Vice-Chair covering) gets the list of theirs.
    const byPerson = new Map<string, { who: NamedRecipient; rows: Row[] }>();
    for (const { e } of overdue) {
      for (const who of (await boardCover(tx, e, now)).recipients) {
        const entry = byPerson.get(who.userId) ?? { who, rows: [] };
        entry.rows.push(e);
        byPerson.set(who.userId, entry);
      }
    }
    const r = x.reminders.board;
    for (const { who, rows } of byPerson.values()) {
      summary.board += await queueList(tx, {
        template: "expenses.reminder.board",
        audience: "board",
        to: [who],
        subject: r.subject(rows.length),
        heading: r.heading,
        intro: r.intro(boardDays),
        rows,
        action: r.action,
        button: { label: r.button, href: appUrl("/expenses/awaiting-approval") },
        key: `expense-board-reminder:${week}`,
        now,
      });
    }
    summary.board += await queueList(tx, {
      template: "expenses.reminder.board.accountant",
      audience: "accountant",
      to: await accountantRecipients(tx, now),
      subject: r.accountantSubject(overdue.length),
      heading: r.accountantHeading,
      intro: r.intro(boardDays),
      rows: overdue.map((o) => o.e),
      action: r.accountantAction,
      button: { label: x.reviewExpense, href: appUrl("/expenses/review?status=awaiting_board") },
      key: `expense-board-reminder-accountant:${week}`,
      now,
    });

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
