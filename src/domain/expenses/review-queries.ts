import { and, asc, eq, inArray, isNotNull, ne, notInArray, or, sql } from "drizzle-orm";
import { budgetCycles, expenseReceiptLines, expenseSubmissions } from "@/db/schema";
import type { Tx } from "@/db/types";
import { daysSetting, getChurchTimeZone } from "@/domain/settings";
import { authorize, type Action, type Subject } from "@/lib/authz";
import { sumCents } from "@/lib/money";
import { zonedDate } from "@/lib/time-zone";
import { boardPermission } from "./board";
import { budgetFigures, impactOf, linkedCommitment, type BudgetFigures } from "./budget";
import { toListRow, type ExpenseListRow } from "./queries";
import { daysBetween, isLateClaim } from "./schema";
import { authzContextOf, type ExpenseRow } from "./service";
import { filterStatus, listFilterConditions, type ExpenseListFilters } from "./list-filters";
import {
  ACCOUNTANT_WAITING,
  BOARD_WAITING,
  ENDED_WITHOUT_CHARGE,
  type ExpenseStatus,
} from "./status";

/** The accountant's queue: waiting for them, and out with the department or the board. */
export const ACCOUNTANT_QUEUE: readonly ExpenseStatus[] = [
  "submitted",
  "in_review",
  "awaiting_accountant",
  "returned",
  "awaiting_board",
];
/** The board's queue: waiting for them, and waiting for the accountant after they approved. */
export const BOARD_QUEUE: readonly ExpenseStatus[] = [
  "submitted",
  "in_review",
  "awaiting_board",
  "awaiting_accountant",
];

/** The approvers' lists and warnings (FR-47, FR-48; DRD 6.9a). */

export type QueueRow = ExpenseListRow & {
  /** How far charging it now would take the department below zero (FR-43, AC-140). */
  overBy: number;
  daysWaiting: number;
  /** The viewer may decide it (not their department, claim or payee). */
  canDecide: boolean;
};

export type QueueFilters = ExpenseListFilters;

export type Queue = {
  rows: QueueRow[];
  counts: Partial<Record<ExpenseStatus, number>>;
  /** Total of everything waiting for a decision at this level. */
  waitingCents: number;
  overBudgetCount: number;
  oldestDays: number | null;
  departments: { id: string; name: string }[];
  readOnly: boolean;
};

const listColumns = {
  id: expenseSubmissions.id,
  referenceNumber: expenseSubmissions.referenceNumber,
  title: expenseSubmissions.title,
  type: expenseSubmissions.type,
  status: expenseSubmissions.status,
  department: expenseSubmissions.departmentNameSnapshot,
  departmentId: expenseSubmissions.departmentId,
  cycleName: budgetCycles.name,
  totalCents: expenseSubmissions.totalCents,
  approvedTotalCents: expenseSubmissions.approvedTotalCents,
  payeeName: expenseSubmissions.payeeName,
  submittedAt: expenseSubmissions.submittedAt,
  updatedAt: expenseSubmissions.updatedAt,
  howBought: expenseSubmissions.howBought,
};

/**
 * A level's queue: the accountant sees what's waiting for them and what's out with the
 * department or the board; the Board Chair sees what's waiting for final approval.
 */
