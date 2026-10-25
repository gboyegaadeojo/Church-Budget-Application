import { and, asc, desc, eq, inArray, isNull, ne, notInArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  budgetCycles,
  budgetLineItems,
  departments,
  expenseDecisions,
  expenseSubmissions,
  users,
} from "@/db/schema";
import type { Tx } from "@/db/types";
import { daysSetting, getChurchTimeZone } from "@/domain/settings";
import { authorize, type Subject } from "@/lib/authz";
import type { TaxBreakdown } from "@/lib/money";
import { hasRole } from "@/lib/roles";
import { zonedDate } from "@/lib/time-zone";
import {
  approvedAnnualBudget,
  budgetFigures,
  impactOf,
  linkedCommitment,
  type BudgetFigures,
  type BudgetImpact,
} from "./budget";
import { listFilterConditions, type ExpenseListFilters } from "./list-filters";
import { expenseTotals, type ExpenseContent } from "./schema";
import { authzContextOf, contentOf, currentRate, loadExpense, type ExpenseRow } from "./service";
import {
  COMMITTED_STATUSES,
  ENDED_WITHOUT_CHARGE,
  isExpenseEditable,
  PENDING_STATUSES,
  type ExpenseStatus,
  type ExpenseType,
} from "./status";

/** Read models for the expense screens (DRD 6.9a). Every one checks permission itself. */

// ---------------------------------------------------------------- start

export type StartCycle = { id: string; name: string; budgetYear: number };
export type StartDepartment = {
  id: string;
  name: string;
  /** Budget years with an approved, released budget and an unlocked spending period. */
  cycles: StartCycle[];
  /** The year to preselect: this calendar year's, else the latest. */
  defaultCycleId: string | null;
};

/** The departments a person may submit expenses for, and the years each can charge. */
export async function expenseStartOptions(
  tx: Tx,
  viewer: Subject,
  now: Date = new Date(),
): Promise<StartDepartment[]> {
  // Departments they represent, and those they submit for as an Expense submitter (6B.2).
  const mine = [...viewer.departments, ...(viewer.expenseDepartments ?? [])].filter(
    (d) => authorize(viewer, "expense.submit", { departmentId: d.id }).allowed,
  );
  if (mine.length === 0) return [];
  const active = await tx
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(
      and(
        inArray(
          departments.id,
          mine.map((d) => d.id),
        ),
        eq(departments.status, "active"),
      ),
    )
    .orderBy(asc(departments.name));
  const cycles = await tx
    .select({ id: budgetCycles.id, name: budgetCycles.name, budgetYear: budgetCycles.budgetYear })
    .from(budgetCycles)
    .where(isNull(budgetCycles.spendingLockedAt))
    .orderBy(desc(budgetCycles.budgetYear));
  const year = Number(zonedDate(now, await getChurchTimeZone(tx)).slice(0, 4));

  const out: StartDepartment[] = [];
  for (const department of active) {
    const open: StartCycle[] = [];
    for (const cycle of cycles) {
      if (await approvedAnnualBudget(tx, cycle.id, department.id)) open.push(cycle);
    }
    out.push({
      ...department,
      cycles: open,
      defaultCycleId: (open.find((c) => c.budgetYear === year) ?? open[0])?.id ?? null,
    });
  }
  return out;
}

// ---------------------------------------------------------------- one expense

export type LinkableRequest = {
  id: string;
  reference: string;
  title: string;
  committedCents: number;
};
export type AnnualLineOption = { id: string; name: string };

export type ExpenseDecisionView = {
  id: string;
  level: "accountant" | "board";
  decision: "approved" | "approved_different_amount" | "returned" | "declined";
  approved: TaxBreakdown | null;
  reason: string | null;
  remainingAfterCents: number | null;
  decidedBy: string;
  decidedByUserId: string;
  actingRole: string;
  /** "verbal": given verbally and recorded by the Church Administrator (2026-10-24). */
  channel: "in_app" | "verbal";
  /** Who recorded a verbal approval, and how it was given. */
  recordedBy: string | null;
  recordedNote: string | null;
  createdAt: Date;
};

