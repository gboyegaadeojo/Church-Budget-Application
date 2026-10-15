import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { budgetCycles, deadlineExtensions, departments, users } from "@/db/schema";
import type { Tx } from "@/db/types";

/** Read models for Admin → Budget Cycles. Callers check `admin.cycles` first. */

export async function listCycles(tx: Tx) {
  return tx.select().from(budgetCycles).orderBy(desc(budgetCycles.budgetYear));
}

export async function getCycleDetail(tx: Tx, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [cycle] = await tx.select().from(budgetCycles).where(eq(budgetCycles.id, id)).limit(1);
  if (!cycle) return null;
  const extensions = await tx
    .select({
      id: deadlineExtensions.id,
      department: departments.name,
      deadline: deadlineExtensions.newDeadline,
      reason: deadlineExtensions.reason,
      grantedBy: users.displayName,
      supersededAt: deadlineExtensions.supersededAt,
      createdAt: deadlineExtensions.createdAt,
    })
    .from(deadlineExtensions)
    .innerJoin(departments, eq(departments.id, deadlineExtensions.departmentId))
    .innerJoin(users, eq(users.id, deadlineExtensions.grantedByUserId))
    .where(eq(deadlineExtensions.cycleId, id))
    .orderBy(asc(departments.name), desc(deadlineExtensions.createdAt));
  const activeDepartments = await tx
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(eq(departments.status, "active"))
    .orderBy(asc(departments.name));
  return { cycle, extensions, activeDepartments };
}
