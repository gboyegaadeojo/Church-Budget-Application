import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { adminCopy } from "@/copy/admin";
import { departments, expenseSubmitters, userDepartments, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { actorOf } from "@/domain/annual/service";
import { RuleError } from "@/domain/errors";
import { writeAudit } from "@/lib/audit";
import { assertCan, authorize, type Subject } from "@/lib/authz";
import { rolesOfUser } from "./admin";

/**
 * The Expense submitter permission (6B.2): the administrator lets someone who isn't a
 * department representative (for example a volunteer who buys for Media) submit expenses
 * for the departments they're given, and only those. They see and change only what they
 * submitted. They need the Requester role (so they're checked in Planning Center like
 * every requester, FR-01a), or are the Church Administrator submitting for a department. A removal is recorded, not deleted, and both are audited.
 */

const s = adminCopy.users.submitter;

export type SubmitterDepartment = { id: string; name: string; since: Date };

/** The departments a person submits expenses for, for their user page. */
export async function submitterDepartmentsOf(
  tx: Tx,
  viewer: Subject,
  userId: string,
): Promise<SubmitterDepartment[] | null> {
  if (!authorize(viewer, "admin.users").allowed) return null;
  if (!z.uuid().safeParse(userId).success) return null;
  return tx
    .select({ id: departments.id, name: departments.name, since: expenseSubmitters.createdAt })
    .from(expenseSubmitters)
    .innerJoin(departments, eq(departments.id, expenseSubmitters.departmentId))
    .where(and(eq(expenseSubmitters.userId, userId), isNull(expenseSubmitters.removedAt)))
    .orderBy(asc(departments.name));
}

async function loadPerson(tx: Tx, userId: string) {
  const [person] = z.uuid().safeParse(userId).success
    ? await tx.select().from(users).where(eq(users.id, userId)).limit(1)
    : [];
  if (!person) throw new RuleError(adminCopy.common.notFound);
  return person;
}

async function loadDepartment(tx: Tx, departmentId: string) {
  const [department] = z.uuid().safeParse(departmentId).success
    ? await tx.select().from(departments).where(eq(departments.id, departmentId)).limit(1)
    : [];
  if (!department) throw new RuleError(adminCopy.common.notFound);
  return department;
}

export async function addExpenseSubmitter(
  tx: Tx,
  actor: Subject,
  input: { userId: string; departmentId: string },
  { now = new Date() }: { now?: Date } = {},
): Promise<{ department: string }> {
  const { actingRole } = assertCan(actor, "admin.users");
  const person = await loadPerson(tx, input.userId);
  const department = await loadDepartment(tx, input.departmentId);
  if (department.status !== "active") throw new RuleError(s.errors.inactiveDepartment);
  const roles = await rolesOfUser(tx, person.id);
  if (!roles.includes("requester") && !roles.includes("church_admin")) {
    throw new RuleError(s.errors.needsRequester);
  }
  const [represents] = await tx
    .select({ id: userDepartments.id })
    .from(userDepartments)
    .where(
      and(eq(userDepartments.userId, person.id), eq(userDepartments.departmentId, department.id)),
    );
  if (represents) throw new RuleError(s.errors.alreadyRepresents);
  const [existing] = await tx
    .select({ id: expenseSubmitters.id })
    .from(expenseSubmitters)
    .where(
      and(
        eq(expenseSubmitters.userId, person.id),
        eq(expenseSubmitters.departmentId, department.id),
        isNull(expenseSubmitters.removedAt),
      ),
    );
  if (existing) return { department: department.name };

  await tx.insert(expenseSubmitters).values({
    userId: person.id,
    departmentId: department.id,
    assignedByUserId: actor.id,
    createdAt: now,
  });
  // A verified leader waiting for a department can now sign in (FR-01a).
  if (person.accessStatus === "pending_department") {
    await tx
      .update(users)
      .set({ accessStatus: "active", updatedAt: now })
      .where(eq(users.id, person.id));
  }
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "admin",
    eventType: "admin.expense_submitter_added",
    entity: { type: "user", id: person.id },
    departmentId: department.id,
    details: {
      person: { id: person.id, name: person.displayName },
      department: { id: department.id, name: department.name },
    },
  });
  return { department: department.name };
}

export async function removeExpenseSubmitter(
  tx: Tx,
  actor: Subject,
  input: { userId: string; departmentId: string },
  { now = new Date() }: { now?: Date } = {},
): Promise<{ department: string }> {
  const { actingRole } = assertCan(actor, "admin.users");
  const person = await loadPerson(tx, input.userId);
  const department = await loadDepartment(tx, input.departmentId);
  const removed = await tx
    .update(expenseSubmitters)
    .set({ removedAt: now, removedByUserId: actor.id })
    .where(
      and(
        eq(expenseSubmitters.userId, person.id),
        eq(expenseSubmitters.departmentId, department.id),
        isNull(expenseSubmitters.removedAt),
      ),
    )
    .returning({ id: expenseSubmitters.id });
  if (removed.length === 0) return { department: department.name };
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "admin",
    eventType: "admin.expense_submitter_removed",
    entity: { type: "user", id: person.id },
    departmentId: department.id,
    details: {
      person: { id: person.id, name: person.displayName },
      department: { id: department.id, name: department.name },
    },
  });
  return { department: department.name };
}
