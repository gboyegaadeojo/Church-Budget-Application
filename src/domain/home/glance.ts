import { and, count, eq, inArray } from "drizzle-orm";
import { budgetCycles, budgetRequests, departments } from "@/db/schema";
import type { Tx } from "@/db/types";
import { myDepartmentBudgets } from "@/domain/expenses/queries";
import { readyQueue } from "@/domain/expenses/payment-queries";
import { accountantQueue, boardQueue } from "@/domain/expenses/review-queries";
import type { BudgetFigures } from "@/domain/expenses/budget";
import { hasRole, type Viewer } from "@/lib/roles";

/**
 * Home's "At a glance" cards (FR-37, DRD 6.0): one per role the person holds, each a
 * summary with a link to where the work is. Built from the same read models as the
 * screens they link to, so the numbers always agree.
 */

export type GlanceCard =
  | {
      kind: "department";
      department: string;
      cycle: string;
      figures: BudgetFigures;
      href: string;
    }
  | { kind: "review"; annual: number; expenses: number; href: string }
  | { kind: "board"; waiting: number; href: string }
  | { kind: "pay"; owedCents: number; waiting: number; href: string }
  | { kind: "proposed"; count: number; href: string };

/** Annual budgets waiting for the accountant in open cycles (submitted, updated, in review). */
async function annualWaiting(tx: Tx): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(budgetRequests)
    .innerJoin(budgetCycles, eq(budgetCycles.id, budgetRequests.budgetCycleId))
    .where(
      and(
        eq(budgetCycles.status, "open"),
        inArray(budgetRequests.status, ["submitted", "updated", "in_review"]),
      ),
    );
  return row?.n ?? 0;
}

export async function atAGlance(
  tx: Tx,
  viewer: Viewer,
  now: Date = new Date(),
): Promise<GlanceCard[]> {
  const cards: GlanceCard[] = [];

  // Department leaders: each department's budget for its latest year.
  if (viewer.roles.includes("requester") && viewer.departments.length > 0) {
    const budgets = await myDepartmentBudgets(tx, viewer, now);
    const latest = new Map<string, (typeof budgets)[number]>();
    for (const b of budgets) if (!latest.has(b.departmentId)) latest.set(b.departmentId, b);
    for (const b of latest.values()) {
      cards.push({
        kind: "department",
        department: b.department,
        cycle: b.cycleName,
        figures: b.figures,
        href: "/expenses/mine",
      });
    }
  }

  if (hasRole(viewer, "accountant", "backup_approver")) {
    const queue = await accountantQueue(tx, viewer, {}, now);
    cards.push({
      kind: "review",
      annual: await annualWaiting(tx),
      expenses: queue ? queue.rows.filter((r) => r.canDecide).length : 0,
      href: "/expenses/review",
    });
  }

  if (hasRole(viewer, "board_chair", "vice_chair")) {
    const queue = await boardQueue(tx, viewer, {}, now);
    cards.push({
      kind: "board",
      waiting: queue ? queue.rows.filter((r) => r.canDecide).length : 0,
      href: "/expenses/awaiting-approval",
    });
  }

  if (hasRole(viewer, "church_admin")) {
    const queue = await readyQueue(tx, viewer, {}, now);
    if (queue) {
      cards.push({
        kind: "pay",
        owedCents: queue.owedCents,
        waiting: queue.rows.length,
        href: "/expenses/ready",
      });
    }
  }

  if (hasRole(viewer, "system_admin")) {
    const [row] = await tx
      .select({ n: count() })
      .from(departments)
      .where(eq(departments.status, "proposed"));
    cards.push({ kind: "proposed", count: row?.n ?? 0, href: "/admin/departments?tab=proposed" });
  }

  return cards;
}
