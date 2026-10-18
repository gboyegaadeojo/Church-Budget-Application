import { and, eq, isNull } from "drizzle-orm";
import { emailCopy } from "@/copy/email";
import { smsCopy } from "@/copy/sms";
import { budgetCycles, budgetRequests, deadlineExtensions, departments } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { queueNotice } from "@/domain/notifications/notice";
import {
  accountantRecipients,
  allRepresentatives,
  representativesOf,
} from "@/domain/notifications/recipients";
import { getChurchTimeZone } from "@/domain/settings";
import { appUrl } from "@/lib/email/layout";
import { enqueueSms } from "@/lib/sms/outbox";
import { formatDate, formatDateTime, zonedDate } from "@/lib/time-zone";

/**
 * Budget cycle emails (FR-21 "Cycle and reminders", Requirements 4.3): the cycle opening,
 * closing and reopening, deadline changes and extensions, the 7-day and 1-day reminders,
 * and the accountant's list of departments still outstanding after the deadline.
 */

const m = emailCopy.cycles;
const f = emailCopy.facts;
const s = emailCopy.statuses;
const b = emailCopy.buttons;

type Cycle = { id: string; name: string; submissionDeadline: Date };

const budgetLink = { label: b.startBudget, href: appUrl("/annual") };

/** Active departments in the cycle that haven't submitted, each with its own deadline (4.3). */
export async function outstandingDepartments(tx: Tx, cycle: Cycle) {
  const rows = await tx
    .select({
      id: departments.id,
      name: departments.name,
      status: budgetRequests.status,
      extension: deadlineExtensions.newDeadline,
    })
    .from(departments)
    .leftJoin(
      budgetRequests,
      and(
        eq(budgetRequests.departmentId, departments.id),
        eq(budgetRequests.budgetCycleId, cycle.id),
      ),
    )
    .leftJoin(
      deadlineExtensions,
      and(
        eq(deadlineExtensions.departmentId, departments.id),
        eq(deadlineExtensions.cycleId, cycle.id),
        isNull(deadlineExtensions.supersededAt),
      ),
    )
    .where(eq(departments.status, "active"))
    .orderBy(departments.name);
  return rows
    .filter((r) => r.status === null || r.status === "draft")
    .map((r) => ({ id: r.id, name: r.name, deadline: r.extension ?? cycle.submissionDeadline }));
}

export async function emailCycleStatus(
  tx: Tx,
  cycle: Cycle,
  event: "open" | "close" | "reopen",
  reason?: string,
) {
  const zone = await getChurchTimeZone(tx);
  const deadline = formatDateTime(cycle.submissionDeadline, zone);
  // Opening announces submissions and their deadline. Closing and reopening are about the
  // budget year itself, so they carry no deadline (docs/decisions.md 2026-10-18).
  const facts = [
    { label: f.cycle, value: cycle.name },
    ...(event === "open" ? [{ label: f.deadline, value: deadline }] : []),
  ];
  const content =
    event === "close"
      ? {
          subject: m.closed.subject(cycle.name),
          heading: m.closed.heading(cycle.name),
          status: s.closed,
          paragraphs: [m.closed.intro(cycle.name)],
          action: emailCopy.noAction,
          button: { label: b.openApp, href: appUrl("/spending/my-department") },
        }
      : event === "reopen"
        ? {
            subject: m.reopened.subject(cycle.name),
            heading: m.reopened.heading(cycle.name),
            status: s.reopened,
            paragraphs: [m.reopened.intro(cycle.name)],
            action: m.reopened.action,
            button: { label: b.openApp, href: appUrl("/spending/my-department") },
          }
        : {
            subject: m.opened.subject(cycle.name),
            heading: m.opened.heading(cycle.name),
            status: s.open,
            paragraphs: [m.opened.intro(deadline)],
            action: m.opened.action,
            button: budgetLink,
          };
  await queueNotice(tx, {
    template: `cycle.${event === "open" ? "opened" : event === "close" ? "closed" : "reopened"}`,
    audience: "requester",
    to: await allRepresentatives(tx),
    cycleId: cycle.id,
    content: {
      ...content,
      facts,
      note: reason ? { label: f.reason, text: reason } : undefined,
    },
  });
}

/** Everyone still to submit hears the new date; a department with a later extension doesn't. */
export async function emailDeadlineChanged(tx: Tx, cycle: Cycle, previous: Date, reason: string) {
  const zone = await getChurchTimeZone(tx);
  const deadline = formatDateTime(cycle.submissionDeadline, zone);
  const affected = (await outstandingDepartments(tx, cycle)).filter(
    (d) => d.deadline.getTime() === cycle.submissionDeadline.getTime(),
  );
  await queueNotice(tx, {
    template: "cycle.deadline_changed",
    audience: "requester",
    to: await representativesOf(
      tx,
      affected.map((d) => d.id),
    ),
    cycleId: cycle.id,
    content: {
      subject: m.deadlineChanged.subject(cycle.name, deadline),
      heading: m.deadlineChanged.heading,
      status: s.deadlineChanged,
      paragraphs: [m.deadlineChanged.intro(deadline)],
      facts: [
        { label: f.cycle, value: cycle.name },
        { label: f.previousDeadline, value: formatDateTime(previous, zone) },
        { label: f.newDeadline, value: deadline },
      ],
      note: { label: f.reason, text: reason },
      action: m.deadlineChanged.action,
      button: budgetLink,
    },
  });
}

