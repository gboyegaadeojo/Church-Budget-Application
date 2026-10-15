import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { adminCopy } from "@/copy/admin";
import {
  budgetCycles,
  budgetRequests,
  departments,
  userDepartments,
  userRoles,
  users,
} from "@/db/schema";
import type { Tx } from "@/db/types";
import {
  canTransition as canTransitionAnnual,
  transition as transitionAnnual,
} from "@/domain/annual/status";
import { ConflictError, parseInput, RuleError, ValidationError } from "@/domain/errors";
import { readSettings } from "@/domain/settings";
import { writeAudit, type AuditActor } from "@/lib/audit";
import { assertCan, type Subject } from "@/lib/authz";
import type { RepresentativeType, Role } from "@/lib/roles";
import { parseNameList, tidyName } from "./matching";
import { transitionDepartment, type DepartmentEvent } from "./status";

/**
 * Departments (FR-03) and their Primary, Backup and Representatives (FR-38).
 * Each function: permission check → validation → state machine → write → audit, all in
 * the caller's transaction.
 */

const d = adminCopy.departments;
const MAX_NAME = 80;
const MAX_BULK = 200;

type DepartmentRow = typeof departments.$inferSelect;

const actorOf = (actor: Subject, actingRole: Role): AuditActor => ({
  kind: "user",
  userId: actor.id,
  actingRole,
});

const STATUS_EVENT_TYPES: Record<DepartmentEvent, string> = {
  accept: "admin.department_accepted",
  merge: "admin.department_merged",
  reject: "admin.department_rejected",
  deactivate: "admin.department_deactivated",
  reactivate: "admin.department_reactivated",
};

async function loadDepartment(tx: Tx, id: string): Promise<DepartmentRow> {
  const [row] = z.uuid().safeParse(id).success
    ? await tx.select().from(departments).where(eq(departments.id, id)).limit(1)
    : [];
  if (!row) throw new RuleError(adminCopy.common.notFound);
  return row;
}

async function nameTaken(tx: Tx, name: string, exceptId?: string): Promise<boolean> {
  const rows = await tx
    .select({ id: departments.id })
    .from(departments)
    .where(
      and(
        sql`lower(${departments.name}) = ${name.toLowerCase()}`,
        ne(departments.status, "rejected"),
        exceptId ? ne(departments.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Updates a department if nobody changed it since `version` was read. */
async function updateDepartment(
  tx: Tx,
  id: string,
  version: number,
  set: Partial<typeof departments.$inferInsert>,
): Promise<void> {
  const rows = await tx
    .update(departments)
    .set({ ...set, version: sql`${departments.version} + 1`, updatedAt: new Date() })
    .where(and(eq(departments.id, id), eq(departments.version, version)))
    .returning({ id: departments.id });
  if (rows.length === 0) throw new ConflictError({ type: "department", id });
}

const nameSchema = z
  .string()
  .transform(tidyName)
  .pipe(z.string().min(1, d.errors.nameRequired).max(MAX_NAME, d.errors.nameTooLong));
const versionSchema = z.coerce.number().int().positive();

// ---------------------------------------------------------------- the list

/** Adds one or many departments, one name per line (FR-03 "paste a list"). */
export async function addDepartments(
  tx: Tx,
  actor: Subject,
  input: { names: string },
): Promise<{ added: string[]; skipped: string[] }> {
  const { actingRole } = assertCan(actor, "admin.departments");
  const names = parseNameList(input.names ?? "");
  if (names.length === 0) throw new ValidationError({ names: d.errors.nothingToAdd });
  if (names.length > MAX_BULK) throw new ValidationError({ names: d.errors.tooMany });
  const tooLong = names.find((n) => n.length > MAX_NAME);
  if (tooLong)
    throw new ValidationError({ names: `${d.errors.nameTooLong} ("${tooLong.slice(0, 30)}…")` });

  const added: string[] = [];
  const skipped: string[] = [];
  for (const name of names) {
    if (await nameTaken(tx, name)) {
      skipped.push(name);
      continue;
    }
    const [row] = await tx.insert(departments).values({ name }).returning({ id: departments.id });
    await writeAudit(tx, {
      actor: actorOf(actor, actingRole),
      area: "admin",
      eventType: "admin.department_added",
      entity: { type: "department", id: row.id },
      departmentId: row.id,
      details: { after: { name, status: "active" } },
    });
    added.push(name);
  }
  return { added, skipped };
}

export async function renameDepartment(
  tx: Tx,
  actor: Subject,
  input: { id: string; name: string; version: unknown },
): Promise<void> {
  const { actingRole } = assertCan(actor, "admin.departments");
  const { name, version } = parseInput(
    z.object({ name: nameSchema, version: versionSchema }),
    input,
  );
  const department = await loadDepartment(tx, input.id);
  if (department.name === name) return;
  if (await nameTaken(tx, name, department.id)) {
    throw new ValidationError({ name: d.errors.exists(name) });
  }
  await updateDepartment(tx, department.id, version, { name });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "admin",
    eventType: "admin.department_renamed",
    entity: { type: "department", id: department.id },
    departmentId: department.id,
    details: { before: { name: department.name }, after: { name } },
  });
}

async function changeStatus(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown },
  event: DepartmentEvent,
  extra: { reason?: string; set?: Partial<typeof departments.$inferInsert> } = {},
): Promise<{ department: DepartmentRow; actingRole: Role }> {
  const { actingRole } = assertCan(actor, "admin.departments");
  const { version } = parseInput(z.object({ version: versionSchema }), input);
  const department = await loadDepartment(tx, input.id);
  let next;
  try {
    next = transitionDepartment(department.status, event);
  } catch {
    throw new RuleError(d.errors.notAllowed(department.status));
  }
  await updateDepartment(tx, department.id, version, { status: next, ...extra.set });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "admin",
    eventType: STATUS_EVENT_TYPES[event],
    entity: { type: "department", id: department.id },
    departmentId: department.id,
    reason: extra.reason,
    details: { before: { status: department.status }, after: { status: next, ...extra.set } },
  });
  return { department, actingRole };
}