/** Every decision on the expense, oldest first (6B.4). */
export async function decisionsOf(tx: Tx, expenseId: string): Promise<ExpenseDecisionView[]> {
  const recorder = alias(users, "recorder");
  const rows = await tx
    .select({ d: expenseDecisions, name: users.displayName, recordedBy: recorder.displayName })
    .from(expenseDecisions)
    .innerJoin(users, eq(users.id, expenseDecisions.decidedByUserId))
    .leftJoin(recorder, eq(recorder.id, expenseDecisions.recordedByUserId))
    .where(eq(expenseDecisions.expenseSubmissionId, expenseId))
    .orderBy(asc(expenseDecisions.createdAt));
  return rows.map(({ d, name, recordedBy }) => ({
    id: d.id,
    level: d.level,
    decision: d.decision,
    approved:
      d.approvedTotalCents !== null
        ? {
            subtotal: d.approvedSubtotalCents!,
            tax: d.approvedTaxCents!,
            total: d.approvedTotalCents,
          }
        : null,
    reason: d.reason,
    remainingAfterCents: d.remainingAfterCents,
    decidedBy: name,
    decidedByUserId: d.decidedByUserId,
    actingRole: d.actingRole,
    channel: d.channel,
    recordedBy,
    recordedNote: d.recordedNote,
    createdAt: d.createdAt,
  }));
}

export type ExpenseView = {
  id: string;
  version: number;
  type: ExpenseType;
  status: ExpenseStatus;
  referenceNumber: string | null;
  title: string;
  justification: string;
  department: { id: string; name: string };
  cycle: { id: string; name: string; budgetYear: number };
  requester: { id: string; name: string };
  submittedAt: Date | null;
  approvedAt: Date | null;
  closedAt: Date | null;
  updatedAt: Date;
  rate: string;
  totals: TaxBreakdown;
  approved: TaxBreakdown | null;
  approvalNote: string | null;
  content: ExpenseContent;
  payee: { userId: string | null; name: string | null; email: string | null };
  linked: { id: string; reference: string | null; title: string } | null;
  decisions: ExpenseDecisionView[];
  /** The latest return's question, while the expense is returned (FR-44). */
  question: string | null;
  /** Live figures for the department's budget (FR-43, AC-140). */
  figures: BudgetFigures;
  /** What this expense does to Remaining if charged now. */
  impact: BudgetImpact;
  /** Released by charging this claim: its linked purchase request's commitment. */
  releasesCents: number;
  claimDeadlineDays: number;
  today: string;
  /** The viewer represents the department and may change it now. */
  canEdit: boolean;
  /** The viewer may withdraw it (before review, or while returned). */
  canWithdraw: boolean;
  /** The viewer may cancel it (an approved purchase request). */
  canCancel: boolean;
  /** The viewer may only look (System Administrator, the board, a read-only role). */
  readOnly: boolean;
  /** For the editor: approved purchase requests a claim can close. */
  linkable: LinkableRequest[];
  /** For the editor: the department's approved annual items. */
  annualLines: AnnualLineOption[];
};

/**
 * One expense for the viewer, or null if it doesn't exist or isn't theirs to see. A draft
 * stays with its department (and the System Administrator, who reads everything).
 */
