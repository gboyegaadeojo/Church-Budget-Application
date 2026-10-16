import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { budgetCycles, budgetRequests, departments, userDepartments, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import type { RepresentativeType } from "@/lib/roles";
import { closeMatches } from "./matching";
import { SLOT_ORDER, slotOf, type LeaderSlot } from "./slots";
import type { DepartmentStatus } from "./status";

/** Read models for Admin → Departments. Callers check `admin.departments` first. */

export type Leader = {
  userId: string;
  name: string;
  email: string;
  type: RepresentativeType;
  slot: LeaderSlot;
  verified: boolean;
  /** How they were linked: by the administrator, by picking it on the form, or Planning Center. */
  source: "manual" | "form_pick" | "pco_mapping";
  /** For Planning Center links: still listed, or no longer listed in their Ministry Department. */
  pcoStatus: "suggested" | "confirmed" | "no_longer_leader" | "ignored" | null;
};

export type DepartmentListItem = {
  id: string;
  name: string;
  status: DepartmentStatus;
  primary: Leader | null;
  /** Backup 1 then Backup 2 (FR-38). */
  backups: Leader[];
  representatives: number;
  /** The Planning Center team, group or tag it's linked to (FR-39), if any. */
  pcoSource: string | null;
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
      backupRank: userDepartments.backupRank,
      verified: users.pcoLeaderVerified,
      source: userDepartments.source,
      pcoStatus: userDepartments.pcoStatus,
    })
    .from(userDepartments)
    .innerJoin(users, eq(users.id, userDepartments.userId))
    .where(inArray(userDepartments.departmentId, ids))
    .orderBy(asc(users.displayName));
  for (const { departmentId, backupRank, ...leader } of rows) {
    const withSlot = { ...leader, slot: slotOf({ type: leader.type, backupRank }) };
    map.set(departmentId, [...(map.get(departmentId) ?? []), withSlot]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot] || a.name.localeCompare(b.name));
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
      backups: list.filter((l) => l.type === "backup"),
      representatives: list.filter((l) => l.type === "representative").length,
      pcoSource:
        r.pcoSourceType && r.pcoSourceType !== "people_field_value" ? r.pcoSourceName : null,
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
