import { and, desc, eq, inArray } from "drizzle-orm";
import { emailCopy } from "@/copy/email";
import {
  approvalDecisions,
  budgetCycles,
  budgetRequests,
  emailOutbox,
  userDepartments,
  users,
} from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { queueNotice } from "@/domain/notifications/notice";
import { readSettings } from "@/domain/settings";
import { departmentCover } from "@/domain/users/away";
import { appUrl } from "@/lib/email/layout";

/**
 * Reminders for an unanswered clarification (FR-38, AC-118): the Primary first, a day
 * after the question; once the escalation delay has passed (Settings, default 3 days)
 * the Backups too (at once while the Primary is Away), and the task then shows "Backup
 * reminded". Each goes once per
 * question, so a daily job run twice sends nothing new.
 */

const m = emailCopy.annual.clarifyReminder;
const DAY_MS = 86_400_000;

export const backupReminderKey = (decisionId: string) => `clarify-backup:${decisionId}`;

type Waiting = {
  requestId: string;
  departmentId: string;
  department: string;
  cycle: string;
  reference: string;
  decisionId: string;
  askedAt: Date;
};

/** Returned requests in open cycles, with the question that's waiting. */
async function waitingQuestions(tx: Tx): Promise<Waiting[]> {
  const returned = await tx
    .select({
      requestId: budgetRequests.id,
      departmentId: budgetRequests.departmentId,
      department: budgetRequests.departmentNameSnapshot,
      cycle: budgetCycles.name,
      reference: budgetRequests.referenceNumber,
    })
    .from(budgetRequests)
    .innerJoin(budgetCycles, eq(budgetCycles.id, budgetRequests.budgetCycleId))
    .where(and(eq(budgetRequests.status, "returned"), eq(budgetCycles.status, "open")));
  const out: Waiting[] = [];
  for (const r of returned) {
    const [question] = await tx
      .select({ id: approvalDecisions.id, at: approvalDecisions.createdAt })
      .from(approvalDecisions)
      .where(
        and(
          eq(approvalDecisions.budgetRequestId, r.requestId),
          inArray(approvalDecisions.decision, ["returned", "reopened"]),
        ),
      )
      .orderBy(desc(approvalDecisions.createdAt))
      .limit(1);
    if (question && r.reference) {
      out.push({ ...r, reference: r.reference, decisionId: question.id, askedAt: question.at });
    }
  }
  return out;
}

async function leaders(tx: Tx, departmentId: string, type: "primary" | "backup") {
  return tx
    .select({ userId: users.id, email: users.email })
    .from(userDepartments)
    .innerJoin(users, eq(users.id, userDepartments.userId))
    .where(
      and(
        eq(userDepartments.departmentId, departmentId),
        eq(userDepartments.representativeType, type),
        eq(users.active, true),
        eq(users.accessStatus, "active"),
      ),
    );
}

export async function runClarificationReminders(
  db: Db,
  now: Date = new Date(),
): Promise<{ primary: number; backups: number }> {
  const summary = { primary: 0, backups: 0 };
  await db.transaction(async (tx) => {
    const { backup_escalation_days } = await readSettings(tx, ["backup_escalation_days"]);
    const escalateAfter = Math.max(1, Number.parseInt(backup_escalation_days, 10) || 3);
    for (const q of await waitingQuestions(tx)) {
      const days = Math.floor((now.getTime() - q.askedAt.getTime()) / DAY_MS);
      if (days < 1) continue;
      const content = (intro: string) => ({
        subject: m.subject(q.department, q.cycle, q.reference),
        heading: m.heading,
        status: emailCopy.statuses.reminder,
        paragraphs: [intro],
        facts: [
          { label: emailCopy.facts.department, value: q.department },
          { label: emailCopy.annual.facts.reference, value: q.reference },
        ],
        action: m.action,
        button: { label: emailCopy.annual.returned.button, href: appUrl(`/annual/${q.requestId}`) },
      });
      summary.primary += await queueNotice(tx, {
        template: "annual.clarification_reminder",
        audience: "requester",
        to: await leaders(tx, q.departmentId, "primary"),
        budgetRequestId: q.requestId,
        dedupeKey: `clarify-primary:${q.decisionId}`,
        now,
        content: content(m.intro(days)),
      });
      // While the Primary is Away, the Backups are reminded from the first day (FR-38, AC-119).
      const primaryAway = (await departmentCover(tx, q.departmentId, now)).away;
      if (days >= escalateAfter || primaryAway) {
        summary.backups += await queueNotice(tx, {
          template: "annual.clarification_backup_reminder",
          audience: "requester",
          to: await leaders(tx, q.departmentId, "backup"),
          budgetRequestId: q.requestId,
          dedupeKey: backupReminderKey(q.decisionId),
          now,
          content: content(m.backupIntro(days)),
        });
      }
    }
  });
  return summary;
}

/**
 * Requests whose Backups have been reminded about the question now waiting (for My
 * tasks). A reminder about an earlier question doesn't count.
 */
export async function backupsReminded(tx: Tx, requestIds: string[]): Promise<Set<string>> {
  if (requestIds.length === 0) return new Set();
  const decisions = await tx
    .select({
      requestId: approvalDecisions.budgetRequestId,
      id: approvalDecisions.id,
      at: approvalDecisions.createdAt,
    })
    .from(approvalDecisions)
    .where(
      and(
        inArray(approvalDecisions.budgetRequestId, requestIds),
        inArray(approvalDecisions.decision, ["returned", "reopened"]),
      ),
    )
    .orderBy(desc(approvalDecisions.createdAt));
  const latest = new Map<string, string>();
  for (const d of decisions) if (!latest.has(d.requestId)) latest.set(d.requestId, d.id);
  if (latest.size === 0) return new Set();
  const sent = await tx
    .selectDistinct({ key: emailOutbox.dedupeKey })
    .from(emailOutbox)
    .where(inArray(emailOutbox.dedupeKey, [...latest.values()].map(backupReminderKey)));
  const keys = new Set(sent.map((r) => r.key));
  return new Set([...latest].filter(([, id]) => keys.has(backupReminderKey(id))).map(([r]) => r));
}
