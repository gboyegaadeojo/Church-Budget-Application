import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { budgetCycles, departments, expenseSubmissions, spendingEntries, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { authorize, type Subject } from "@/lib/authz";
import { sumCents } from "@/lib/money";

/**
 * The spending ledger (FR-24, FR-26, FR-42, AC-80): every entry for a cycle, including
 * those made from approved expenses, so nothing is typed twice, with search and filters
 * (department, date range, payment method, type, payee, who entered it, status). Spent
 * excludes voided entries and subtracts refunds (FR-25).
 */

export type LedgerRow = {
  id: string;
  spentOn: string;
  department: string;
  departmentId: string;
  payee: string;
  description: string;
  entryType: "expense" | "refund";
  amountCents: number;
  paymentMethod: string | null;
  referenceNumber: string | null;
  status: "recorded" | "voided";
  unbudgeted: boolean;
  enteredBy: string;
  expense: { id: string; reference: string | null } | null;
};

export type LedgerFilters = {
  department?: string;
  from?: string;
  to?: string;
  method?: string;
  type?: string;
  q?: string;
  enteredBy?: string;
  status?: string;
};

export type Ledger = {
  cycles: { id: string; name: string }[];
  cycleId: string | null;
  rows: LedgerRow[];
  spentCents: number;
  departments: { id: string; name: string }[];
  people: { id: string; name: string }[];
  readOnly: boolean;
  /** The viewer records, corrects and voids spending (FR-24). */
  canRecord: boolean;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function conditions(f: LedgerFilters): (SQL | undefined)[] {
  const s = spendingEntries;
  const q = f.q?.trim().slice(0, 100);
  const pattern = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  return [
    f.department && z.uuid().safeParse(f.department).success
      ? eq(s.departmentId, f.department)
      : undefined,
    f.from && DATE.test(f.from) ? sql`${s.spentOn} >= ${f.from}::date` : undefined,
    f.to && DATE.test(f.to) ? sql`${s.spentOn} <= ${f.to}::date` : undefined,
    f.method ? eq(s.paymentMethod, f.method.slice(0, 40)) : undefined,
    f.type === "expense" || f.type === "refund" ? eq(s.entryType, f.type) : undefined,
    f.status === "recorded" || f.status === "voided" ? eq(s.status, f.status) : undefined,
    f.enteredBy && z.uuid().safeParse(f.enteredBy).success
      ? eq(s.createdByUserId, f.enteredBy)
      : undefined,
    pattern
      ? sql`(${s.payee} ilike ${pattern} or ${s.description} ilike ${pattern} or ${s.referenceNumber} ilike ${pattern})`
      : undefined,
  ];
}

export async function getLedger(
  tx: Tx,
  viewer: Subject,
  cycleId?: string,
  filters: LedgerFilters = {},
): Promise<Ledger | null> {
  const access = authorize(viewer, "spending.view");
  if (!access.allowed) return null;
  const cycles = await tx
    .select({ id: budgetCycles.id, name: budgetCycles.name })
    .from(budgetCycles)
    .orderBy(desc(budgetCycles.budgetYear));
  // The chosen cycle, else the latest one with any spending, else the latest.
  const withSpending = await tx
    .selectDistinct({ id: spendingEntries.budgetCycleId })
    .from(spendingEntries);
  const chosen =
    cycles.find((c) => c.id === cycleId)?.id ??
    cycles.find((c) => withSpending.some((w) => w.id === c.id))?.id ??
    cycles[0]?.id ??
    null;
  const canRecord = authorize(viewer, "spending.record").allowed;
  const base = { cycles, readOnly: access.readOnly, canRecord };
  if (!chosen) {
    return { ...base, cycleId: null, rows: [], spentCents: 0, departments: [], people: [] };
  }
  const raw = await tx
    .select({
      entry: spendingEntries,
      department: departments.name,
      expenseReference: expenseSubmissions.referenceNumber,
      enteredBy: users.displayName,
    })
    .from(spendingEntries)
    .innerJoin(departments, eq(departments.id, spendingEntries.departmentId))
    .innerJoin(users, eq(users.id, spendingEntries.createdByUserId))
    .leftJoin(expenseSubmissions, eq(expenseSubmissions.id, spendingEntries.expenseSubmissionId))
    .where(and(eq(spendingEntries.budgetCycleId, chosen), ...conditions(filters)))
    .orderBy(desc(spendingEntries.spentOn), asc(spendingEntries.createdAt))
    .limit(1000);
  const rows: LedgerRow[] = raw.map(({ entry, department, expenseReference, enteredBy }) => ({
    id: entry.id,
    spentOn: entry.spentOn,
    department,
    departmentId: entry.departmentId,
    payee: entry.payee,
    description: entry.description,
    entryType: entry.entryType,
    amountCents: entry.amountCents,
    paymentMethod: entry.paymentMethod,
    referenceNumber: entry.referenceNumber,
    status: entry.status,
    unbudgeted: entry.unbudgeted,
    enteredBy,
    expense: entry.expenseSubmissionId
      ? { id: entry.expenseSubmissionId, reference: expenseReference }
      : null,
  }));
  const spentCents = sumCents(
    rows
      .filter((r) => r.status === "recorded")
      .map((r) => (r.entryType === "refund" ? -r.amountCents : r.amountCents)),
  );
  const scope = await tx
    .selectDistinct({
      departmentId: departments.id,
      department: departments.name,
      userId: users.id,
      user: users.displayName,
    })
    .from(spendingEntries)
    .innerJoin(departments, eq(departments.id, spendingEntries.departmentId))
    .innerJoin(users, eq(users.id, spendingEntries.createdByUserId))
    .where(eq(spendingEntries.budgetCycleId, chosen));
  const unique = <T extends { id: string; name: string }>(list: T[]) =>
    [...new Map(list.map((x) => [x.id, x])).values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    ...base,
    cycleId: chosen,
    rows,
    spentCents,
    departments: unique(scope.map((r) => ({ id: r.departmentId, name: r.department }))),
    people: unique(scope.map((r) => ({ id: r.userId, name: r.user }))),
  };
}
