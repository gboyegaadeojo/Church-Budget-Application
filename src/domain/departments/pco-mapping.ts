import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { adminCopy } from "@/copy/admin";
import { departments, pcoLeaderSuggestions, userDepartments, userRoles, users } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { ConflictError, parseInput, RuleError, ValidationError } from "@/domain/errors";
import { readSettings, type LeaderSettings } from "@/domain/settings";
import { checkLeader, type LeaderCheck } from "@/domain/users/leader-check";
import { writeAudit, type AuditActor } from "@/lib/audit";
import { assertCan, type Subject } from "@/lib/authz";
import {
  PlanningCenterUnavailableError,
  type PcoSource,
  type PcoTeamSourceType,
  type PlanningCenterDirectory,
} from "@/lib/pco";
import type { Role } from "@/lib/roles";
import { emailAssigned, emailLeaderSuggested, emailRemoved } from "./emails";
import { setRepresentative } from "./service";
import { LEADER_SLOTS } from "./slots";

/**
 * Planning Center team mapping (FR-39). The administrator links a department to one
 * Services team, Groups group or group tag, and its leaders there become the department's
 * leaders, read-only from Planning Center:
 * - Suggest (default): they're listed as suggestions; nobody gets access until the
 *   administrator adds them. Leaders who leave are flagged and keep access until removed.
 * - Automatic: they're added as Representatives, and removed when they stop being leaders.
 *   The Primary and Backups are always chosen by a person (FR-38).
 * Only people who already have an account are matched: the app imports no other Planning
 * Center data. A department mapped to the People field ("Ministry Department") keeps the
 * existing field behaviour (src/domain/users/ministry-departments.ts). Every change is audited.
 */

const d = adminCopy.departments;
export const TEAM_SOURCE_TYPES = ["services_team", "groups_group", "groups_tag"] as const;

export function isTeamSource(type: string | null): type is PcoTeamSourceType {
  return (TEAM_SOURCE_TYPES as readonly string[]).includes(type ?? "");
}

export type MappedDepartment = {
  id: string;
  name: string;
  sourceType: PcoTeamSourceType;
  sourceId: string;
  sourceName: string;
  mode: "suggest" | "automatic";
  countsAsLeaders: boolean;
};

/** Active departments mapped to a team, group or tag. */
export async function mappedDepartments(
  tx: Tx,
  departmentId?: string,
): Promise<MappedDepartment[]> {
  const rows = await tx
    .select()
    .from(departments)
    .where(
      and(
        eq(departments.status, "active"),
        inArray(departments.pcoSourceType, [...TEAM_SOURCE_TYPES]),
        departmentId ? eq(departments.id, departmentId) : undefined,
      ),
    )
    .orderBy(asc(departments.name));
  return rows.flatMap((r) =>
    isTeamSource(r.pcoSourceType) && r.pcoSourceId
      ? [
          {
            id: r.id,
            name: r.name,
            sourceType: r.pcoSourceType,
            sourceId: r.pcoSourceId,
            sourceName: r.pcoSourceName ?? r.pcoSourceId,
            mode: r.pcoMappingMode,
            countsAsLeaders: r.pcoLeadersCountAsGroupLeaders,
          },
        ]
      : [],
  );
}

export type MappingProblem = { departmentId: string; reason: "missing" | "unavailable" };

/**
 * The leaders' Planning Center person ids for each department. A source that no longer
 * exists, or that Planning Center couldn't read, is a problem and changes nothing.
 */
export async function readMappedLeaders(
  directory: PlanningCenterDirectory,
  list: readonly MappedDepartment[],
): Promise<{ leaders: Map<string, Set<string>>; problems: MappingProblem[] }> {
  const leaders = new Map<string, Set<string>>();
  const problems: MappingProblem[] = [];
  for (const dept of list) {
    try {
      const ids = await directory.sourceLeaderIds(dept.sourceType, dept.sourceId);
      if (ids === null) problems.push({ departmentId: dept.id, reason: "missing" });
      else leaders.set(dept.id, new Set(ids));
    } catch (error) {
      if (!(error instanceof PlanningCenterUnavailableError)) throw error;
      problems.push({ departmentId: dept.id, reason: "unavailable" });
    }
  }
  return { leaders, problems };
}