export async function emailExtension(
  tx: Tx,
  cycle: Cycle,
  department: { id: string; name: string },
  deadline: Date,
  reason: string,
) {
  const zone = await getChurchTimeZone(tx);
  const when = formatDateTime(deadline, zone);
  await queueNotice(tx, {
    template: "cycle.deadline_extended",
    audience: "requester",
    to: await representativesOf(tx, [department.id]),
    cycleId: cycle.id,
    content: {
      subject: m.extended.subject(department.name, when),
      heading: m.extended.heading,
      status: s.deadlineChanged,
      paragraphs: [m.extended.intro(department.name, when)],
      facts: [
        { label: f.department, value: department.name },
        { label: f.cycle, value: cycle.name },
        { label: f.newDeadline, value: when },
      ],
      note: { label: f.reason, text: reason },
      action: m.extended.action,
      button: budgetLink,
    },
  });
}

// ---------------------------------------------------------------- daily reminders job

/** Whole calendar days from `now` to `deadline` in the church's time zone. */
export function daysUntil(now: Date, deadline: Date, zone: string): number {
  const day = (d: Date) => Date.parse(`${zonedDate(d, zone)}T00:00:00Z`);
  return Math.round((day(deadline) - day(now)) / 86_400_000);
}

export const REMINDER_DAYS = [7, 1] as const;

/**
 * Once an open cycle's spending period has ended (blank: Dec 31 of its budget year), the
 * accountants are told once to close the budget year (docs/decisions.md 2026-10-18).
 * Closing stays a person's decision: expenses may still be waiting.
 */
async function remindToClose(
  tx: Tx,
  cycle: typeof budgetCycles.$inferSelect,
  zone: string,
  now: Date,
): Promise<number> {
  const end = cycle.spendingPeriodEnd ?? `${cycle.budgetYear}-12-31`;
  if (zonedDate(now, zone) <= end) return 0;
  return queueNotice(tx, {
    template: "cycle.close_due",
    audience: "accountant",
    to: await accountantRecipients(tx, now),
    cycleId: cycle.id,
    dedupeKey: `close-due:${cycle.id}:${end}`,
    now,
    content: {
      subject: m.closeDue.subject(cycle.name),
      heading: m.closeDue.heading(cycle.name),
      status: s.actionNeeded,
      paragraphs: [m.closeDue.intro(cycle.name, formatDate(end))],
      facts: [{ label: f.cycle, value: cycle.name }],
      action: m.closeDue.action,
      button: { label: m.closeDue.button, href: appUrl(`/spending/year-end?cycle=${cycle.id}`) },
    },
  });
}

export type ReminderSummary = { reminders: number; deadlinePassed: number; closeDue: number };

/**
 * The daily `reminders` job (CLAUDE.md "Scheduled jobs"). Each email has a dedupe key
 * made of the department, its deadline and the day count, so running twice in a day, or
 * missing a day, never sends a reminder twice; a changed deadline gets fresh reminders.
 */
export async function runReminders(db: Db, now: Date = new Date()): Promise<ReminderSummary> {
  const summary: ReminderSummary = { reminders: 0, deadlinePassed: 0, closeDue: 0 };
  const zone = await getChurchTimeZone(db);
  const cycles = await db.select().from(budgetCycles).where(eq(budgetCycles.status, "open"));

  for (const cycle of cycles) {
    await db.transaction(async (tx) => {
      summary.closeDue += await remindToClose(tx, cycle, zone, now);
      const outstanding = await outstandingDepartments(tx, cycle);
      for (const department of outstanding) {
        const days = daysUntil(now, department.deadline, zone);
        if (!(REMINDER_DAYS as readonly number[]).includes(days) || department.deadline <= now) {
          continue;
        }
        const when = formatDateTime(department.deadline, zone);
        const to = await representativesOf(tx, [department.id]);
        const dedupeKey = `reminder:${cycle.id}:${department.id}:${department.deadline.toISOString()}:${days}`;
        await enqueueSms(tx, {
          template: "cycle.reminder",
          userIds: to.map((r) => r.userId),
          body: smsCopy.deadline(days, appUrl("/annual")),
          dedupeKey,
          cycleId: cycle.id,
          now,
        });
        summary.reminders += await queueNotice(tx, {
          template: "cycle.reminder",
          audience: "requester",
          to,
          cycleId: cycle.id,
          dedupeKey,
          now,
          content: {
            subject: m.reminder.subject(cycle.name, days),
            heading: m.reminder.heading(days),
            status: s.reminder,
            paragraphs: [m.reminder.intro(department.name, when)],
            facts: [
              { label: f.department, value: department.name },
              { label: f.cycle, value: cycle.name },
              { label: f.deadline, value: when },
            ],
            action: m.reminder.action,
            button: { label: b.openBudget, href: appUrl("/annual") },
          },
        });
      }

      // Once the cycle's deadline has passed: who is still outstanding (FR-21).
      const late = outstanding.filter((d) => d.deadline <= now);
      if (cycle.submissionDeadline > now || late.length === 0) return;
      const deadline = formatDateTime(cycle.submissionDeadline, zone);
      summary.deadlinePassed += await queueNotice(tx, {
        template: "cycle.deadline_passed",
        audience: "accountant",
        to: await accountantRecipients(tx, now),
        cycleId: cycle.id,
        dedupeKey: `deadline-passed:${cycle.id}:${cycle.submissionDeadline.toISOString()}`,
        now,
        content: {
          subject: m.deadlinePassed.subject(cycle.name, late.length),
          heading: m.deadlinePassed.heading,
          status: s.deadlinePassed,
          paragraphs: [m.deadlinePassed.intro(deadline)],
          list: { heading: m.deadlinePassed.listHeading, items: late.map((d) => d.name) },
          facts: [
            { label: f.cycle, value: cycle.name },
            { label: f.deadline, value: deadline },
          ],
          action: m.deadlinePassed.action,
          button: { label: b.openDashboard, href: appUrl("/annual/review") },
        },
      });
    });
  }
  return summary;
}
