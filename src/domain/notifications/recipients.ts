import { and, eq, inArray } from "drizzle-orm";
import { departments, userDepartments, userPreferences, userRoles, users } from "@/db/schema";
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
 * "Accountant" (FR-21, FR-33): the Primary accountant chosen in Settings; while they're
 * Away, the backup approvers (everyone else with the Accountant or Backup approver role)
 * who aren't away themselves (AC-61). Until a Primary is chosen, every accountant who
 * isn't away. Never nobody: if everyone is away, the Primary (or every accountant).
 */
export async function accountantRecipients(
  tx: Tx,
  now: Date = new Date(),
): Promise<NamedRecipient[]> {
  return (await accountantCover(tx, now)).recipients;
}

export type AccountantCover = {
  recipients: NamedRecipient[];
  /** The Primary accountant, when one is chosen. */
  primary: NamedRecipient | null;
  /** The Primary is away, so `recipients` are covering for them. */
  primaryAway: boolean;
  primaryUntil: Date | null;
};

export async function accountantCover(tx: Tx, now: Date = new Date()): Promise<AccountantCover> {
  const approvers = await usersWithRole(tx, ["accountant", "backup_approver"]);
  const accountants = await usersWithRole(tx, ["accountant"]);
  const { primary_accountant_user_id: primaryId } = await readSettings(tx, [
    "primary_accountant_user_id",
  ]);
  const away = await awayWindows(
    tx,
    approvers.map((a) => a.userId),
    now,
  );
  const primary = accountants.find((a) => a.userId === primaryId) ?? null;
  if (!primary) {
    const present = accountants.filter((a) => !away.has(a.userId));
    return {
      recipients: present.length > 0 ? present : accountants,
      primary: null,
      primaryAway: false,
      primaryUntil: null,
    };
  }
  if (!away.has(primary.userId)) {
    return { recipients: [primary], primary, primaryAway: false, primaryUntil: null };
  }
  const covering = approvers.filter((a) => a.userId !== primary.userId && !away.has(a.userId));
  return {
    recipients: covering.length > 0 ? covering : [primary],
    primary,
    primaryAway: covering.length > 0,
    primaryUntil: away.get(primary.userId) ?? null,
  };
}

/** Of these people, who is away now, with the day they're back (null: open-ended). */
async function awayWindows(
  tx: Tx,
  userIds: string[],
  now: Date,
): Promise<Map<string, Date | null>> {
  if (userIds.length === 0) return new Map();
  const rows = await tx
    .select()
    .from(userPreferences)
    .where(inArray(userPreferences.userId, userIds));
  return new Map(
    rows
      .filter(
        (r) =>
          r.awayFrom !== null &&
          r.awayFrom.getTime() <= now.getTime() &&
          (r.awayUntil === null || now.getTime() < r.awayUntil.getTime()),
      )
      .map((r) => [r.userId, r.awayUntil]),
  );
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

/**
 * Who may give a second approval (FR-34): every accountant and backup approver except the
 * first approver and anyone who represents the department (FR-33), preferring those who
 * aren't away; if all of them are, all of them.
 */
export async function secondApprovers(
  tx: Tx,
  input: { departmentId: string; firstApproverId: string },
  now: Date = new Date(),
): Promise<NamedRecipient[]> {
  const approvers = await usersWithRole(tx, ["accountant", "backup_approver"]);
  const representatives = new Set(
    (
      await tx
        .select({ userId: userDepartments.userId })
        .from(userDepartments)
        .where(eq(userDepartments.departmentId, input.departmentId))
    ).map((r) => r.userId),
  );
  const eligible = approvers.filter(
    (a) => a.userId !== input.firstApproverId && !representatives.has(a.userId),
  );
  const away = await awayWindows(
    tx,
    eligible.map((a) => a.userId),
    now,
  );
  const present = eligible.filter((a) => !away.has(a.userId));
  return present.length > 0 ? present : eligible;
}

export type BoardCover = {
  /** Who gives the final approval now: Board Chairs, or the Vice-Chair covering. */
  recipients: NamedRecipient[];
  /** No Board Chair can decide it (away or conflicted), so the Vice-Chair does (3.3). */
  viceCovering: boolean;
};

/**
 * Who gives an expense its final approval (3.3, FR-33, AC-112): the Board Chair, unless
 * they're Away, lead the department, submitted it or are paid by it; then the Vice-Chair
 * (who must not be conflicted either). Never nobody: if every Vice-Chair is away too,
 * those who aren't conflicted.
 */
export async function boardCover(
  tx: Tx,
  expense: { departmentId: string; payeeUserId: string | null; requesterUserId: string },
  now: Date = new Date(),
): Promise<BoardCover> {
  const chairs = await usersWithRole(tx, ["board_chair"]);
  const vices = await usersWithRole(tx, ["vice_chair"]);
  const leaders = new Set(
    (
      await tx
        .select({ userId: userDepartments.userId })
        .from(userDepartments)
        .where(eq(userDepartments.departmentId, expense.departmentId))
    ).map((r) => r.userId),
  );
  const free = (p: NamedRecipient) =>
    !leaders.has(p.userId) &&
    p.userId !== expense.payeeUserId &&
    p.userId !== expense.requesterUserId;
  const away = await awayWindows(
    tx,
    [...chairs, ...vices].map((p) => p.userId),
    now,
  );
  const present = (p: NamedRecipient) => free(p) && !away.has(p.userId);
  const chairsNow = chairs.filter(present);
  if (chairsNow.length > 0) return { recipients: chairsNow, viceCovering: false };
  // A person holding both roles is covering as the Chair would; leave them out here.
  const vicesNow = vices.filter((v) => present(v) && !chairs.some((c) => c.userId === v.userId));
  if (vicesNow.length > 0) return { recipients: vicesNow, viceCovering: true };
  const anyFree = [...chairs, ...vices].filter(free);
  const unique = [...new Map(anyFree.map((p) => [p.userId, p])).values()];
  return { recipients: unique, viceCovering: !chairs.some(free) };
}
