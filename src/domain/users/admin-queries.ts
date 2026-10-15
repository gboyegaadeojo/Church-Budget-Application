import { and, asc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { departments, userDepartments, userRoles, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import type { RepresentativeType, Role } from "@/lib/roles";

/** Read models for Admin → Users & Roles. Callers check `admin.users` first. */

export type UserListItem = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  accessStatus: (typeof users.accessStatus.enumValues)[number];
  roles: Role[];
  departments: { id: string; name: string; type: RepresentativeType }[];
};

export async function listUsers(tx: Tx, query = ""): Promise<UserListItem[]> {
  const q = query.trim().slice(0, 100);
  const where: SQL | undefined = q
    ? or(ilike(users.displayName, `%${q}%`), ilike(users.email, `%${q}%`))
    : undefined;
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(where)
    .orderBy(asc(users.displayName))
    .limit(500);
  if (rows.length === 0) return [];
  const items = await listUsersByIds(
    tx,
    rows.map((r) => r.id),
  );
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getUserDetail(tx: Tx, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [user] = await tx.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) return null;
  const [item] = (await listUsersByIds(tx, [id])) ?? [];
  return { user, roles: item?.roles ?? [], departments: item?.departments ?? [] };
}

async function listUsersByIds(tx: Tx, ids: string[]): Promise<UserListItem[]> {
  const rows = await tx.select().from(users).where(inArray(users.id, ids));
  const roleRows = await tx.select().from(userRoles).where(inArray(userRoles.userId, ids));
  const deptRows = await tx
    .select({
      userId: userDepartments.userId,
      id: departments.id,
      name: departments.name,
      type: userDepartments.representativeType,
    })
    .from(userDepartments)
    .innerJoin(departments, eq(departments.id, userDepartments.departmentId))
    .where(
      and(
        inArray(userDepartments.userId, ids),
        inArray(departments.status, ["active", "inactive", "proposed"]),
      ),
    )
    .orderBy(asc(departments.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.displayName,
    email: r.email,
    active: r.active,
    accessStatus: r.accessStatus,
    roles: roleRows.filter((x) => x.userId === r.id).map((x) => x.role),
    departments: deptRows.filter((x) => x.userId === r.id),
  }));
}

/** Verified Group Leaders who can lead a department (FR-38), for the picker. */
export async function leaderCandidates(tx: Tx, requireVerified: boolean) {
  const rows = await tx
    .selectDistinct({ id: users.id, name: users.displayName, email: users.email })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(
      and(
        eq(userRoles.role, "requester"),
        eq(users.active, true),
        inArray(users.accessStatus, ["active", "pending_department"]),
        requireVerified ? eq(users.pcoLeaderVerified, true) : undefined,
      ),
    )
    .orderBy(asc(users.displayName));
  return rows;
}

/** Requesters who currently fail the Group Leader check (FR-01a Settings list). */
export async function failingRequesters(tx: Tx) {
  return tx
    .selectDistinct({
      id: users.id,
      name: users.displayName,
      email: users.email,
      accessStatus: users.accessStatus,
      verifiedAt: users.pcoVerifiedAt,
      fieldValue: users.pcoFieldValueSnapshot,
    })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(
      and(
        eq(userRoles.role, "requester"),
        eq(users.active, true),
        or(eq(users.accessStatus, "suspended_not_leader"), eq(users.pcoLeaderVerified, false)),
      ),
    )
    .orderBy(asc(users.displayName));
}