export type MappingSync = {
  added: string[];
  suggested: string[];
  flagged: string[];
  relisted: string[];
  removed: string[];
  withdrawn: string[];
};

const emptySync = (): MappingSync => ({
  added: [],
  suggested: [],
  flagged: [],
  relisted: [],
  removed: [],
  withdrawn: [],
});

/**
 * Brings one department in step with its source's leaders. With `onlyUserId` (sign-in)
 * only that person is added or suggested; nobody else is touched.
 */
async function applyMapping(
  tx: Tx,
  dept: MappedDepartment,
  leaderPcoIds: ReadonlySet<string>,
  options: { now: Date; actor: AuditActor; onlyUserId?: string },
): Promise<MappingSync> {
  const { now, actor, onlyUserId } = options;
  const result = emptySync();
  const audit = (eventType: string, userId: string, extra: Record<string, unknown> = {}) =>
    writeAudit(tx, {
      actor,
      area: "admin",
      eventType,
      entity: { type: "department", id: dept.id },
      departmentId: dept.id,
      details: { person: { id: userId }, source: dept.sourceName, ...extra },
    });

  // Accounts that lead the source and can be requesters.
  const leaders = leaderPcoIds.size
    ? await tx
        .select({
          id: users.id,
          pcoPersonId: users.pcoPersonId,
          accessStatus: users.accessStatus,
          verified: users.pcoLeaderVerified,
        })
        .from(users)
        .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, "requester")))
        .where(
          and(
            inArray(users.pcoPersonId, [...leaderPcoIds]),
            eq(users.active, true),
            ne(users.accessStatus, "inactive"),
            onlyUserId ? eq(users.id, onlyUserId) : undefined,
          ),
        )
    : [];
  const leaderIds = new Set(leaders.map((l) => l.id));
  const links = await tx
    .select()
    .from(userDepartments)
    .where(eq(userDepartments.departmentId, dept.id));
  const linked = new Set(links.map((l) => l.userId));
  const suggestions = await tx
    .select()
    .from(pcoLeaderSuggestions)
    .where(eq(pcoLeaderSuggestions.departmentId, dept.id));
  const { pco_require_for_requesters } = await readSettings(tx, ["pco_require_for_requesters"]);

  for (const leader of leaders.filter((l) => !linked.has(l.id))) {
    if (dept.mode === "automatic") {
      const mustBeLeader = pco_require_for_requesters === "true" && !dept.countsAsLeaders;
      if (mustBeLeader && (!leader.verified || leader.accessStatus === "suspended_not_leader")) {
        continue;
      }
      await tx.insert(userDepartments).values({
        userId: leader.id,
        departmentId: dept.id,
        representativeType: "representative",
        source: "pco_mapping",
        pcoStatus: "confirmed",
        pcoLastSeenAt: now,
      });
      await tx
        .update(users)
        .set({ accessStatus: "active", updatedAt: now })
        .where(and(eq(users.id, leader.id), eq(users.accessStatus, "pending_department")));
      await audit("admin.department_leader_joined", leader.id, {
        after: { slot: "representative" },
        mode: "automatic",
      });
      await emailAssigned(tx, { userId: leader.id, department: dept, slot: "representative" });
      result.added.push(leader.id);
      continue;
    }

    const existing = suggestions.find((s) => s.userId === leader.id);
    if (!existing) {
      await tx.insert(pcoLeaderSuggestions).values({
        departmentId: dept.id,
        userId: leader.id,
        firstSeenAt: now,
        lastSeenAt: now,
      });
    } else if (existing.status === "withdrawn") {
      await tx
        .update(pcoLeaderSuggestions)
        .set({
          status: "suggested",
          lastSeenAt: now,
          version: sql`${pcoLeaderSuggestions.version} + 1`,
        })
        .where(eq(pcoLeaderSuggestions.id, existing.id));
    } else {
      await tx
        .update(pcoLeaderSuggestions)
        .set({ lastSeenAt: now })
        .where(eq(pcoLeaderSuggestions.id, existing.id));
      continue;
    }
    await audit("admin.pco_leader_suggested", leader.id);
    await emailLeaderSuggested(tx, {
      userId: leader.id,
      department: dept,
      source: dept.sourceName,
    });
    result.suggested.push(leader.id);
  }

  if (onlyUserId) return result;

  // People linked through the mapping: confirmed while they lead, otherwise flagged
  // (Suggest) or removed (Automatic, Representatives only).
  const people = links.length
    ? await tx
        .select({ id: users.id, pcoPersonId: users.pcoPersonId })
        .from(users)
        .where(
          inArray(
            users.id,
            links.map((l) => l.userId),
          ),
        )
    : [];
  const pcoIdOf = new Map(people.map((p) => [p.id, p.pcoPersonId]));
  for (const link of links.filter((l) => l.source === "pco_mapping")) {
    const pcoId = pcoIdOf.get(link.userId);
    if (pcoId && leaderPcoIds.has(pcoId)) {
      await tx
        .update(userDepartments)
        .set({ pcoStatus: "confirmed", pcoLastSeenAt: now })
        .where(eq(userDepartments.id, link.id));
      if (link.pcoStatus === "no_longer_leader") {
        await audit("admin.pco_department_listed_again", link.userId, {
          after: { pcoStatus: "confirmed" },
        });
        result.relisted.push(link.userId);
      }
    } else if (dept.mode === "automatic" && link.representativeType === "representative") {
      await tx.delete(userDepartments).where(eq(userDepartments.id, link.id));
      await writeAudit(tx, {
        actor,
        area: "admin",
        eventType: "admin.department_leader_removed",
        entity: { type: "department", id: dept.id },
        departmentId: dept.id,
        reason: d.pco.removedReason(dept.sourceName),
        details: {
          person: { id: link.userId },
          before: { slot: "representative" },
          mode: "automatic",
        },
      });
      await emailRemoved(tx, { userId: link.userId, department: dept });
      result.removed.push(link.userId);
    } else if (link.pcoStatus !== "no_longer_leader") {
      await tx
        .update(userDepartments)
        .set({ pcoStatus: "no_longer_leader" })
        .where(eq(userDepartments.id, link.id));
      await audit("admin.pco_department_no_longer_listed", link.userId, {
        before: { pcoStatus: link.pcoStatus },
        after: { pcoStatus: "no_longer_leader" },
      });
      result.flagged.push(link.userId);
    }
  }

  for (const s of suggestions.filter((s) => s.status === "suggested" && !leaderIds.has(s.userId))) {
    await tx
      .update(pcoLeaderSuggestions)
      .set({ status: "withdrawn", version: sql`${pcoLeaderSuggestions.version} + 1` })
      .where(eq(pcoLeaderSuggestions.id, s.id));
    await audit("admin.pco_suggestion_withdrawn", s.userId);
    result.withdrawn.push(s.userId);
  }

  // A sync time, not an edit: the department's version stays, so open forms still save.
  await tx.update(departments).set({ pcoLastSyncedAt: now }).where(eq(departments.id, dept.id));
  return result;
}

