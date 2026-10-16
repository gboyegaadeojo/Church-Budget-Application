import { and, eq, inArray } from "drizzle-orm";
import { departments, userDepartments, userRoles, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { readSettings } from "@/domain/settings";
import type { Recipient } from "@/lib/email/outbox";
import type { Role } from "@/lib/roles";

/**
 * Who receives which email (FR-21). Only people who can sign in are emailed: the
 * links need a working account.
 */

export type NamedRecipient = Recipient & { userId: string; name: string };

const columns = { userId: users.id, email: users.email, name: users.displayName };
const canSignIn = and(eq(users.active, true), eq(users.accessStatus, "active"));

/** "Requester": every representative of the department, Primary, Backups and others (FR-32, FR-38). */
export async function departmentRepresentatives(
  tx: Tx,
  departmentId: string,
): Promise<NamedRecipient[]> {
  return tx
    .select(columns)
    .from(userDepartments)
    .innerJoin(users, eq(users.id, userDepartments.userId))
    .where(and(eq(userDepartments.departmentId, departmentId), canSignIn))
    .orderBy(users.displayName);
}

export async function usersWithRole(tx: Tx, roles: readonly Role[]): Promise<NamedRecipient[]> {
  const rows = await tx
    .selectDistinct(columns)
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(inArray(userRoles.role, [...roles]), canSignIn))
    .orderBy(users.displayName);
  return rows;
}

/**
 * "Accountant": the Primary accountant chosen in Settings (FR-33). Until one is chosen,
 * every accountant, so a submission is never announced to nobody. The backup approver
 * takes over while the Primary is away once Away arrives (FR-33, Stage 2).
 */
export async function accountantRecipients(tx: Tx): Promise<NamedRecipient[]> {
  const accountants = await usersWithRole(tx, ["accountant"]);
  const { primary_accountant_user_id: primary } = await readSettings(tx, [
    "primary_accountant_user_id",
  ]);
  const chosen = accountants.find((a) => a.userId === primary);
  return chosen ? [chosen] : accountants;
}

/** "Administrators" in FR-21's System table: everyone with the System Administrator role. */
export function administrators(tx: Tx): Promise<NamedRecipient[]> {
  return usersWithRole(tx, ["system_admin"]);
}

/** One person, if they can sign in (a role or access email is about their own account). */
export async function person(tx: Tx, userId: string): Promise<NamedRecipient[]> {
  return tx
    .select(columns)
    .from(users)
    .where(and(eq(users.id, userId), canSignIn));
}

/** Representatives of every active department, for cycle announcements (FR-21). */
export async function allRepresentatives(tx: Tx): Promise<NamedRecipient[]> {
  return tx
    .selectDistinct(columns)
    .from(userDepartments)
    .innerJoin(users, eq(users.id, userDepartments.userId))
    .innerJoin(departments, eq(departments.id, userDepartments.departmentId))
    .where(and(eq(departments.status, "active"), canSignIn))
    .orderBy(users.displayName);
}

/** Representatives of the given departments. */
export async function representativesOf(
  tx: Tx,
  departmentIds: readonly string[],
): Promise<NamedRecipient[]> {
  if (departmentIds.length === 0) return [];
  return tx
    .selectDistinct(columns)
    .from(userDepartments)
    .innerJoin(users, eq(users.id, userDepartments.userId))
    .where(and(inArray(userDepartments.departmentId, [...departmentIds]), canSignIn))
    .orderBy(users.displayName);
}