export async function setDepartmentActive(
  tx: Tx,
  actor: Subject,
  input: { id: string; active: boolean; version: unknown },
): Promise<void> {
  await changeStatus(tx, actor, input, input.active ? "reactivate" : "deactivate");
}

// ---------------------------------------------------------------- proposed departments

/** Add to list: the proposed department becomes active. */
export async function acceptProposed(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown },
): Promise<void> {
  const department = await loadDepartment(tx, input.id);
  if (await nameTaken(tx, department.name, department.id)) {
    throw new RuleError(d.errors.exists(department.name));
  }
  await changeStatus(tx, actor, input, "accept");
  // TODO(step 7): email the requester that their department was added (FR-03).
}

/** Merge into an existing department: submissions and leaders move there. */
export async function mergeProposed(
  tx: Tx,
  actor: Subject,
  input: { id: string; intoId: string; version: unknown },
): Promise<void> {
  assertCan(actor, "admin.departments");
  const target = z.uuid().safeParse(input.intoId).success
    ? (await tx.select().from(departments).where(eq(departments.id, input.intoId)).limit(1))[0]
    : undefined;
  if (!target || target.status !== "active" || target.id === input.id) {
    throw new ValidationError({ intoId: d.errors.mergeTarget });
  }

  // Requests move unless the target already has one in that cycle (one per cycle, rule 1).
  const requests = await tx
    .select({
      id: budgetRequests.id,
      cycleId: budgetRequests.budgetCycleId,
      cycleName: budgetCycles.name,
    })
    .from(budgetRequests)
    .innerJoin(budgetCycles, eq(budgetCycles.id, budgetRequests.budgetCycleId))
    .where(eq(budgetRequests.departmentId, input.id));
  for (const request of requests) {
    const clash = await tx
      .select({ id: budgetRequests.id })
      .from(budgetRequests)
      .where(
        and(
          eq(budgetRequests.departmentId, target.id),
          eq(budgetRequests.budgetCycleId, request.cycleId),
        ),
      )
      .limit(1);
    if (clash.length > 0)
      throw new RuleError(d.errors.mergeConflict(target.name, request.cycleName));
  }

  const { department: proposed, actingRole } = await changeStatus(tx, actor, input, "merge", {
    set: { mergedIntoDepartmentId: target.id },
  });

  for (const request of requests) {
    await tx
      .update(budgetRequests)
      .set({
        departmentId: target.id,
        departmentNameSnapshot: target.name,
        version: sql`${budgetRequests.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(budgetRequests.id, request.id));
  }

  // Leaders join the target; the first becomes Primary if it has none (FR-38).
  const leaders = await tx
    .select()
    .from(userDepartments)
    .where(eq(userDepartments.departmentId, proposed.id));
  for (const leader of leaders) {
    const current = await tx
      .select({ type: userDepartments.representativeType, userId: userDepartments.userId })
      .from(userDepartments)
      .where(eq(userDepartments.departmentId, target.id));
    if (current.some((c) => c.userId === leader.userId)) continue;
    const hasPrimary = current.some((c) => c.type === "primary");
    await tx.insert(userDepartments).values({
      userId: leader.userId,
      departmentId: target.id,
      representativeType: hasPrimary ? "representative" : "primary",
      source: leader.source,
      assignedByUserId: actor.id,
    });
  }
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "admin",
    eventType: "admin.department_merge_moved",
    entity: { type: "department", id: target.id },
    departmentId: target.id,
    details: {
      from: { id: proposed.id, name: proposed.name },
      requestsMoved: requests.map((r) => r.id),
      leadersMoved: leaders.map((l) => l.userId),
    },
  });
  // TODO(step 7): email the requester that the submission moved (FR-03, AC-16).
}

/** Reject with a reason: its submissions go back to Draft to pick a listed department. */
export async function rejectProposed(
  tx: Tx,
  actor: Subject,
  input: { id: string; reason: string; version: unknown },
): Promise<void> {
  const reason = (input.reason ?? "").trim();
  if (!reason) throw new ValidationError({ reason: adminCopy.common.reasonRequired });
  const { department: proposed, actingRole } = await changeStatus(tx, actor, input, "reject", {
    reason,
  });
  const requests = await tx
    .select({ id: budgetRequests.id, status: budgetRequests.status })
    .from(budgetRequests)
    .where(eq(budgetRequests.departmentId, proposed.id));
  for (const request of requests) {
    if (!canTransitionAnnual(request.status, "department_rejected")) continue;
    const next = transitionAnnual(request.status, "department_rejected");
    await tx
      .update(budgetRequests)
      .set({ status: next, version: sql`${budgetRequests.version} + 1`, updatedAt: new Date() })
      .where(eq(budgetRequests.id, request.id));
    await writeAudit(tx, {
      actor: actorOf(actor, actingRole),
      area: "annual",
      eventType: "annual.returned_to_draft",
      entity: { type: "budget_request", id: request.id },
      budgetRequestId: request.id,
      departmentId: proposed.id,
      reason,
      details: { before: { status: request.status }, after: { status: next } },
    });
  }
  // TODO(step 7): email the requester with the reason (FR-03).
}

// ---------------------------------------------------------------- leaders (FR-38)

type LeaderRow = typeof userDepartments.$inferSelect;

async function leadersOf(tx: Tx, departmentId: string): Promise<LeaderRow[]> {
  return tx.select().from(userDepartments).where(eq(userDepartments.departmentId, departmentId));
}

async function setType(tx: Tx, rowId: string, type: RepresentativeType, assignedBy: string | null) {
  await tx
    .update(userDepartments)
    .set({
      representativeType: type,
      assignedByUserId: assignedBy,
      version: sql`${userDepartments.version} + 1`,
      // Away dates belong to the Primary only (FR-38).
      ...(type === "primary" ? {} : { awayFrom: null, awayUntil: null }),
    })
    .where(eq(userDepartments.id, rowId));
}

const ACTION_FOR: Record<
  RepresentativeType,
  "department.set_primary" | "department.set_backup" | "admin.departments"
> = {
  primary: "department.set_primary",
  backup: "department.set_backup",
  representative: "admin.departments",
};

/** Makes someone the department's Primary, Backup or a Representative. */
export async function setRepresentative(
  tx: Tx,
  actor: Subject,
  input: { departmentId: string; userId: string; type: string },
): Promise<void> {
  const type = parseInput(z.enum(["primary", "backup", "representative"]), input.type);
  const { actingRole } = assertCan(actor, ACTION_FOR[type], { departmentId: input.departmentId });
  const department = await loadDepartment(tx, input.departmentId);
  if (department.status !== "active" && department.status !== "proposed") {
    throw new RuleError(d.errors.inactiveDepartment);
  }

  const [person] = z.uuid().safeParse(input.userId).success
    ? await tx.select().from(users).where(eq(users.id, input.userId)).limit(1)
    : [];
  if (!person) throw new ValidationError({ userId: adminCopy.common.notFound });
  if (!person.active || person.accessStatus === "inactive") {
    throw new ValidationError({ userId: d.errors.inactiveUser });
  }
  const roles = await tx
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, person.id));
  if (!roles.some((r) => r.role === "requester"))
    throw new ValidationError({ userId: d.errors.notRequester });
  const { pco_require_for_requesters } = await readSettings(tx, ["pco_require_for_requesters"]);
  if (
    pco_require_for_requesters === "true" &&
    (!person.pcoLeaderVerified || person.accessStatus === "suspended_not_leader")
  ) {
    throw new ValidationError({ userId: d.errors.notLeader });
  }

  const leaders = await leadersOf(tx, department.id);
  const mine = leaders.find((l) => l.userId === person.id);
  if (mine?.representativeType === type) return;

  const holder = leaders.find((l) => l.representativeType === type && l.userId !== person.id);
  if (type === "primary" && holder) {
    // "Make Primary" on the Backup swaps them; otherwise the old Primary becomes a Representative.
    if (mine?.representativeType === "backup") {
      await setType(tx, mine.id, "representative", actor.id);
      await setType(tx, holder.id, "backup", actor.id);
    } else {
      await setType(tx, holder.id, "representative", actor.id);
    }
  } else if (type === "backup" && holder) {
    await setType(tx, holder.id, "representative", actor.id);
  }

  if (mine) {
    await setType(tx, mine.id, type, actor.id);
  } else {
    await tx.insert(userDepartments).values({
      userId: person.id,
      departmentId: department.id,
      representativeType: type,
      source: "manual",
      assignedByUserId: actor.id,
    });
  }
  if (person.accessStatus === "pending_department") {
    await tx
      .update(users)
      .set({ accessStatus: "active", updatedAt: new Date() })
      .where(eq(users.id, person.id));
  }

  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "admin",
    eventType: "admin.department_leader_changed",
    entity: { type: "department", id: department.id },
    departmentId: department.id,
    details: {
      person: { id: person.id, name: person.displayName },
      before: { type: mine?.representativeType ?? null },
      after: { type },
      replaced: holder ? { userId: holder.userId, type: holder.representativeType } : null,
    },
  });
}

/** Removes someone from a department. If they were the Primary, the Backup takes over. */
export async function removeRepresentative(
  tx: Tx,
  actor: Subject,
  input: { departmentId: string; userId: string },
): Promise<void> {
  const { actingRole } = assertCan(actor, "admin.departments");
  const department = await loadDepartment(tx, input.departmentId);
  const leaders = await leadersOf(tx, department.id);
  const row = leaders.find((l) => l.userId === input.userId);
  if (!row) throw new RuleError(adminCopy.common.notFound);

  await tx.delete(userDepartments).where(eq(userDepartments.id, row.id));
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "admin",
    eventType: "admin.department_leader_removed",
    entity: { type: "department", id: department.id },
    departmentId: department.id,
    details: { person: { id: input.userId }, before: { type: row.representativeType } },
  });
  if (row.representativeType === "primary") {
    await promoteBackup(
      tx,
      department.id,
      actorOf(actor, actingRole),
      "Primary removed from the department",
    );
  }
}

async function promoteBackup(tx: Tx, departmentId: string, actor: AuditActor, why: string) {
  const [backup] = await tx
    .select()
    .from(userDepartments)
    .where(
      and(
        eq(userDepartments.departmentId, departmentId),
        eq(userDepartments.representativeType, "backup"),
      ),
    )
    .limit(1);
  if (!backup) return;
  await setType(tx, backup.id, "primary", null);
  await writeAudit(tx, {
    actor,
    area: "admin",
    eventType: "admin.department_backup_promoted",
    entity: { type: "department", id: departmentId },
    departmentId,
    reason: `Automatic: ${why}; the Backup became Primary`,
    details: {
      person: { id: backup.userId },
      before: { type: "backup" },
      after: { type: "primary" },
    },
  });
  // TODO(step 7): email the administrator (FR-38).
}

/**
 * FR-38: when a Primary is deactivated, suspended or loses the requester role, the
 * Backup becomes Primary. The former Primary stays linked as a Representative.
 */
export async function promoteBackupsWhenPrimaryLeaves(
  tx: Tx,
  userId: string,
  actor: AuditActor,
  why: string,
): Promise<void> {
  const rows = await tx
    .select()
    .from(userDepartments)
    .where(
      and(eq(userDepartments.userId, userId), eq(userDepartments.representativeType, "primary")),
    );
  for (const row of rows) {
    await setType(tx, row.id, "representative", null);
    await promoteBackup(tx, row.departmentId, actor, why);
  }
}