/** Records a source that couldn't be read, so the Access tab can list it (FR-52). */
async function recordProblem(tx: Tx | Db, problem: MappingProblem, actor: AuditActor) {
  await writeAudit(tx, {
    actor,
    area: "admin",
    eventType: "admin.pco_mapping_sync_problem",
    entity: { type: "department", id: problem.departmentId },
    departmentId: problem.departmentId,
    reason: problem.reason === "missing" ? d.pco.problemMissing : d.pco.problemUnavailable,
  });
}

export type MappingRunSummary = {
  departments: number;
  added: number;
  suggested: number;
  flagged: number;
  removed: number;
  problems: number;
};

/** The nightly sync of every mapped department, each in its own transaction (FR-39). */
export async function syncAllMappings(
  db: Db,
  directory: PlanningCenterDirectory,
  now: Date = new Date(),
): Promise<MappingRunSummary> {
  const list = await mappedDepartments(db);
  const { leaders, problems } = await readMappedLeaders(directory, list);
  const summary: MappingRunSummary = {
    departments: list.length,
    added: 0,
    suggested: 0,
    flagged: 0,
    removed: 0,
    problems: problems.length,
  };
  for (const problem of problems) await recordProblem(db, problem, { kind: "job" });
  for (const dept of list) {
    const ids = leaders.get(dept.id);
    if (!ids) continue;
    const sync = await db.transaction((tx) =>
      applyMapping(tx, dept, ids, { now, actor: { kind: "job" } }),
    );
    summary.added += sync.added.length;
    summary.suggested += sync.suggested.length;
    summary.flagged += sync.flagged.length;
    summary.removed += sync.removed.length;
  }
  return summary;
}

