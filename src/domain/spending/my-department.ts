import { and, desc, eq, inArray } from "drizzle-orm";
import { budgetCycles, spendingEntries } from "@/db/schema";
import type { Tx } from "@/db/types";
import {
  budgetFigures,
  budgetStatus,
  nearLimitThreshold,
  usedTenthsOfPercent,
  type BudgetFigures,
  type BudgetStatus,
} from "@/domain/expenses/budget";
import { authorize, type Subject } from "@/lib/authz";

/**
 * My department budget (FR-28, AC-89, DRD 6.2a): each department the person represents,
 * for the chosen year: approved total, amendments, available, committed, spent and
 * remaining, and its spending entries (date, payee, description, amount). Payment method
 * and reference numbers are never selected, and nobody sees another department's spending.
 */

export type MyEntry = {
  id: string;
  spentOn: string;
  payee: string;
  description: string;
  amountCents: number;
  entryType: "expense" | "refund";
  voided: boolean;
};

export type MyDepartmentBudget = {
  departmentId: string;
  department: string;
  figures: BudgetFigures;
  status: BudgetStatus;
  usedTenths: number | null;
  entries: MyEntry[];
};

export type MyBudgets = {
  cycles: { id: string; name: string }[];
  cycle: { id: string; name: string } | null;
  departments: MyDepartmentBudget[];
};

/** Null when the person isn't a requester, so the page shows permission denied. */
export async function myDepartmentSpending(
  tx: Tx,
  viewer: Subject,
  cycleId?: string,
): Promise<MyBudgets | null> {
  if (!viewer.roles.includes("requester")) return null;
  const mine = viewer.departments.filter(
    (d) => authorize(viewer, "spending.view", { departmentId: d.id }).allowed,
  );
  const all = await tx
    .select({
      id: budgetCycles.id,
      name: budgetCycles.name,
      year: budgetCycles.budgetYear,
      status: budgetCycles.status,
    })
    .from(budgetCycles)
    .orderBy(desc(budgetCycles.budgetYear));
  // The same default year as the spending dashboard.
  const thisYear = new Date().getUTCFullYear();
  const chosen =
    all.find((c) => c.id === cycleId) ??
    all.find((c) => c.year === thisYear) ??
    all.find((c) => c.status === "open") ??
    all[0];
  const cycles = all.map((c) => ({ id: c.id, name: c.name }));
  if (!chosen) return { cycles, cycle: null, departments: [] };
  const cycle = { id: chosen.id, name: chosen.name };
  if (mine.length === 0) return { cycles, cycle, departments: [] };

  const threshold = await nearLimitThreshold(tx);
  const rows = await tx
    .select({
      id: spendingEntries.id,
      departmentId: spendingEntries.departmentId,
      spentOn: spendingEntries.spentOn,
      payee: spendingEntries.payee,
      description: spendingEntries.description,
      amountCents: spendingEntries.amountCents,
      entryType: spendingEntries.entryType,
      status: spendingEntries.status,
    })
    .from(spendingEntries)
    .where(
      and(
        eq(spendingEntries.budgetCycleId, chosen.id),
        inArray(
          spendingEntries.departmentId,
          mine.map((d) => d.id),
        ),
      ),
    )
    .orderBy(desc(spendingEntries.spentOn), desc(spendingEntries.createdAt));

  const departments: MyDepartmentBudget[] = [];
  for (const d of mine) {
    const figures = await budgetFigures(tx, chosen.id, d.id);
    departments.push({
      departmentId: d.id,
      department: d.name,
      figures,
      status: budgetStatus(figures, threshold),
      usedTenths: usedTenthsOfPercent(figures),
      entries: rows
        .filter((r) => r.departmentId === d.id)
        .map((r) => ({
          id: r.id,
          spentOn: r.spentOn,
          payee: r.payee,
          description: r.description,
          amountCents: r.amountCents,
          entryType: r.entryType,
          voided: r.status === "voided",
        })),
    });
  }
  return { cycles, cycle, departments };
}