export async function getExpenseView(
  tx: Tx,
  viewer: Subject,
  id: string,
  now: Date = new Date(),
): Promise<ExpenseView | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const row = await loadExpense(tx, id).catch(() => null);
  if (!row) return null;
  const decision = authorize(viewer, "expense.view", authzContextOf(row));
  if (!decision.allowed) return null;
  const represents = viewer.departments.some((d) => d.id === row.departmentId);
  const theirs = row.requesterUserId === viewer.id;
  if (row.status === "draft" && !represents && !theirs && !hasRole(viewer, "system_admin")) {
    return null;
  }

  const [cycle] = await tx
    .select({ id: budgetCycles.id, name: budgetCycles.name, budgetYear: budgetCycles.budgetYear })
    .from(budgetCycles)
    .where(eq(budgetCycles.id, row.budgetCycleId));
  const [requester] = await tx
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(eq(users.id, row.requesterUserId));
  const content = await contentOf(tx, row);
  const rate = row.taxRate ?? (await currentRate(tx));
  const totals =
    row.totalCents !== null
      ? { subtotal: row.subtotalCents!, tax: row.taxCents!, total: row.totalCents }
      : expenseTotals(row.type, content, rate);
  const figures = await budgetFigures(tx, row.budgetCycleId, row.departmentId);
  const releasesCents = await linkedCommitment(tx, row.linkedPurchaseRequestId);
  // Until charged, what it would do now; once charged, it's already in the figures.
  const charged = row.status !== "draft" && !PENDING_STATUSES.includes(row.status);
  const amount = row.approvedTotalCents ?? totals.total;
  const impact = charged ? impactOf(figures, 0) : impactOf(figures, amount, releasesCents);

  const [linked] = row.linkedPurchaseRequestId
    ? await tx
        .select({
          id: expenseSubmissions.id,
          reference: expenseSubmissions.referenceNumber,
          title: expenseSubmissions.title,
        })
        .from(expenseSubmissions)
        .where(eq(expenseSubmissions.id, row.linkedPurchaseRequestId))
    : [];
  const decisions = await decisionsOf(tx, row.id);
  // A representative, or the Expense submitter who submitted it (6B.2).
  const actsForDepartment = authorize(viewer, "expense.submit", authzContextOf(row)).allowed;
  const canEdit = actsForDepartment && isExpenseEditable(row.status);

  return {
    id: row.id,
    version: row.version,
    type: row.type,
    status: row.status,
    referenceNumber: row.referenceNumber,
    title: row.title,
    justification: row.justification,
    department: { id: row.departmentId, name: row.departmentNameSnapshot },
    cycle,
    requester: { id: requester.id, name: requester.name },
    submittedAt: row.submittedAt,
    approvedAt: row.approvedAt,
    closedAt: row.closedAt,
    updatedAt: row.updatedAt,
    rate,
    totals,
    approved:
      row.approvedTotalCents !== null
        ? {
            subtotal: row.approvedSubtotalCents!,
            tax: row.approvedTaxCents!,
            total: row.approvedTotalCents,
          }
        : null,
    approvalNote: row.approvalNote,
    content,
    payee: { userId: row.payeeUserId, name: row.payeeName, email: row.payeeEmail },
    linked: linked ?? null,
    decisions,
    question:
      row.status === "returned"
        ? (decisions.findLast((d) => d.decision === "returned")?.reason ?? null)
        : null,
    figures,
    impact,
    releasesCents,
    claimDeadlineDays: await daysSetting(tx, "claim_deadline_days"),
    today: zonedDate(now, await getChurchTimeZone(tx)),
    canEdit,
    canWithdraw: actsForDepartment && (row.status === "submitted" || row.status === "returned"),
    canCancel:
      row.type === "purchase_request" &&
      row.status === "approved" &&
      authorize(viewer, "expense.cancel", authzContextOf(row)).allowed,
    readOnly: decision.readOnly,
    linkable: canEdit && row.type === "expense_claim" ? await linkableRequests(tx, row) : [],
    annualLines: canEdit && row.type === "purchase_request" ? await annualLineOptions(tx, row) : [],
  };
}

