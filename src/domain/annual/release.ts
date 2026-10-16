import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { adminCopy } from "@/copy/admin";
import { annualCopy } from "@/copy/annual";
import { emailCopy } from "@/copy/email";
import {
  approvalDecisions,
  budgetCycles,
  budgetRequests,
  departments,
  idempotencyKeys,
} from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { ConflictError, parseInput, RuleError, ValidationError } from "@/domain/errors";
import { accountantRecipients } from "@/domain/notifications/recipients";
import { queueNotice } from "@/domain/notifications/notice";
import { getChurchTimeZone } from "@/domain/settings";
import { writeAudit, type AuditActor } from "@/lib/audit";
import { assertCan, authorize, type Subject } from "@/lib/authz";
import { appUrl } from "@/lib/email/layout";
import type { Role } from "@/lib/roles";
import { formatDateTime, zonedLocalToUtc } from "@/lib/time-zone";
import { queueAnnualEmails } from "./emails";
import { parseKey, parseVersion, previousResult } from "./service";
import { isSubmitted } from "./status";

/**
 * Scheduled release of annual budget decisions (FR-19a, DRD 6.7b).
 *
 * In Hold mode, an approval or decline is saved and locked when the accountant confirms
 * it, with `released_at` left empty: the staff see it at once, the department keeps
 * seeing In Review and gets no email. At the release time (the 15-minute job), or on
 * Release now, each held decision gets its release time (the one change the history
 * table allows), its audit event and the department's email. Returns are never held.
 */

const e = annualCopy.errors;
const DAY_MS = 86_400_000;
export const RELEASE_MESSAGE_MAX = 1000;

type CycleRow = typeof budgetCycles.$inferSelect;
type ReleaseCycle = Pick<CycleRow, "decisionEmailMode" | "decisionReleaseAt">;

/** Decisions made now are held: Hold mode and the release time still ahead. */
export function isHolding(cycle: ReleaseCycle, now: Date = new Date()): boolean {
  return (
    cycle.decisionEmailMode === "scheduled" &&
    cycle.decisionReleaseAt !== null &&
    now.getTime() < cycle.decisionReleaseAt.getTime()
  );
}

/** How the cycle's decisions reach departments, for banners on the accountant's screens. */
export type CycleRelease = { holding: boolean; releaseAt: Date | null };

export async function cycleRelease(
  tx: Tx,
  cycleId: string,
  now: Date = new Date(),
): Promise<CycleRelease> {
  const [cycle] = await tx
    .select({
      decisionEmailMode: budgetCycles.decisionEmailMode,
      decisionReleaseAt: budgetCycles.decisionReleaseAt,
    })
    .from(budgetCycles)
    .where(eq(budgetCycles.id, cycleId));
  if (!cycle) return { holding: false, releaseAt: null };
  return { holding: isHolding(cycle, now), releaseAt: cycle.decisionReleaseAt };
}

// ---------------------------------------------------------------- held decisions

export type HeldDecision = {
  decisionId: string;
  requestId: string;
  cycleId: string;
  departmentId: string;
  department: string;
  decision: "approved" | "declined";
  reason: string | null;
  approverUserId: string;
  decidedAt: Date;
};

/**
 * Requests whose current decision is an approval or decline not yet released. Only the
 * latest decision counts: one superseded by a reopen is never sent.
 */
