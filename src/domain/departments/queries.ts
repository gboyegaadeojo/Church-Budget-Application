import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { budgetCycles, budgetRequests, departments, userDepartments, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import type { RepresentativeType } from "@/lib/roles";
import { closeMatches } from "./matching";
import type { DepartmentStatus } from "./status";

/** Read models for Admin → Departments. Callers check `admin.departments` first. */

export type Leader = {
  userId: string;
  name: string;
  email: string;
  type: RepresentativeType;
  verified: boolean;
};

export type DepartmentListItem = {
  id: string;
  name: string;
  status: DepartmentStatus;
  primary: Leader | null;
  backup: Leader | null;
  representatives: number;
};

async function leadersByDepartment(tx: Tx, ids: string[]): Promise<Map<string, Leader[]>> {
  const map = new Map<string, Leader[]>();
  if (ids.length === 0) return map;
  const rows = await tx
    .select({
      departmentId: userDepartments.departmentId,
      userId: users.id,
      name: users.displayName,
      email: users.email,
      type: userDepartments.representativeType,
      verified: users.pcoLeaderVerified,
    })
    .from(userDepartments)
    .innerJoin(users, eq(users.id, userDepartments.userId))
    .where(inArray(userDepartments.departmentId, ids))
    .orderBy(asc(users.displayName));
  for (const { departmentId, ...leader } of rows) {
    map.set(departmentId, [...(map.get(departmentId) ?? []), leader]);
  }
  return map;
}

export async function listDepartments(
  tx: Tx,
  status: Exclude<DepartmentStatus, "rejected">,
): Promise<DepartmentListItem[]> {
  const rows = await tx
    .select()
    .from(departments)
    .where(eq(departments.status, status))
    .orderBy(asc(departments.name));
  const leaders = await leadersByDepartment(
    tx,
    rows.map((r) => r.id),
  );
  return rows.map((r) => {
    const list = leaders.get(r.id) ?? [];
    return {
      id: r.id,
      name: r.name,
      status: r.status,
      primary: list.find((l) => l.type === "primary") ?? null,
      backup: list.find((l) => l.type === "backup") ?? null,
      representatives: list.filter((l) => l.type === "representative").length,
    };
  });
}

export async function countProposed(tx: Tx): Promise<number> {
  const rows = await tx
    .select({ id: departments.id })
    .from(departments)
    .where(eq(departments.status, "proposed"));
  return rows.length;
}

export async function getDepartmentDetail(tx: Tx, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [department] = await tx.select().from(departments).where(eq(departments.id, id)).limit(1);
  if (!department) return null;
  const leaders = (await leadersByDepartment(tx, [id])).get(id) ?? [];
  const order: Record<RepresentativeType, number> = { primary: 0, backup: 1, representative: 2 };
  leaders.sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name));

  const [proposer] = department.proposedByUserId
    ? await tx
        .select({ name: users.displayName })
        .from(users)
        .where(eq(users.id, department.proposedByUserId))
    : [];
  const requests = await tx
    .select({
      id: budgetRequests.id,
      title: budgetRequests.title,
      status: budgetRequests.status,
      reference: budgetRequests.referenceNumber,
      cycle: budgetCycles.name,
    })
    .from(budgetRequests)
    .innerJoin(budgetCycles, eq(budgetCycles.id, budgetRequests.budgetCycleId))
    .where(eq(budgetRequests.departmentId, id))
    .orderBy(desc(budgetCycles.budgetYear));

  let matches: string[] = [];
  let mergeTargets: { id: string; name: string }[] = [];
  if (department.status === "proposed") {
    mergeTargets = await tx
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .where(and(eq(departments.status, "active"), ne(departments.id, id)))
      .orderBy(asc(departments.name));
    matches = closeMatches(
      department.name,
      mergeTargets.map((t) => t.name),
    );
  }
  return {
    department,
    leaders,
    proposedBy: proposer?.name ?? null,
    requests,
    matches,
    mergeTargets,
  };
}
