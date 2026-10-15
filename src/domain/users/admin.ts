import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { adminCopy } from "@/copy/admin";
import { userRoles, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { promoteBackupsWhenPrimaryLeaves } from "@/domain/departments/service";
import { ConflictError, parseInput, RuleError, ValidationError } from "@/domain/errors";
import { clearPrimaryAccountantIf } from "@/domain/settings/service";
import { writeAudit, type AuditActor } from "@/lib/audit";
import { assertCan, type Subject } from "@/lib/authz";
import { ROLES, type Role } from "@/lib/roles";

/**
 * Users and roles (FR-02, Requirements 3, 20.5). Staff are added by email address; a
 * person's permissions are the union of their roles. Removing a role or deactivating
 * someone never touches their history: past decisions keep their name.
 */

const u = adminCopy.users;

type UserRow = typeof users.$inferSelect;

const rolesSchema = z.array(z.enum(ROLES)).min(1, u.errors.rolesRequired);
const versionSchema = z.coerce.number().int().positive();

async function loadUser(tx: Tx, id: string): Promise<UserRow> {
  const [row] = z.uuid().safeParse(id).success
    ? await tx.select().from(users).where(eq(users.id, id)).limit(1)
    : [];
  if (!row) throw new RuleError(adminCopy.common.notFound);
  return row;
}

export async function rolesOfUser(tx: Tx, userId: string): Promise<Role[]> {
  const rows = await tx
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  return rows.map((r) => r.role);
}

/** Active System Administrators other than `exceptUserId`. */
async function otherActiveAdmins(tx: Tx, exceptUserId: string): Promise<number> {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(
      and(
        eq(userRoles.role, "system_admin"),
        eq(users.active, true),
        ne(users.accessStatus, "inactive"),
        ne(users.id, exceptUserId),
      ),
    );
  return rows.length;
}

async function bumpUser(
  tx: Tx,
  id: string,
  version: number,
  set: Partial<typeof users.$inferInsert>,
) {
  const rows = await tx
    .update(users)
    .set({ ...set, version: sql`${users.version} + 1`, updatedAt: new Date() })
    .where(and(eq(users.id, id), eq(users.version, version)))
    .returning({ id: users.id });
  if (rows.length === 0) throw new ConflictError({ type: "user", id });
}

const actorOf = (actor: Subject, actingRole: Role): AuditActor => ({
  kind: "user",
  userId: actor.id,
  actingRole,
});

// ---------------------------------------------------------------- add staff

const addStaffSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email(u.errors.emailInvalid)),
  displayName: z.string().trim().min(1, u.errors.nameRequired).max(100),
  roles: rolesSchema,
});

export async function addStaff(
  tx: Tx,
  actor: Subject,
  input: { email: string; displayName: string; roles: string[] },
): Promise<{ userId: string; name: string }> {
  const { actingRole } = assertCan(actor, "admin.users");
  const data = parseInput(addStaffSchema, input);
  const existing = await tx
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${data.email}`)
    .limit(1);
  if (existing.length > 0) throw new ValidationError({ email: u.errors.emailTaken });

  const roles = [...new Set(data.roles)];
  const [created] = await tx
    .insert(users)
    .values({ email: data.email, displayName: data.displayName, accessStatus: "active" })
    .returning({ id: users.id });
  await tx
    .insert(userRoles)
    .values(roles.map((role) => ({ userId: created.id, role, assignedByUserId: actor.id })));
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "admin",
    eventType: "admin.user_added",
    entity: { type: "user", id: created.id },
    details: { after: { email: data.email, name: data.displayName, roles } },
  });
  // TODO(step 7): email the person that they have access (DRD 7.5 "role change").
  return { userId: created.id, name: data.displayName };
}

// ---------------------------------------------------------------- roles

/**
 * Replaces a person's roles. Refuses to remove the System Administrator role from the
 * last active administrator (Requirements 20.5), so the church never loses access.
 */
export async function setUserRoles(
  tx: Tx,
  actor: Subject,
  input: { userId: string; roles: string[]; version: unknown },
): Promise<void> {
  const { actingRole } = assertCan(actor, "admin.users");
  const { roles: wanted, version } = parseInput(
    z.object({ roles: rolesSchema, version: versionSchema }),
    input,
  );
  const user = await loadUser(tx, input.userId);
  const current = await rolesOfUser(tx, user.id);
  const next = [...new Set(wanted)];
  const added = next.filter((r) => !current.includes(r));
  const removed = current.filter((r) => !next.includes(r));
  if (added.length === 0 && removed.length === 0) return;

  if (removed.includes("system_admin") && (await otherActiveAdmins(tx, user.id)) === 0) {
    throw new RuleError(u.errors.lastAdmin);
  }

  await bumpUser(tx, user.id, version, {});
  for (const role of removed) {
    await tx.delete(userRoles).where(and(eq(userRoles.userId, user.id), eq(userRoles.role, role)));
  }
  if (added.length > 0) {
    await tx
      .insert(userRoles)
      .values(added.map((role) => ({ userId: user.id, role, assignedByUserId: actor.id })));
  }
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "admin",
    eventType: "admin.roles_changed",
    entity: { type: "user", id: user.id },
    details: {
      person: { id: user.id, name: user.displayName },
      before: { roles: current },
      after: { roles: next },
    },
  });
  if (removed.includes("requester")) {
    await promoteBackupsWhenPrimaryLeaves(
      tx,
      user.id,
      actorOf(actor, actingRole),
      "Primary lost the Requester role",
    );
  }
  if (removed.includes("accountant")) {
    await clearPrimaryAccountantIf(
      tx,
      user.id,
      actorOf(actor, actingRole),
      "the Primary accountant lost the Accountant role",
    );
  }
  // TODO(step 7): email the person about the role change (DRD 7.5).
}

// ---------------------------------------------------------------- activate / deactivate

export async function setUserActive(
  tx: Tx,
  actor: Subject,
  input: { userId: string; active: boolean; version: unknown },
): Promise<{ name: string }> {
  const { actingRole } = assertCan(actor, "admin.users");
  const { version } = parseInput(z.object({ version: versionSchema }), input);
  const user = await loadUser(tx, input.userId);
  if (user.active === input.active) return { name: user.displayName };

  if (!input.active) {
    if (user.id === actor.id) throw new RuleError(u.errors.selfDeactivate);
    const roles = await rolesOfUser(tx, user.id);
    if (roles.includes("system_admin") && (await otherActiveAdmins(tx, user.id)) === 0) {
      throw new RuleError(u.errors.lastAdminDeactivate);
    }
  }

  await bumpUser(tx, user.id, version, { active: input.active });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "admin",
    eventType: input.active ? "admin.user_reactivated" : "admin.user_deactivated",
    entity: { type: "user", id: user.id },
    details: {
      person: { id: user.id, name: user.displayName },
      before: { active: user.active },
      after: { active: input.active },
    },
  });
  if (!input.active) {
    await promoteBackupsWhenPrimaryLeaves(
      tx,
      user.id,
      actorOf(actor, actingRole),
      "Primary was deactivated",
    );
    await clearPrimaryAccountantIf(
      tx,
      user.id,
      actorOf(actor, actingRole),
      "the Primary accountant was deactivated",
    );
  }
  return { name: user.displayName };
}