export async function heldDecisions(
  tx: Tx,
  where: { cycleId?: string; requestIds?: string[] },
): Promise<HeldDecision[]> {
  if (where.requestIds && where.requestIds.length === 0) return [];
  const latest = await tx
    .selectDistinctOn([approvalDecisions.budgetRequestId], {
      decisionId: approvalDecisions.id,
      requestId: approvalDecisions.budgetRequestId,
      decision: approvalDecisions.decision,
      reason: approvalDecisions.decisionReason,
      approverUserId: approvalDecisions.approverUserId,
      releasedAt: approvalDecisions.releasedAt,
      decidedAt: approvalDecisions.createdAt,
      cycleId: budgetRequests.budgetCycleId,
      departmentId: budgetRequests.departmentId,
      department: budgetRequests.departmentNameSnapshot,
      status: budgetRequests.status,
    })
    .from(approvalDecisions)
    .innerJoin(budgetRequests, eq(budgetRequests.id, approvalDecisions.budgetRequestId))
    .where(
      and(
        where.cycleId ? eq(budgetRequests.budgetCycleId, where.cycleId) : undefined,
        where.requestIds ? inArray(budgetRequests.id, where.requestIds) : undefined,
      ),
    )
    .orderBy(approvalDecisions.budgetRequestId, desc(approvalDecisions.createdAt));
  return latest
    .filter(
      (d) =>
        d.releasedAt === null &&
        (d.decision === "approved" || d.decision === "declined") &&
        d.status === d.decision,
    )
    .map((d) => ({
      decisionId: d.decisionId,
      requestId: d.requestId,
      cycleId: d.cycleId,
      departmentId: d.departmentId,
      department: d.department,
      decision: d.decision as "approved" | "declined",
      reason: d.reason,
      approverUserId: d.approverUserId,
      decidedAt: d.decidedAt,
    }))
    .sort((a, b) => a.department.localeCompare(b.department));
}

/**
 * For each held request the viewer may not see yet, its cycle's release time. Staff
 * (`annual.view_held`) see decisions as soon as they're made, so they get an empty map.
 */
export async function hiddenDecisions(
  tx: Tx,
  viewer: Subject,
  requestIds: string[],
): Promise<Map<string, Date | null>> {
  if (requestIds.length === 0 || authorize(viewer, "annual.view_held").allowed) return new Map();
  const held = await heldDecisions(tx, { requestIds });
  if (held.length === 0) return new Map();
  const cycles = await tx
    .select({ id: budgetCycles.id, releaseAt: budgetCycles.decisionReleaseAt })
    .from(budgetCycles)
    .where(
      inArray(
        budgetCycles.id,
        held.map((h) => h.cycleId),
      ),
    );
  const releaseOf = new Map(cycles.map((c) => [c.id, c.releaseAt]));
  return new Map(held.map((h) => [h.requestId, releaseOf.get(h.cycleId) ?? null]));
}

/**
 * Releases every held decision of the cycle: records the release time on each (once),
 * audits it and queues the department's email with the shared message. Safe to run
 * twice at once: a decision another run released is skipped.
 */
export async function releaseHeld(
  tx: Tx,
  cycle: Pick<CycleRow, "id" | "releaseMessage">,
  actor: AuditActor,
  now: Date,
): Promise<number> {
  let released = 0;
  for (const held of await heldDecisions(tx, { cycleId: cycle.id })) {
    const updated = await tx
      .update(approvalDecisions)
      .set({ releasedAt: now })
      .where(and(eq(approvalDecisions.id, held.decisionId), isNull(approvalDecisions.releasedAt)))
      .returning({ id: approvalDecisions.id });
    if (updated.length === 0) continue;
    released += 1;
    await writeAudit(tx, {
      actor,
      area: "annual",
      eventType: "annual.decision_released",
      entity: { type: "budget_request", id: held.requestId },
      budgetRequestId: held.requestId,
      departmentId: held.departmentId,
      cycleId: cycle.id,
      details: {
        decisionId: held.decisionId,
        decision: held.decision,
        decidedAt: held.decidedAt.toISOString(),
        releasedAt: now.toISOString(),
      },
    });
    await queueAnnualEmails(
      tx,
      held.requestId,
      held.approverUserId,
      held.decision === "approved"
        ? { kind: "approved" }
        : { kind: "declined", reason: held.reason ?? "" },
      { now, only: "requester", releaseMessage: cycle.releaseMessage, decidedAt: held.decidedAt },
    );
  }
  return released;
}

// ---------------------------------------------------------------- the overview (DRD 6.7b)

export type ReleaseOverview = {
  cycle: {
    id: string;
    name: string;
    version: number;
    status: string;
    mode: "immediate" | "scheduled";
    releaseAt: Date | null;
    message: string | null;
  };
  holding: boolean;
  counts: { approved: number; declined: number; undecided: number; notSubmitted: number };
  /** Who gets which email at release. */
  held: { requestId: string; department: string; decision: "approved" | "declined" }[];
  undecided: string[];
  notSubmitted: string[];
  /** The viewer may change the schedule (accountant or backup approver). */
  canChange: boolean;
};

