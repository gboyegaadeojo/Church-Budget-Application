import { and, asc, desc, eq } from "drizzle-orm";
import { budgetCycles, departments, expenseSubmissions, spendingEntries } from "@/db/schema";
import type { Tx } from "@/db/types";
import { authorize, type Subject } from "@/lib/authz";
import { sumCents } from "@/lib/money";

/**
 * The spending ledger, read-only for Stage 3 (FR-24, FR-42, AC-80): every entry for a
 * cycle, including those made from approved expenses, so nothing is typed twice. Stage 4
 * adds recording, refunds, corrections and voids. Spent excludes voided entries and
 * subtracts refunds (FR-25).
 */

export type LedgerRow = {
  id: string;
  spentOn: string;
  department: string;
  payee: string;
  description: string;
  entryType: "expense" | "refund";
  amountCents: number;
  paymentMethod: string | null;
  referenceNumber: string | null;
  status: "recorded" | "voided";
  expense: { id: string; reference: string | null } | null;
};

export type Ledger = {
  cycles: { id: string; name: string }[];
  cycleId: string | null;
  rows: LedgerRow[];
  spentCents: number;
  readOnly: boolean;
};

export async function getLedger(tx: Tx, viewer: Subject, cycleId?: string): Promise<Ledger | null> {
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
  if (!chosen) return { cycles, cycleId: null, rows: [], spentCents: 0, readOnly: access.readOnly };
  const raw = await tx
    .select({
      entry: spendingEntries,
      department: expenseSubmissions.departmentNameSnapshot,
      expenseReference: expenseSubmissions.referenceNumber,
    })
    .from(spendingEntries)
    .leftJoin(expenseSubmissions, eq(expenseSubmissions.id, spendingEntries.expenseSubmissionId))
    .where(and(eq(spendingEntries.budgetCycleId, chosen)))
    .orderBy(desc(spendingEntries.spentOn), asc(spendingEntries.createdAt));
  const names = new Map(
    (await tx.select({ id: departments.id, name: departments.name }).from(departments)).map((d) => [
      d.id,
      d.name,
    ]),
  );
  const rows: LedgerRow[] = raw.map(({ entry, department, expenseReference }) => ({
    id: entry.id,
    spentOn: entry.spentOn,
    department: department ?? names.get(entry.departmentId) ?? "",
    payee: entry.payee,
    description: entry.description,
    entryType: entry.entryType,
    amountCents: entry.amountCents,
    paymentMethod: entry.paymentMethod,
    referenceNumber: entry.referenceNumber,
    status: entry.status,
    expense: entry.expenseSubmissionId
      ? { id: entry.expenseSubmissionId, reference: expenseReference }
      : null,
  }));
  const spentCents = sumCents(
    rows
      .filter((r) => r.status === "recorded")
      .map((r) => (r.entryType === "refund" ? -r.amountCents : r.amountCents)),
  );
  return { cycles, cycleId: chosen, rows, spentCents, readOnly: access.readOnly };
}
