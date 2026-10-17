import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { budgetCycles, budgetLineItems, departments, spendingEntries } from "@/db/schema";
import type { Tx } from "@/db/types";
import { approvedAnnualBudget, budgetFigures, type BudgetFigures } from "@/domain/expenses/budget";
import { authorize, type Subject } from "@/lib/authz";
import { hasRole } from "@/lib/roles";
import { spendingPeriod } from "./service";

/** Read models for recording and correcting spending (FR-24, DRD 6.8). */

export type Option = { id: string; name: string };

export type RecordOptions = {
  cycles: (Option & { locked: boolean; period: { from: string; to: string } })[];
  departments: Option[];
  cycleId: string | null;
  departmentId: string | null;
  /** The department's approved lines for the cycle, to link an entry to (FR-25). */
  lines: Option[];
  figures: BudgetFigures | null;
  /** The accountant may allow a date outside the spending period (FR-24). */
  canAllowOutsideYear: boolean;
};

async function linesOf(tx: Tx, cycleId: string, departmentId: string): Promise<Option[]> {
  const annual = await approvedAnnualBudget(tx, cycleId, departmentId);
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

export async function recordOptions(
  tx: Tx,
  viewer: Subject,
  chosen: { cycleId?: string; departmentId?: string },
): Promise<RecordOptions | null> {
  if (!authorize(viewer, "spending.record").allowed) return null;
  const cycleRows = await tx.select().from(budgetCycles).orderBy(desc(budgetCycles.budgetYear));
  const cycles = cycleRows.map((c) => ({
    id: c.id,
    name: c.name,
    locked: c.spendingLockedAt !== null,
    period: spendingPeriod(c),
  }));
  const active = await tx
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(eq(departments.status, "active"))
    .orderBy(asc(departments.name));
  const open = cycles.filter((c) => !c.locked);
  const cycleId =
    cycles.find((c) => c.id === chosen.cycleId)?.id ??
    open.find((c) => c.period.from.slice(0, 4) === String(new Date().getUTCFullYear()))?.id ??
    open[0]?.id ??
    null;
  const departmentId = active.find((d) => d.id === chosen.departmentId)?.id ?? null;
  return {
    cycles,
    departments: active,
    cycleId,
    departmentId,
    lines: cycleId && departmentId ? await linesOf(tx, cycleId, departmentId) : [],
    figures: cycleId && departmentId ? await budgetFigures(tx, cycleId, departmentId) : null,
    canAllowOutsideYear: hasRole(viewer, "accountant", "backup_approver"),
  };
}

export type EntryForEdit = {
  entry: typeof spendingEntries.$inferSelect;
  department: string;
  cycle: string;
  locked: boolean;
  lines: Option[];
  canAllowOutsideYear: boolean;
};

/** One manual entry to correct or void; null if it doesn't exist or isn't theirs to change. */
export async function entryForEdit(
  tx: Tx,
  viewer: Subject,
  id: string,
): Promise<EntryForEdit | null> {
  if (!authorize(viewer, "spending.record").allowed) return null;
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await tx
    .select({ entry: spendingEntries, department: departments.name, cycle: budgetCycles })
    .from(spendingEntries)
    .innerJoin(departments, eq(departments.id, spendingEntries.departmentId))
    .innerJoin(budgetCycles, eq(budgetCycles.id, spendingEntries.budgetCycleId))
    .where(eq(spendingEntries.id, id));
  if (!row) return null;
  return {
    entry: row.entry,
    department: row.department,
    cycle: row.cycle.name,
    locked: row.cycle.spendingLockedAt !== null,
    lines: await linesOf(tx, row.entry.budgetCycleId, row.entry.departmentId),
    canAllowOutsideYear: hasRole(viewer, "accountant", "backup_approver"),
  };
}