/** The cycle's release card: counts, held decisions and who hasn't been decided. */
export async function getReleaseOverview(
  tx: Tx,
  viewer: Subject,
  cycleId: string,
  now: Date = new Date(),
): Promise<ReleaseOverview | null> {
  if (!authorize(viewer, "annual.review").allowed) return null;
  if (!z.uuid().safeParse(cycleId).success) return null;
  const [cycle] = await tx.select().from(budgetCycles).where(eq(budgetCycles.id, cycleId));
  if (!cycle) return null;
  const progress = await releaseProgress(tx, cycle.id);
  return {
    cycle: {
      id: cycle.id,
      name: cycle.name,
      version: cycle.version,
      status: cycle.status,
      mode: cycle.decisionEmailMode,
      releaseAt: cycle.decisionReleaseAt,
      message: cycle.releaseMessage,
    },
    holding: isHolding(cycle, now),
    ...progress,
    canChange: authorize(viewer, "annual.release").allowed,
  };
}

async function releaseProgress(tx: Tx, cycleId: string) {
  const requests = await tx
    .select({
      departmentId: budgetRequests.departmentId,
      status: budgetRequests.status,
      department: budgetRequests.departmentNameSnapshot,
    })
    .from(budgetRequests)
    .where(eq(budgetRequests.budgetCycleId, cycleId));
  const active = await tx
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(eq(departments.status, "active"))
    .orderBy(asc(departments.name));
  const submitted = requests.filter((r) => isSubmitted(r.status));
  const decided = (s: string) => s === "approved" || s === "declined" || s === "closed";
  const undecided = submitted
    .filter((r) => !decided(r.status))
    .map((r) => r.department)
    .sort((a, b) => a.localeCompare(b));
  const withSubmission = new Set(submitted.map((r) => r.departmentId));
  const notSubmitted = active.filter((d) => !withSubmission.has(d.id)).map((d) => d.name);
  const held = (await heldDecisions(tx, { cycleId })).map((h) => ({
    requestId: h.requestId,
    department: h.department,
    decision: h.decision,
  }));
  return {
    counts: {
      approved: submitted.filter((r) => r.status === "approved" || r.status === "closed").length,
      declined: submitted.filter((r) => r.status === "declined").length,
      undecided: undecided.length,
      notSubmitted: notSubmitted.length,
    },
    held,
    undecided,
    notSubmitted,
  };
}

// ---------------------------------------------------------------- the accountant's changes

const scheduleSchema = z.object({
  mode: z.enum(["immediate", "scheduled"]),
  releaseAt: z.string().trim().optional(),
  message: z
    .string()
    .trim()
    .max(RELEASE_MESSAGE_MAX, e.releaseMessageTooLong)
    .optional()
    .transform((m) => (m ? m : null)),
});

async function loadCycle(tx: Tx, id: string): Promise<CycleRow> {
  const [row] = z.uuid().safeParse(id).success
    ? await tx.select().from(budgetCycles).where(eq(budgetCycles.id, id)).for("update").limit(1)
    : [];
  if (!row) throw new RuleError(adminCopy.common.notFound);
  return row;
}

