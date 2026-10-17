import { and, asc, desc, eq, inArray, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { spendingCopy } from "@/copy/spending";
import { spendingEmailCopy as m } from "@/copy/spending-email";
import { budgetCycles, expenseSubmissions, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { actorOf, parseKey, parseVersion, previousResult } from "@/domain/annual/service";
import { ConflictError, parseInput, RuleError } from "@/domain/errors";
import { queueExpenseEmails } from "@/domain/expenses/emails";
import { approvedAnnualBudget } from "@/domain/expenses/budget";
import { auditBase, loadExpense, storeIdempotent, updateExpense } from "@/domain/expenses/service";
import { PENDING_STATUSES, type ExpenseStatus, type ExpenseType } from "@/domain/expenses/status";
import { emailBrand } from "@/domain/notifications/notice";
import { usersWithRole } from "@/domain/notifications/recipients";
import { writeAudit } from "@/lib/audit";
import { assertCan, authorize, type Subject } from "@/lib/authz";
import { appUrl } from "@/lib/email/layout";
import { enqueueEmail } from "@/lib/email/outbox";
import { reasonSchema } from "./schema";

/**
 * The year-end lock (FR-29, FR-46, AC-90). The accountant locks a cycle's spending once
 * the year's money has settled; then nobody records, corrects or voids its entries, and
 * no new expenses go to that year. Reopening needs a reason. Both are audited and the
 * Church Administrators are told, since they record spending.
 *
 * Locking is refused while an expense for the year still waits for a decision or a
 * payment: approving or paying it would add to a locked ledger. Approved purchase
 * requests not yet bought are listed after the lock for the accountant to cancel or
 * carry into next year's budget with a reason (the commitment moves with it).
 */

const y = spendingCopy.yearEnd;

export type YearEndItem = {
  id: string;
  reference: string | null;
  title: string;
  type: ExpenseType;
  status: ExpenseStatus;
  department: string;
  departmentId: string;
  amountCents: number;
  version: number;
  /** Carry-over needs next year's approved budget for the department. */
  nextHasBudget: boolean;
};

export type YearEnd = {
  cycles: { id: string; name: string; locked: boolean }[];
  cycle: {
    id: string;
    name: string;
    budgetYear: number;
    version: number;
    lockedAt: Date | null;
    lockedBy: string | null;
  };
  next: { id: string; name: string; locked: boolean } | null;
  awaitingDecision: YearEndItem[];
  awaitingPayment: YearEndItem[];
  openPurchases: YearEndItem[];
  /** Purchase requests carried into this year from the last. */
  carriedIn: (YearEndItem & { reason: string })[];
  canLock: boolean;
};

async function items(
  tx: Tx,
  cycleId: string,
  where: SQL | undefined,
  next: { id: string } | null,
): Promise<YearEndItem[]> {
  const rows = await tx
    .select({
      id: expenseSubmissions.id,
      reference: expenseSubmissions.referenceNumber,
      title: expenseSubmissions.title,
      type: expenseSubmissions.type,
      status: expenseSubmissions.status,
      department: expenseSubmissions.departmentNameSnapshot,
      departmentId: expenseSubmissions.departmentId,
      approved: expenseSubmissions.approvedTotalCents,
      total: expenseSubmissions.totalCents,
      version: expenseSubmissions.version,
    })
    .from(expenseSubmissions)
    .where(and(eq(expenseSubmissions.budgetCycleId, cycleId), where))
    .orderBy(asc(expenseSubmissions.departmentNameSnapshot), asc(expenseSubmissions.submittedAt));
  const out: YearEndItem[] = [];
  for (const r of rows) {
    out.push({
      id: r.id,
      reference: r.reference,
      title: r.title,
      type: r.type,
      status: r.status,
      department: r.department,
      departmentId: r.departmentId,
      amountCents: r.approved ?? r.total ?? 0,
      version: r.version,
      nextHasBudget: next
        ? (await approvedAnnualBudget(tx, next.id, r.departmentId)) !== null
        : false,
    });
  }
  return out;
}

/** Expenses that must be decided or paid before the year can be locked. */
const awaitingDecisionWhere = () => inArray(expenseSubmissions.status, [...PENDING_STATUSES]);
const awaitingPaymentWhere = () =>
  or(
    and(
      eq(expenseSubmissions.type, "expense_claim"),
      inArray(expenseSubmissions.status, ["approved", "processing"]),
    ),
    and(
      eq(expenseSubmissions.type, "purchase_request"),
      eq(expenseSubmissions.status, "processing"),
    ),
  );
const openPurchaseWhere = () =>
  and(eq(expenseSubmissions.type, "purchase_request"), eq(expenseSubmissions.status, "approved"));

async function nextCycleOf(tx: Tx, budgetYear: number) {
  const [next] = await tx
    .select()
    .from(budgetCycles)
    .where(eq(budgetCycles.budgetYear, budgetYear + 1))
    .limit(1);
  return next ?? null;
}

/** The year-end page; null when the person can't lock spending. */
export async function yearEndView(
  tx: Tx,
  viewer: Subject,
  cycleId?: string,
): Promise<YearEnd | null> {
  if (!authorize(viewer, "spending.lock").allowed) return null;
  const all = await tx.select().from(budgetCycles).orderBy(desc(budgetCycles.budgetYear));
  // The year most likely to need closing: the latest whose budget year has ended.
  const thisYear = new Date().getUTCFullYear();
  const chosen =
    all.find((c) => c.id === cycleId) ??
    all.find((c) => c.budgetYear === thisYear - 1) ??
    all.find((c) => c.budgetYear === thisYear) ??
    all[0];
  if (!chosen) return null;
  const nextRow = await nextCycleOf(tx, chosen.budgetYear);
  const next = nextRow
    ? { id: nextRow.id, name: nextRow.name, locked: nextRow.spendingLockedAt !== null }
    : null;
  const [lockedBy] = chosen.spendingLockedByUserId
    ? await tx
        .select({ name: users.displayName })
        .from(users)
        .where(eq(users.id, chosen.spendingLockedByUserId))
    : [];
  const carried = await tx
    .select({ id: expenseSubmissions.id, reason: expenseSubmissions.carryOverReason })
    .from(expenseSubmissions)
    .where(
      and(
        eq(expenseSubmissions.budgetCycleId, chosen.id),
        // A carry-over always comes from the year before.
        inArray(
          expenseSubmissions.carriedOverFromCycleId,
          all.filter((c) => c.budgetYear === chosen.budgetYear - 1).map((c) => c.id),
        ),
      ),
    );
  const carriedIn = carried.length
    ? (
        await items(
          tx,
          chosen.id,
          inArray(
            expenseSubmissions.id,
            carried.map((c) => c.id),
          ),
          null,
        )
      ).map((i) => ({ ...i, reason: carried.find((c) => c.id === i.id)?.reason ?? "" }))
    : [];
  return {
    cycles: all.map((c) => ({ id: c.id, name: c.name, locked: c.spendingLockedAt !== null })),
    cycle: {
      id: chosen.id,
      name: chosen.name,
      budgetYear: chosen.budgetYear,
      version: chosen.version,
      lockedAt: chosen.spendingLockedAt,
      lockedBy: lockedBy?.name ?? null,
    },
    next,
    awaitingDecision: await items(tx, chosen.id, awaitingDecisionWhere(), next),
    awaitingPayment: await items(tx, chosen.id, awaitingPaymentWhere(), next),
    openPurchases: await items(tx, chosen.id, openPurchaseWhere(), next),
    carriedIn,
    canLock: true,
  };
}

async function loadCycleForUpdate(tx: Tx, id: unknown) {
  const parsed = z.uuid().safeParse(id);
  const [cycle] = parsed.success
    ? await tx.select().from(budgetCycles).where(eq(budgetCycles.id, parsed.data)).for("update")
    : [];
  if (!cycle) throw new RuleError(spendingCopy.errors.cycleNotFound);
  return cycle;
}

async function tellOffice(
  tx: Tx,
  cycle: { id: string; name: string },
  kind: "locked" | "reopened",
  facts: { label: string; value: string }[],
  now: Date,
) {
  const words = kind === "locked" ? m.locked : m.reopened;
  await enqueueEmail(tx, {
    template: `spending.${kind}`,
    audience: "church_admin",
    to: await usersWithRole(tx, ["church_admin"]),
    brand: await emailBrand(tx),
    cycleId: cycle.id,
    now,
    content: {
      subject: words.subject(cycle.name),
      heading: words.heading,
      status: words.status,
      paragraphs: [words.intro(cycle.name)],
      facts: [{ label: m.facts.cycle, value: cycle.name }, ...facts],
      action: words.action,
      button: { label: m.button, href: appUrl("/spending") },
    },
  });
}

export type LockResult = { cycleId: string; locked: boolean };

/** Locks the cycle's spending (FR-29). */
export async function lockSpending(
  tx: Tx,
  actor: Subject,
  input: { cycleId: unknown; version: unknown; idempotencyKey: unknown },
  { now = new Date() }: { now?: Date } = {},
): Promise<LockResult> {
  const key = parseKey(input.idempotencyKey);
  const repeat = await previousResult<LockResult>(tx, key, actor, "spending.lock");
  if (repeat) return repeat;
  const { actingRole } = assertCan(actor, "spending.lock");
  const version = parseVersion(input.version);
  const cycle = await loadCycleForUpdate(tx, input.cycleId);
  if (cycle.version !== version) throw new ConflictError({ type: "budget_cycle", id: cycle.id });
  if (cycle.spendingLockedAt) throw new RuleError(y.errors.alreadyLocked(cycle.name));

  const [waiting, unpaid] = await Promise.all([
    items(tx, cycle.id, awaitingDecisionWhere(), null),
    items(tx, cycle.id, awaitingPaymentWhere(), null),
  ]);
  if (waiting.length || unpaid.length) {
    throw new RuleError(y.errors.notSettled(waiting.length, unpaid.length));
  }

  await tx
    .update(budgetCycles)
    .set({
      spendingLockedAt: now,
      spendingLockedByUserId: actor.id,
      version: cycle.version + 1,
      updatedAt: now,
    })
    .where(eq(budgetCycles.id, cycle.id));
  const open = await items(tx, cycle.id, openPurchaseWhere(), null);
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "spending",
    eventType: "spending.period_locked",
    entity: { type: "budget_cycle", id: cycle.id },
    cycleId: cycle.id,
    details: {
      before: { spendingLockedAt: null },
      after: { spendingLockedAt: now.toISOString() },
      openPurchaseRequests: open.map((o) => o.id),
    },
  });
  await tellOffice(tx, cycle, "locked", [], now);
  return storeIdempotent(tx, key, actor, "spending.lock", cycle.id, {
    cycleId: cycle.id,
    locked: true,
  });
}