async function queueFor(
  tx: Tx,
  viewer: Subject,
  options: {
    queueAction: Action;
    decideAction: Action;
    statuses: readonly ExpenseStatus[];
    waiting: readonly ExpenseStatus[];
    filters: QueueFilters;
    now: Date;
    /** A finer check than the action, e.g. the Vice-Chair only while covering. */
    canDecide?: (row: ExpenseRow) => Promise<boolean>;
  },
): Promise<Queue | null> {
  const access = authorize(viewer, options.queueAction);
  if (!access.allowed) return null;
  const f = options.filters;
  const zone = await getChurchTimeZone(tx);
  const chosen = filterStatus(f.status);
  const statuses = chosen && options.statuses.includes(chosen) ? [chosen] : options.statuses;
  const raw = await tx
    .select({ ...listColumns, full: expenseSubmissions })
    .from(expenseSubmissions)
    .innerJoin(budgetCycles, eq(budgetCycles.id, expenseSubmissions.budgetCycleId))
    .where(
      and(
        inArray(expenseSubmissions.status, [...statuses]),
        listFilterConditions(f, zone, { status: false }),
      ),
    )
    .orderBy(asc(expenseSubmissions.submittedAt));

  // Each department's figures once, all fetched together.
  const scopes = [
    ...new Map(
      raw.map(({ full }) => [`${full.budgetCycleId}:${full.departmentId}`, full] as const),
    ).entries(),
  ];
  const figures = new Map<string, BudgetFigures>(
    await Promise.all(
      scopes.map(
        async ([scope, full]) =>
          [scope, await budgetFigures(tx, full.budgetCycleId, full.departmentId)] as const,
      ),
    ),
  );
  const today = zonedDate(options.now, zone);
  const rows: QueueRow[] = [];
  for (const { full, ...r } of raw) {
    const scope = `${full.budgetCycleId}:${full.departmentId}`;
    const amount = full.approvedTotalCents ?? full.totalCents ?? 0;
    const impact = impactOf(
      figures.get(scope)!,
      amount,
      await linkedCommitment(tx, full.linkedPurchaseRequestId),
    );
    rows.push({
      ...toListRow(r),
      overBy: impact.overBy,
      daysWaiting: full.submittedAt
        ? Math.max(0, daysBetween(zonedDate(full.submittedAt, zone), today))
        : 0,
      // Only while this level's approval is still needed, and the person may give it.
      canDecide:
        options.waiting.includes(full.status) &&
        (options.canDecide
          ? await options.canDecide(full)
          : authorize(viewer, options.decideAction, authzContextOf(full)).allowed),
    });
  }
  const filtered = f.overBudget === "yes" ? rows.filter((r) => r.overBy > 0) : rows;
  const waiting = rows.filter((r) => options.waiting.includes(r.status));
  const counts: Partial<Record<ExpenseStatus, number>> = {};
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const departments = [...new Map(rows.map((r) => [r.departmentId, r.department]))]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    rows: filtered,
    counts,
    waitingCents: sumCents(waiting.map((r) => r.amountCents ?? 0)),
    overBudgetCount: waiting.filter((r) => r.overBy > 0).length,
    oldestDays: waiting.length > 0 ? Math.max(...waiting.map((r) => r.daysWaiting)) : null,
    departments,
    readOnly: access.readOnly,
  };
}

/** The accountant's review queue (6B.4, FR-48): waiting for them, then out with others. */
export function accountantQueue(
  tx: Tx,
  viewer: Subject,
  filters: QueueFilters = {},
  now: Date = new Date(),
) {
  return queueFor(tx, viewer, {
    queueAction: "expense.review_queue",
    decideAction: "expense.first_approve",
    statuses: ACCOUNTANT_QUEUE,
    waiting: ACCOUNTANT_WAITING,
    filters,
    now,
  });
}

/** "Awaiting my approval" for the Board Chair and Vice-Chair (6B.4), asked at submission. */
export function boardQueue(
  tx: Tx,
  viewer: Subject,
  filters: QueueFilters = {},
  now: Date = new Date(),
) {
  return queueFor(tx, viewer, {
    queueAction: "expense.board_queue",
    decideAction: "expense.final_approve",
    statuses: BOARD_QUEUE,
    waiting: BOARD_WAITING,
    filters,
    now,
    canDecide: async (row) => (await boardPermission(tx, viewer, row, now)).allowed,
  });
}

// ---------------------------------------------------------------- warnings (FR-46, FR-47)

export type ExpenseWarnings = {
  /** Other live claims with a matching receipt line (vendor, date, amount, or receipt no.). */
  duplicates: { id: string; reference: string | null }[];
  late: boolean;
  claimDeadlineDays: number;
  /** The approved or requested amount takes the department over budget by this now. */
  overBy: number;
  /** For a claim linked to a purchase request: how much it's above the commitment. */
  aboveCommitmentBy: number;
};