async function bumpCycle(
  tx: Tx,
  cycle: CycleRow,
  version: number,
  actorId: string,
  set: Partial<typeof budgetCycles.$inferInsert>,
) {
  const rows = await tx
    .update(budgetCycles)
    .set({
      ...set,
      updatedByUserId: actorId,
      version: sql`${budgetCycles.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(budgetCycles.id, cycle.id), eq(budgetCycles.version, version)))
    .returning({ id: budgetCycles.id });
  if (rows.length === 0) throw new ConflictError({ type: "budget_cycle", id: cycle.id });
}

const userActor = (actor: Subject, actingRole: Role): AuditActor => ({
  kind: "user",
  userId: actor.id,
  actingRole,
});

export type ScheduleResult = { mode: "immediate" | "scheduled"; released: number };

/**
 * Sets how the cycle's decisions reach departments: Send immediately, or Hold until a
 * church-local date and time with an optional shared message. Changing back to Send
 * immediately (Cancel schedule) sends the decisions held so far straight away, so none
 * is left unsent; the confirmation on screen gives the count first.
 */
export async function setReleaseSchedule(
  tx: Tx,
  actor: Subject,
  input: {
    cycleId: string;
    version: unknown;
    mode: unknown;
    releaseAt?: unknown;
    message?: unknown;
  },
  { now = new Date() }: { now?: Date } = {},
): Promise<ScheduleResult> {
  const { actingRole } = assertCan(actor, "annual.release");
  const version = parseVersion(input.version);
  const cycle = await loadCycle(tx, input.cycleId);
  const parsed = parseInput(scheduleSchema, {
    mode: input.mode,
    releaseAt: input.releaseAt ?? undefined,
    message: input.message ?? undefined,
  });
  const by = userActor(actor, actingRole);

  if (parsed.mode === "immediate") {
    if (cycle.decisionEmailMode === "immediate") throw new RuleError(e.notHolding);
    await bumpCycle(tx, cycle, version, actor.id, {
      decisionEmailMode: "immediate",
      decisionReleaseAt: null,
    });
    const released = await releaseHeld(tx, cycle, by, now);
    await writeAudit(tx, {
      actor: by,
      area: "annual",
      eventType: "annual.release_cancelled",
      entity: { type: "budget_cycle", id: cycle.id },
      cycleId: cycle.id,
      details: {
        before: { mode: cycle.decisionEmailMode, releaseAt: iso(cycle.decisionReleaseAt) },
        after: { mode: "immediate", releaseAt: null },
        released,
      },
    });
    return { mode: "immediate", released };
  }

  if (cycle.status !== "open") throw new RuleError(e.releaseCycleNotOpen);
  if (!parsed.releaseAt) throw new ValidationError({ releaseAt: e.releaseAtRequired });
  const releaseAt = zonedLocalToUtc(parsed.releaseAt, await getChurchTimeZone(tx));
  if (!releaseAt) throw new ValidationError({ releaseAt: e.releaseAtInvalid });
  if (releaseAt.getTime() <= now.getTime()) {
    throw new ValidationError({ releaseAt: e.releaseAtFuture });
  }
  await bumpCycle(tx, cycle, version, actor.id, {
    decisionEmailMode: "scheduled",
    decisionReleaseAt: releaseAt,
    releaseMessage: parsed.message,
  });
  await writeAudit(tx, {
    actor: by,
    area: "annual",
    eventType: "annual.release_scheduled",
    entity: { type: "budget_cycle", id: cycle.id },
    cycleId: cycle.id,
    details: {
      before: {
        mode: cycle.decisionEmailMode,
        releaseAt: iso(cycle.decisionReleaseAt),
        message: cycle.releaseMessage,
      },
      after: { mode: "scheduled", releaseAt: releaseAt.toISOString(), message: parsed.message },
    },
  });
  return { mode: "scheduled", released: 0 };
}

export type ReleaseNowResult = { released: number; releasedAt: string };

/**
 * Release now (AC-19): every held decision goes out at once, and the release time
 * becomes now, so decisions made afterwards are sent immediately.
 */
export async function releaseNow(
  tx: Tx,
  actor: Subject,
  input: { cycleId: string; version: unknown; idempotencyKey: unknown },
  { now = new Date() }: { now?: Date } = {},
): Promise<ReleaseNowResult> {
  const key = parseKey(input.idempotencyKey);
  const repeat = await previousResult<ReleaseNowResult>(tx, key, actor, "annual.release_now");
  if (repeat) return repeat;
  const { actingRole } = assertCan(actor, "annual.release");
  const version = parseVersion(input.version);
  const cycle = await loadCycle(tx, input.cycleId);
  if (!isHolding(cycle, now)) throw new RuleError(e.notHolding);
  const by = userActor(actor, actingRole);

  await bumpCycle(tx, cycle, version, actor.id, { decisionReleaseAt: now });
  const released = await releaseHeld(tx, cycle, by, now);
  await writeAudit(tx, {
    actor: by,
    area: "annual",
    eventType: "annual.released_now",
    entity: { type: "budget_cycle", id: cycle.id },
    cycleId: cycle.id,
    details: {
      before: { releaseAt: iso(cycle.decisionReleaseAt) },
      after: { releaseAt: now.toISOString() },
      released,
    },
  });
  const result = { released, releasedAt: now.toISOString() };
  await tx.insert(idempotencyKeys).values({
    key,
    userId: actor.id,
    action: "annual.release_now",
    entityId: cycle.id,
    result,
  });
  return result;
}

// ---------------------------------------------------------------- the 15-minute job

export type ReleaseJobSummary = { released: number; warnings: number; summaries: number };

/**
 * The `release-decisions` job: releases cycles whose time has come and, a day ahead,
 * warns the accountants if departments are still undecided. Each warning and each
 * release summary is queued once per release time, so repeated runs send nothing new.
 */
export async function runScheduledReleases(
  db: Db,
  now: Date = new Date(),
): Promise<ReleaseJobSummary> {
  const summary: ReleaseJobSummary = { released: 0, warnings: 0, summaries: 0 };
  const cycles = await db
    .select()
    .from(budgetCycles)
    .where(
      and(
        eq(budgetCycles.decisionEmailMode, "scheduled"),
        lte(budgetCycles.decisionReleaseAt, new Date(now.getTime() + DAY_MS)),
      ),
    );
  for (const listed of cycles) {
    await db.transaction(async (tx) => {
      const cycle = await loadCycle(tx, listed.id);
      if (cycle.decisionEmailMode !== "scheduled" || !cycle.decisionReleaseAt) return;
      const releaseAt = cycle.decisionReleaseAt;
      const due = releaseAt.getTime() <= now.getTime();
      const zone = await getChurchTimeZone(tx);
      const when = formatDateTime(releaseAt, zone);
      const progress = await releaseProgress(tx, cycle.id);
      const outstanding = [
        ...progress.undecided.map((d) => `${d}: ${emailCopy.annual.releaseWarning.undecided}`),
        ...progress.notSubmitted.map(
          (d) => `${d}: ${emailCopy.annual.releaseWarning.notSubmitted}`,
        ),
      ];

      if (!due) {
        if (outstanding.length === 0) return;
        const w = emailCopy.annual.releaseWarning;
        summary.warnings += await queueNotice(tx, {
          template: "annual.release_warning",
          audience: "accountant",
          to: await accountantRecipients(tx, now),
          cycleId: cycle.id,
          dedupeKey: `release-warning:${cycle.id}:${releaseAt.toISOString()}`,
          now,
          content: {
            subject: w.subject(cycle.name, when),
            heading: w.heading,
            status: emailCopy.statuses.reminder,
            paragraphs: [w.intro(cycle.name, when)],
            list: { heading: w.heading, items: outstanding },
            action: w.action,
            button: { label: w.button, href: appUrl("/annual/release") },
          },
        });
        return;
      }

      const released = await releaseHeld(tx, cycle, { kind: "job" }, now);
      summary.released += released;
      const r = emailCopy.annual.released;
      summary.summaries += await queueNotice(tx, {
        template: "annual.released",
        audience: "accountant",
        to: await accountantRecipients(tx, now),
        cycleId: cycle.id,
        dedupeKey: `release-done:${cycle.id}:${releaseAt.toISOString()}`,
        now,
        content: {
          subject: r.subject(cycle.name, released),
          heading: r.heading,
          status: emailCopy.statuses.forYourRecords,
          paragraphs: [r.intro(cycle.name, formatDateTime(now, zone))],
          facts: [{ label: r.released, value: String(released) }],
          ...(outstanding.length > 0 ? { list: { heading: r.undecided, items: outstanding } } : {}),
          action: r.action,
          button: { label: r.button, href: appUrl("/annual/release") },
        },
      });
    });
  }
  return summary;
}

const iso = (d: Date | null) => d?.toISOString() ?? null;