/** Reopens a locked cycle's spending, with a reason (FR-29). */
export async function reopenSpending(
  tx: Tx,
  actor: Subject,
  input: { cycleId: unknown; version: unknown; reason: unknown },
  { now = new Date() }: { now?: Date } = {},
): Promise<LockResult> {
  const { actingRole } = assertCan(actor, "spending.lock");
  const version = parseVersion(input.version);
  const { reason } = parseInput(z.object({ reason: reasonSchema }), { reason: input.reason });
  const cycle = await loadCycleForUpdate(tx, input.cycleId);
  if (cycle.version !== version) throw new ConflictError({ type: "budget_cycle", id: cycle.id });
  if (!cycle.spendingLockedAt) throw new RuleError(y.errors.notLocked(cycle.name));
  await tx
    .update(budgetCycles)
    .set({
      spendingLockedAt: null,
      spendingLockedByUserId: null,
      version: cycle.version + 1,
      updatedAt: now,
    })
    .where(eq(budgetCycles.id, cycle.id));
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "spending",
    eventType: "spending.period_reopened",
    entity: { type: "budget_cycle", id: cycle.id },
    cycleId: cycle.id,
    reason,
    details: {
      before: { spendingLockedAt: cycle.spendingLockedAt.toISOString() },
      after: { spendingLockedAt: null },
    },
  });
  await tellOffice(tx, cycle, "reopened", [{ label: m.facts.reason, value: reason }], now);
  return { cycleId: cycle.id, locked: false };
}