/**
 * At sign-in: the departments whose source this person leads. Automatic adds them now;
 * Suggest asks the administrator. Nobody else is changed.
 */
export async function syncMappingsForPerson(
  tx: Tx,
  directory: PlanningCenterDirectory,
  user: { id: string; pcoPersonId: string },
  options: { now: Date; actor: AuditActor },
): Promise<{ joined: string[]; suggested: string[] }> {
  const list = await mappedDepartments(tx);
  const { leaders } = await readMappedLeaders(directory, list);
  const out = { joined: [] as string[], suggested: [] as string[] };
  for (const dept of list) {
    if (!leaders.get(dept.id)?.has(user.pcoPersonId)) continue;
    const sync = await applyMapping(tx, dept, new Set([user.pcoPersonId]), {
      ...options,
      onlyUserId: user.id,
    });
    if (sync.added.length) out.joined.push(dept.id);
    if (sync.suggested.length) out.suggested.push(dept.id);
  }
  return out;
}

/**
 * The Group Leader check (FR-01a) plus FR-39's "Team leaders count as Group Leaders": a
 * leader of a mapped source whose department has it on passes without the custom field.
 */
export async function checkLeaderOrTeamLeader(
  tx: Tx,
  directory: PlanningCenterDirectory,
  settings: Pick<LeaderSettings, "fieldName" | "acceptedValues">,
  who: { pcoPersonId?: string | null; email?: string | null },
): Promise<LeaderCheck> {
  const check = await checkLeader(directory, settings, who);
  if (check.status !== "not_leader" || check.person.status === "inactive") return check;
  const waived = (await mappedDepartments(tx)).filter((dept) => dept.countsAsLeaders);
  if (waived.length === 0) return check;
  const { leaders } = await readMappedLeaders(directory, waived);
  const dept = waived.find((w) => leaders.get(w.id)?.has(check.person.id));
  return dept
    ? { status: "leader", person: check.person, fieldValue: d.pco.teamLeaderValue(dept.sourceName) }
    : check;
}

// ---------------------------------------------------------------- the administrator

const actorOf = (actor: Subject, actingRole: Role): AuditActor => ({
  kind: "user",
  userId: actor.id,
  actingRole,
});

async function loadDepartment(tx: Tx, id: string) {
  const [row] = z.uuid().safeParse(id).success
    ? await tx.select().from(departments).where(eq(departments.id, id)).limit(1)
    : [];
  if (!row) throw new RuleError(adminCopy.common.notFound);
  return row;
}

/** The teams, groups and tags to pick from; null when Planning Center can't be reached. */
export async function sourceOptions(
  directory: PlanningCenterDirectory | null,
): Promise<Record<PcoTeamSourceType, PcoSource[]> | null> {
  if (!directory) return null;
  try {
    const [teams, groups, tags] = await Promise.all(
      TEAM_SOURCE_TYPES.map((type) => directory.listSources(type)),
    );
    return { services_team: teams, groups_group: groups, groups_tag: tags };
  } catch (error) {
    if (error instanceof PlanningCenterUnavailableError) return null;
    throw error;
  }
}

const mappingSchema = z.object({
  source: z.string(),
  mode: z.enum(["suggest", "automatic"]),
  countsAsLeaders: z.boolean(),
  version: z.coerce.number().int().positive(),
});

/**
 * Links a department to a team, group or tag (source "services_team:123"), or unlinks it
 * (source ""), and sets its mode and "Team leaders count as Group Leaders". The name is
 * read again from Planning Center, so only a source that exists can be saved.
 */