/** Approved purchase requests of the same department and year that no live claim closes. */
async function linkableRequests(tx: Tx, row: ExpenseRow): Promise<LinkableRequest[]> {
  const candidates = await tx
    .select({
      id: expenseSubmissions.id,
      reference: expenseSubmissions.referenceNumber,
      title: expenseSubmissions.title,
      committedCents: expenseSubmissions.approvedTotalCents,
    })
    .from(expenseSubmissions)
    .where(
      and(
        eq(expenseSubmissions.type, "purchase_request"),
        eq(expenseSubmissions.departmentId, row.departmentId),
        eq(expenseSubmissions.budgetCycleId, row.budgetCycleId),
        inArray(expenseSubmissions.status, [...COMMITTED_STATUSES]),
      ),
    )
    .orderBy(asc(expenseSubmissions.referenceNumber));
  if (candidates.length === 0) return [];
  const taken = await tx
    .select({ id: expenseSubmissions.linkedPurchaseRequestId })
    .from(expenseSubmissions)
    .where(
      and(
        inArray(
          expenseSubmissions.linkedPurchaseRequestId,
          candidates.map((c) => c.id),
        ),
        ne(expenseSubmissions.id, row.id),
        notInArray(expenseSubmissions.status, ["draft", ...ENDED_WITHOUT_CHARGE]),
      ),
    );
  const takenIds = new Set(taken.map((t) => t.id));
  return candidates
    .filter((c) => !takenIds.has(c.id))
    .map((c) => ({
      id: c.id,
      reference: c.reference ?? "",
      title: c.title,
      committedCents: c.committedCents ?? 0,
    }));
}

async function annualLineOptions(tx: Tx, row: ExpenseRow): Promise<AnnualLineOption[]> {
  const annual = await approvedAnnualBudget(tx, row.budgetCycleId, row.departmentId);
  if (!annual) return [];
  return tx
    .select({ id: budgetLineItems.id, name: budgetLineItems.itemName })
    .from(budgetLineItems)
    .where(
      and(
        eq(budgetLineItems.budgetRequestId, annual.requestId),
        isNull(budgetLineItems.supersededAt),
      ),
    )
    .orderBy(asc(budgetLineItems.sortOrder));
}

// ---------------------------------------------------------------- lists

export type ExpenseListRow = {
  id: string;
  referenceNumber: string | null;
  title: string;
  type: ExpenseType;
  status: ExpenseStatus;
  department: string;
  departmentId: string;
  cycleName: string;
  amountCents: number | null;
  payeeName: string | null;
  submittedAt: Date | null;
  updatedAt: Date;
  howBought: ExpenseRow["howBought"];
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

type ListRaw = { totalCents: number | null; approvedTotalCents: number | null } & Omit<
  ExpenseListRow,
  "amountCents"
>;

export function toListRow(r: ListRaw): ExpenseListRow {
  const { totalCents, approvedTotalCents, ...rest } = r;
  return { ...rest, amountCents: approvedTotalCents ?? totalCents };
}

/** The person's departments' expenses, newest first (FR-48 "My expense submissions"). */
export async function listMyExpenses(
  tx: Tx,
  viewer: Subject,
  filters: ExpenseListFilters = {},
): Promise<ExpenseListRow[]> {
  const ids = viewer.departments.map((d) => d.id);
  if (ids.length === 0 && (viewer.expenseDepartments?.length ?? 0) === 0) return [];
  const zone = await getChurchTimeZone(tx);
  const rows = await tx
    .select(listColumns)
    .from(expenseSubmissions)
    .innerJoin(budgetCycles, eq(budgetCycles.id, expenseSubmissions.budgetCycleId))
    .where(
      and(
        or(
          ids.length > 0 ? inArray(expenseSubmissions.departmentId, ids) : undefined,
          eq(expenseSubmissions.requesterUserId, viewer.id),
        ),
        listFilterConditions(filters, zone),
      ),
    )
    .orderBy(desc(expenseSubmissions.updatedAt));
  return rows.map(toListRow);
}

export type DepartmentBudget = {
  departmentId: string;
  department: string;
  cycleId: string;
  cycleName: string;
  figures: BudgetFigures;
};

/** The budget panel for each of the person's departments (FR-48): every year they can charge. */
export async function myDepartmentBudgets(
  tx: Tx,
  viewer: Subject,
  now: Date = new Date(),
): Promise<DepartmentBudget[]> {
  const options = await expenseStartOptions(tx, viewer, now);
  const out: DepartmentBudget[] = [];
  for (const department of options) {
    for (const cycle of department.cycles) {
      out.push({
        departmentId: department.id,
        department: department.name,
        cycleId: cycle.id,
        cycleName: cycle.name,
        figures: await budgetFigures(tx, cycle.id, department.id),
      });
    }
  }
  return out;
}