export type CarryOverResult = { expenseId: string; cycleId: string };

/**
 * Carries an approved purchase request from a locked year into the next year's budget
 * (FR-46): its commitment leaves the old year and counts against the new one. It stays
 * Approved, keeps its reference, and remembers where it came from.
 */
export async function carryOver(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown; reason: unknown; idempotencyKey: unknown },
  { now = new Date() }: { now?: Date } = {},
): Promise<CarryOverResult> {
  const key = parseKey(input.idempotencyKey);
  const repeat = await previousResult<CarryOverResult>(tx, key, actor, "expenses.carry_over");
  if (repeat) return repeat;
  const { actingRole } = assertCan(actor, "spending.lock");
  const row = await loadExpense(tx, input.id, true);
  const version = parseVersion(input.version);
  if (row.version !== version) throw new ConflictError({ type: "expense_submission", id: row.id });
  const { reason } = parseInput(z.object({ reason: reasonSchema }), { reason: input.reason });
  if (row.type !== "purchase_request" || row.status !== "approved") {
    throw new RuleError(y.errors.notCarriable);
  }
  const [from] = await tx.select().from(budgetCycles).where(eq(budgetCycles.id, row.budgetCycleId));
  if (!from.spendingLockedAt) throw new RuleError(y.errors.lockFirst(from.name));
  const next = await nextCycleOf(tx, from.budgetYear);
  if (!next) throw new RuleError(y.errors.noNextCycle(from.budgetYear + 1));
  if (next.spendingLockedAt) throw new RuleError(spendingCopy.errors.locked(next.name));
  if (!(await approvedAnnualBudget(tx, next.id, row.departmentId))) {
    throw new RuleError(y.errors.noNextBudget(row.departmentNameSnapshot, next.name));
  }

  await updateExpense(tx, row, version, {
    budgetCycleId: next.id,
    carriedOverFromCycleId: from.id,
    carryOverReason: reason,
    carriedOverAt: now,
  });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "expenses",
    eventType: "expenses.carried_over",
    ...auditBase({ ...row, budgetCycleId: next.id }),
    reason,
    details: {
      before: { cycleId: from.id },
      after: { cycleId: next.id },
      commitmentCents: row.approvedTotalCents,
    },
  });
  await queueExpenseEmails(
    tx,
    row.id,
    actor.id,
    { kind: "carried_over", reason, from: from.name, to: next.name },
    { now },
  );
  return storeIdempotent(tx, key, actor, "expenses.carry_over", row.id, {
    expenseId: row.id,
    cycleId: next.id,
  });
}