export async function warningsFor(
  tx: Tx,
  row: ExpenseRow,
  amountCents: number,
  now: Date = new Date(),
): Promise<ExpenseWarnings> {
  const claimDeadlineDays = await daysSetting(tx, "claim_deadline_days");
  const lines =
    row.type === "expense_claim"
      ? await tx
          .select()
          .from(expenseReceiptLines)
          .where(eq(expenseReceiptLines.expenseSubmissionId, row.id))
      : [];
  const duplicates = new Map<string, string | null>();
  for (const line of lines) {
    const matches = await tx
      .select({ id: expenseSubmissions.id, reference: expenseSubmissions.referenceNumber })
      .from(expenseReceiptLines)
      .innerJoin(
        expenseSubmissions,
        eq(expenseSubmissions.id, expenseReceiptLines.expenseSubmissionId),
      )
      .where(
        and(
          eq(expenseSubmissions.departmentId, row.departmentId),
          ne(expenseSubmissions.id, row.id),
          notInArray(expenseSubmissions.status, ["draft", ...ENDED_WITHOUT_CHARGE]),
          or(
            and(
              sql`lower(${expenseReceiptLines.vendor}) = ${line.vendor.toLowerCase()}`,
              eq(expenseReceiptLines.purchaseDate, line.purchaseDate),
              eq(expenseReceiptLines.amountCents, line.amountCents),
            ),
            line.receiptNumber
              ? and(
                  isNotNull(expenseReceiptLines.receiptNumber),
                  sql`lower(${expenseReceiptLines.receiptNumber}) = ${line.receiptNumber.toLowerCase()}`,
                )
              : undefined,
          ),
        ),
      );
    for (const m of matches) duplicates.set(m.id, m.reference);
  }
  const today = zonedDate(row.submittedAt ?? now, await getChurchTimeZone(tx));
  const late = isLateClaim(
    lines.map((l) => ({ date: l.purchaseDate })),
    today,
    claimDeadlineDays,
  );
  const commitment = await linkedCommitment(tx, row.linkedPurchaseRequestId);
  const figures = await budgetFigures(tx, row.budgetCycleId, row.departmentId);
  return {
    duplicates: [...duplicates].map(([id, reference]) => ({ id, reference })),
    late,
    claimDeadlineDays,
    overBy: impactOf(figures, amountCents, commitment).overBy,
    aboveCommitmentBy: commitment > 0 && amountCents > commitment ? amountCents - commitment : 0,
  };
}

// ---------------------------------------------------------------- all expenses (FR-48)

export type AllFilters = ExpenseListFilters;

/**
 * Every submitted expense (and each person's own drafts are on My expenses), for the
 * accountant, the Church Administrator and the System Administrator (read-only), with
 * search and filters (FR-48).
 */
export async function allExpenses(
  tx: Tx,
  viewer: Subject,
  filters: AllFilters = {},
): Promise<{
  rows: ExpenseListRow[];
  departments: { id: string; name: string }[];
  readOnly: boolean;
} | null> {
  const access = authorize(viewer, "expense.view_all");
  if (!access.allowed) return null;
  const zone = await getChurchTimeZone(tx);
  const rows = await tx
    .select(listColumns)
    .from(expenseSubmissions)
    .innerJoin(budgetCycles, eq(budgetCycles.id, expenseSubmissions.budgetCycleId))
    .where(and(ne(expenseSubmissions.status, "draft"), listFilterConditions(filters, zone)))
    .orderBy(sql`${expenseSubmissions.submittedAt} desc nulls last`)
    .limit(500);
  const departments = await tx
    .selectDistinct({
      id: expenseSubmissions.departmentId,
      name: expenseSubmissions.departmentNameSnapshot,
    })
    .from(expenseSubmissions)
    .where(ne(expenseSubmissions.status, "draft"))
    .orderBy(asc(expenseSubmissions.departmentNameSnapshot));
  return { rows: rows.map(toListRow), departments, readOnly: access.readOnly };
}
