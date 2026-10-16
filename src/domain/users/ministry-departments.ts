import { and, eq, inArray } from "drizzle-orm";
import { departments, userDepartments, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { getDepartmentFieldSettings, type DepartmentFieldMode } from "@/domain/settings";
import { writeAudit, type AuditActor } from "@/lib/audit";
import { PlanningCenterUnavailableError, type PlanningCenterDirectory } from "@/lib/pco";
import type { Subject } from "@/lib/authz";

/**
 * The Planning Center "Ministry Department" field (FR-39's People-field source, built
 * early): each leader's ministries, matched to the app's departments, decide which
 * departments they represent. The mode is a setting:
 * - off: nothing happens;
 * - suggest: matched departments are joined automatically, and others can still be picked;
 * - restrict: only matched departments (and ones the administrator assigned) can be used.
 * The Group Leader check (FR-01a) still decides whether someone is a leader at all.
 */

export type MinistryRead =
  | { status: "read"; values: string[] }
  /** Planning Center is down, or the field doesn't exist: keep the last known values. */
  | { status: "unavailable"; reason: string };

/** Every value of the field for one person (a checkboxes field gives several). */
export async function readMinistryDepartments(
  directory: PlanningCenterDirectory,
  fieldName: string,
  pcoPersonId: string,
): Promise<MinistryRead> {
  try {
    const field = await directory.findFieldDefinition(fieldName);
    if (!field) {
      return {
        status: "unavailable",
        reason: `The Planning Center field "${fieldName}" was not found`,
      };
    }
    const values = await directory.getFieldValues(pcoPersonId, field.id);
    return {
      status: "read",
      values: [...new Set(values.map((v) => v.trim()).filter((v) => v !== ""))],
    };
  } catch (error) {
    if (error instanceof PlanningCenterUnavailableError) {
      return { status: "unavailable", reason: error.message };
    }
    throw error;
  }
}

export type MatchableDepartment = {
  id: string;
  name: string;
  /** The administrator's Planning Center value, when it differs from the name. */
  pcoValue: string | null;
};

const key = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The departments a set of field values names. A department matches on its Planning
 * Center value if the administrator set one, otherwise on its name; case and spacing
 * don't matter.
 */
export function matchDepartments(
  values: readonly string[],
  candidates: readonly MatchableDepartment[],
): MatchableDepartment[] {
  const wanted = new Set(values.map(key));
  return candidates.filter((d) => wanted.has(key(d.pcoValue ?? d.name)));
}

/**
 * Active departments with their match value. A department mapped to a Services team,
 * group or tag takes its leaders from there instead (FR-39: one source per department).
 */
export async function matchableDepartments(tx: Tx): Promise<MatchableDepartment[]> {
  const rows = await tx
    .select({
      id: departments.id,
      name: departments.name,
      sourceType: departments.pcoSourceType,
      sourceId: departments.pcoSourceId,
    })
    .from(departments)
    .where(eq(departments.status, "active"));
  return rows
    .filter((r) => r.sourceType === null || r.sourceType === "people_field_value")
    .map((r) => ({
      id: r.id,
      name: r.name,
      pcoValue: r.sourceType === "people_field_value" ? r.sourceId : null,
    }));
}

export type MinistrySync = { joined: string[]; noLongerListed: string[]; relisted: string[] };

/**
 * Brings a leader's department links in step with their Ministry Department values:
 * - joins each matched department they don't represent yet: Primary if it has none,
 *   otherwise Representative (FR-38), marked as from Planning Center; a leader waiting
 *   for a department becomes active;
 * - marks a Planning Center link whose department is no longer listed as "No longer
 *   listed in Planning Center", without removing it: the administrator decides;
 * - never touches links the administrator or the form made.
 * The values are stored on the user as the last known answer. Audited.
 */
export async function syncMinistryDepartments(
  tx: Tx,
  userId: string,
  values: readonly string[],
  options: { now: Date; actor: AuditActor },
): Promise<MinistrySync> {
  const { now, actor } = options;
  const result: MinistrySync = { joined: [], noLongerListed: [], relisted: [] };
  await tx
    .update(users)
    .set({ pcoMinistryDepartments: [...values], pcoDepartmentsCheckedAt: now })
    .where(eq(users.id, userId));

  const matched = matchDepartments(values, await matchableDepartments(tx));
  const matchedIds = new Set(matched.map((d) => d.id));
  const links = await tx.select().from(userDepartments).where(eq(userDepartments.userId, userId));
  const linked = new Set(links.map((l) => l.departmentId));

  for (const department of matched.filter((d) => !linked.has(d.id))) {
    const [primary] = await tx
      .select({ id: userDepartments.id })
      .from(userDepartments)
      .where(
        and(
          eq(userDepartments.departmentId, department.id),
          eq(userDepartments.representativeType, "primary"),
        ),
      )
      .limit(1);
    const slot = primary ? "representative" : "primary";
    await tx.insert(userDepartments).values({
      userId,
      departmentId: department.id,
      representativeType: slot,
      source: "pco_mapping",
      pcoStatus: "confirmed",
      pcoLastSeenAt: now,
    });
    await writeAudit(tx, {
      actor,
      area: "admin",
      eventType: "admin.department_leader_joined",
      entity: { type: "department", id: department.id },
      departmentId: department.id,
      details: { person: { id: userId }, after: { slot }, source: "pco_mapping" },
    });
    result.joined.push(department.id);
  }

  for (const link of links.filter((l) => l.source === "pco_mapping")) {
    if (matchedIds.has(link.departmentId)) {
      await tx
        .update(userDepartments)
        .set({ pcoStatus: "confirmed", pcoLastSeenAt: now })
        .where(eq(userDepartments.id, link.id));
      if (link.pcoStatus === "no_longer_leader") {
        result.relisted.push(link.departmentId);
        await writeAudit(tx, {
          actor,
          area: "admin",
          eventType: "admin.pco_department_listed_again",
          entity: { type: "department", id: link.departmentId },
          departmentId: link.departmentId,
          details: { person: { id: userId }, after: { pcoStatus: "confirmed" } },
        });
      }
    } else if (link.pcoStatus !== "no_longer_leader") {
      await tx
        .update(userDepartments)
        .set({ pcoStatus: "no_longer_leader" })
        .where(eq(userDepartments.id, link.id));
      result.noLongerListed.push(link.departmentId);
      await writeAudit(tx, {
        actor,
        area: "admin",
        eventType: "admin.pco_department_no_longer_listed",
        entity: { type: "department", id: link.departmentId },
        departmentId: link.departmentId,
        details: {
          person: { id: userId },
          before: { pcoStatus: link.pcoStatus },
          after: { pcoStatus: "no_longer_leader" },
          values,
        },
      });
    }
  }

  if (result.joined.length > 0) {
    await tx
      .update(users)
      .set({ accessStatus: "active", updatedAt: now })
      .where(and(eq(users.id, userId), eq(users.accessStatus, "pending_department")));
  }
  return result;
}

/**
 * Reads the field and syncs, when the mode isn't off. An outage or missing field changes
 * nothing, so the last known answer stays in force. Returns null when nothing ran.
 */
export async function refreshMinistryDepartments(
  tx: Tx,
  directory: PlanningCenterDirectory,
  user: { id: string; pcoPersonId: string },
  options: { now: Date; actor: AuditActor },
): Promise<MinistrySync | null> {
  const settings = await getDepartmentFieldSettings(tx);
  if (settings.mode === "off") return null;
  const read = await readMinistryDepartments(directory, settings.fieldName, user.pcoPersonId);
  if (read.status === "unavailable") return null;
  return syncMinistryDepartments(tx, user.id, read.values, options);
}

export type DepartmentPolicy = {
  mode: DepartmentFieldMode;
  /** Departments matched by the person's last known Ministry Department values. */
  fromPlanningCenter: Set<string>;
  /**
   * In restrict mode, the departments the person may start a budget for: their matches
   * plus links the administrator or the form made, minus ones no longer listed. Null: any.
   */
  allowed: Set<string> | null;
};

/** What the Ministry Department setting allows this person on the form (FR-03). */
export async function departmentPolicy(tx: Tx, actor: Subject): Promise<DepartmentPolicy> {
  const { mode } = await getDepartmentFieldSettings(tx);
  if (mode === "off") return { mode, fromPlanningCenter: new Set(), allowed: null };
  const [person] = await tx
    .select({ values: users.pcoMinistryDepartments })
    .from(users)
    .where(eq(users.id, actor.id))
    .limit(1);
  const fromPlanningCenter = new Set(
    matchDepartments(person?.values ?? [], await matchableDepartments(tx)).map((d) => d.id),
  );
  if (mode === "suggest") return { mode, fromPlanningCenter, allowed: null };

  const links = actor.departments.length
    ? await tx
        .select({
          departmentId: userDepartments.departmentId,
          source: userDepartments.source,
          pcoStatus: userDepartments.pcoStatus,
        })
        .from(userDepartments)
        .where(
          and(
            eq(userDepartments.userId, actor.id),
            inArray(
              userDepartments.departmentId,
              actor.departments.map((d) => d.id),
            ),
          ),
        )
    : [];
  const allowed = new Set(fromPlanningCenter);
  for (const link of links) {
    if (link.source !== "pco_mapping" && link.pcoStatus !== "no_longer_leader") {
      allowed.add(link.departmentId);
    }
  }
  return { mode, fromPlanningCenter, allowed };
}