export async function setDepartmentMapping(
  tx: Tx,
  actor: Subject,
  directory: PlanningCenterDirectory | null,
  input: { id: string; source: string; mode: string; countsAsLeaders: boolean; version: unknown },
): Promise<void> {
  const { actingRole } = assertCan(actor, "admin.pco_mapping");
  const data = parseInput(mappingSchema, input);
  const department = await loadDepartment(tx, input.id);
  if (department.status !== "active") throw new RuleError(d.errors.inactiveDepartment);

  let source: { type: PcoTeamSourceType; id: string; name: string } | null = null;
  if (data.source) {
    const [type, id] = data.source.split(":");
    if (!isTeamSource(type ?? null) || !/^\d+$/.test(id ?? "")) {
      throw new ValidationError({ source: d.pco.errors.source });
    }
    const options = await sourceOptions(directory);
    if (!options) throw new RuleError(d.pco.errors.unavailable);
    const found = options[type as PcoTeamSourceType].find((o) => o.id === id);
    if (!found) throw new ValidationError({ source: d.pco.errors.source });
    const [taken] = await tx
      .select({ name: departments.name })
      .from(departments)
      .where(
        and(
          ne(departments.id, department.id),
          eq(departments.status, "active"),
          eq(departments.pcoSourceType, type as PcoTeamSourceType),
          eq(departments.pcoSourceId, id!),
        ),
      )
      .limit(1);
    if (taken) throw new ValidationError({ source: d.pco.errors.taken(taken.name) });
    source = { type: type as PcoTeamSourceType, id: id!, name: found.name };
  }

  const wasTeam = isTeamSource(department.pcoSourceType);
  const before = {
    source: wasTeam ? department.pcoSourceName : null,
    mode: department.pcoMappingMode,
    countsAsLeaders: department.pcoLeadersCountAsGroupLeaders,
  };
  const after = {
    source: source?.name ?? null,
    mode: data.mode,
    countsAsLeaders: data.countsAsLeaders,
  };
  const updated = await tx
    .update(departments)
    .set({
      // Unlinking a team leaves a People-field value alone.
      ...(source
        ? { pcoSourceType: source.type, pcoSourceId: source.id, pcoSourceName: source.name }
        : wasTeam
          ? { pcoSourceType: null, pcoSourceId: null, pcoSourceName: null, pcoLastSyncedAt: null }
          : {}),
      pcoMappingMode: data.mode,
      pcoLeadersCountAsGroupLeaders: data.countsAsLeaders,
      version: sql`${departments.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(departments.id, department.id), eq(departments.version, data.version)))
    .returning({ id: departments.id });
  if (updated.length === 0) throw new ConflictError({ type: "department", id: department.id });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "admin",
    eventType: "admin.department_pco_mapping_changed",
    entity: { type: "department", id: department.id },
    departmentId: department.id,
    details: { before, after },
  });
}

/** **Sync now**: brings the department in step straight away. */
export async function syncDepartmentNow(
  tx: Tx,
  actor: Subject,
  directory: PlanningCenterDirectory | null,
  input: { id: string },
  { now = new Date() }: { now?: Date } = {},
): Promise<MappingSync> {
  const { actingRole } = assertCan(actor, "admin.pco_mapping");
  const [dept] = await mappedDepartments(tx, (await loadDepartment(tx, input.id)).id);
  if (!dept) throw new RuleError(d.pco.errors.notMapped);
  if (!directory) throw new RuleError(d.pco.errors.unavailable);
  const { leaders, problems } = await readMappedLeaders(directory, [dept]);
  const auditActor = actorOf(actor, actingRole);
  if (problems[0]) {
    await recordProblem(tx, problems[0], auditActor);
    throw new RuleError(
      problems[0].reason === "missing" ? d.pco.problemMissing : d.pco.errors.unavailable,
    );
  }
  return applyMapping(tx, dept, leaders.get(dept.id)!, { now, actor: auditActor });
}

async function loadSuggestion(tx: Tx, id: string, version: unknown) {
  const v = parseInput(z.coerce.number().int().positive(), version);
  const [row] = z.uuid().safeParse(id).success
    ? await tx.select().from(pcoLeaderSuggestions).where(eq(pcoLeaderSuggestions.id, id)).limit(1)
    : [];
  if (!row) throw new RuleError(adminCopy.common.notFound);
  if (row.status !== "suggested" || row.version !== v) {
    throw new ConflictError({ type: "pco_leader_suggestion", id });
  }
  return row;
}

async function decide(
  tx: Tx,
  actor: Subject,
  id: string,
  version: number,
  status: "added" | "ignored",
) {
  const rows = await tx
    .update(pcoLeaderSuggestions)
    .set({
      status,
      decidedByUserId: actor.id,
      decidedAt: new Date(),
      version: sql`${pcoLeaderSuggestions.version} + 1`,
    })
    .where(and(eq(pcoLeaderSuggestions.id, id), eq(pcoLeaderSuggestions.version, version)))
    .returning({ id: pcoLeaderSuggestions.id });
  if (rows.length === 0) throw new ConflictError({ type: "pco_leader_suggestion", id });
}

/** **Add** a suggested leader as Primary, Backup or Representative (FR-38 rules apply). */
export async function addSuggestedLeader(
  tx: Tx,
  actor: Subject,
  input: { id: string; slot: string; version: unknown },
): Promise<void> {
  const { actingRole } = assertCan(actor, "admin.pco_mapping");
  const slot = parseInput(z.enum(LEADER_SLOTS), input.slot);
  const suggestion = await loadSuggestion(tx, input.id, input.version);
  const department = await loadDepartment(tx, suggestion.departmentId);
  await setRepresentative(
    tx,
    actor,
    { departmentId: department.id, userId: suggestion.userId, type: slot },
    { source: "pco_mapping", leaderCheckWaived: department.pcoLeadersCountAsGroupLeaders },
  );
  await decide(tx, actor, suggestion.id, suggestion.version, "added");
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "admin",
    eventType: "admin.pco_suggestion_added",
    entity: { type: "department", id: department.id },
    departmentId: department.id,
    details: { person: { id: suggestion.userId }, after: { slot } },
  });
}

/** **Ignore** a suggested leader; later syncs leave them ignored. */
export async function ignoreSuggestedLeader(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown },
): Promise<void> {
  const { actingRole } = assertCan(actor, "admin.pco_mapping");
  const suggestion = await loadSuggestion(tx, input.id, input.version);
  await decide(tx, actor, suggestion.id, suggestion.version, "ignored");
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "admin",
    eventType: "admin.pco_suggestion_ignored",
    entity: { type: "department", id: suggestion.departmentId },
    departmentId: suggestion.departmentId,
    details: { person: { id: suggestion.userId } },
  });
}

export type Suggestion = {
  id: string;
  userId: string;
  name: string;
  email: string;
  version: number;
  firstSeenAt: Date;
};

/** The leaders waiting for the administrator on this department. */
export async function pendingSuggestions(tx: Tx, departmentId: string): Promise<Suggestion[]> {
  return tx
    .select({
      id: pcoLeaderSuggestions.id,
      userId: users.id,
      name: users.displayName,
      email: users.email,
      version: pcoLeaderSuggestions.version,
      firstSeenAt: pcoLeaderSuggestions.firstSeenAt,
    })
    .from(pcoLeaderSuggestions)
    .innerJoin(users, eq(users.id, pcoLeaderSuggestions.userId))
    .where(
      and(
        eq(pcoLeaderSuggestions.departmentId, departmentId),
        eq(pcoLeaderSuggestions.status, "suggested"),
      ),
    )
    .orderBy(asc(users.displayName));
}

/** The departments a person is waiting to be confirmed for, for the waiting screen. */
export async function suggestedFor(tx: Tx, userId: string): Promise<string[]> {
  const rows = await tx
    .select({ name: departments.name })
    .from(pcoLeaderSuggestions)
    .innerJoin(departments, eq(departments.id, pcoLeaderSuggestions.departmentId))
    .where(
      and(eq(pcoLeaderSuggestions.userId, userId), eq(pcoLeaderSuggestions.status, "suggested")),
    )
    .orderBy(asc(departments.name));
  return rows.map((r) => r.name);
}
