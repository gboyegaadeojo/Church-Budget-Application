import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { auditEvents, departments, userDepartments, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { getChurchTimeZone } from "@/domain/settings";
import { assertCan, type Subject } from "@/lib/authz";
import { zonedDate } from "@/lib/time-zone";

/**
 * The Access tab of Analytics & Audit (FR-52, DRD 6.13), for the System Administrator
 * only (`analytics.admin_audit`): sign-ins per day, failed sign-ins, access denied,
 * suspended Group Leader checks, departments without a Backup (FR-38) and Planning Center
 * mapping problems (FR-39). Read-only; each item links to where it's fixed.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const RECENT = 10;

export const FAILED_SIGN_IN_EVENTS = [
  "access.sign_in_failed",
  "access.sign_in_code_wrong",
  "access.sign_in_code_locked",
  "access.sign_in_code_limited",
];

export type AccessEvent = {
  id: string;
  at: Date;
  person: { id: string; name: string } | null;
  email: string | null;
  method: string | null;
  reason: string | null;
  /** For access denied: the page that was refused. */
  path: string | null;
};

export type AccessOverview = {
  /** The last 7 church days, oldest first. */
  signInsByDay: { day: string; planningCenter: number; email: number; failed: number }[];
  failed: { last24h: number; last7d: number; recent: AccessEvent[] };
  denied: { last7d: number; recent: AccessEvent[] };
  suspended: { id: string; name: string; email: string; since: Date }[];
  noBackup: { id: string; name: string; primary: string | null }[];
  syncProblems: { departmentId: string; name: string; at: Date; reason: string | null }[];
};

const text = (details: unknown, key: string): string | null => {
  const value = (details as Record<string, unknown> | null)?.[key];
  return typeof value === "string" && value !== "" ? value : null;
};

async function events(tx: Tx, types: string[], since: Date) {
  const rows = await tx
    .select({
      id: auditEvents.id,
      at: auditEvents.eventTimestamp,
      type: auditEvents.eventType,
      userId: users.id,
      name: users.displayName,
      reason: auditEvents.reason,
      details: auditEvents.details,
      entityId: auditEvents.entityId,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorUserId))
    .where(and(inArray(auditEvents.eventType, types), gte(auditEvents.eventTimestamp, since)))
    .orderBy(desc(auditEvents.eventTimestamp));
  return rows.map((r) => ({
    type: r.type,
    event: {
      id: r.id,
      at: r.at,
      person: r.userId ? { id: r.userId, name: r.name ?? "" } : null,
      email: text(r.details, "email"),
      method: text(r.details, "method"),
      reason: r.reason,
      // Access denied records the page it refused as the event's entity.
      path: r.type === "access.denied" ? r.entityId : null,
    } satisfies AccessEvent,
  }));
}

export async function accessOverview(
  tx: Tx,
  actor: Subject,
  now: Date = new Date(),
): Promise<AccessOverview> {
  assertCan(actor, "analytics.admin_audit");
  const zone = await getChurchTimeZone(tx);
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const dayAgo = new Date(now.getTime() - DAY);

  // Sign-ins per church day for the last 7 days.
  const days = Array.from({ length: 7 }, (_, i) =>
    zonedDate(new Date(now.getTime() - (6 - i) * DAY), zone),
  );
  const signIns = await events(tx, ["access.sign_in_succeeded", ...FAILED_SIGN_IN_EVENTS], weekAgo);
  const byDay = new Map(days.map((day) => [day, { day, planningCenter: 0, email: 0, failed: 0 }]));
  for (const { type, event } of signIns) {
    const row = byDay.get(zonedDate(event.at, zone));
    if (!row) continue;
    if (type !== "access.sign_in_succeeded") row.failed++;
    else if (event.method === "email") row.email++;
    else row.planningCenter++;
  }

  const failed = signIns.filter((e) => e.type !== "access.sign_in_succeeded").map((e) => e.event);
  const denied = (await events(tx, ["access.denied"], weekAgo)).map((e) => e.event);

  const suspended = await tx
    .select({ id: users.id, name: users.displayName, email: users.email, since: users.updatedAt })
    .from(users)
    .where(and(eq(users.accessStatus, "suspended_not_leader"), eq(users.active, true)))
    .orderBy(users.displayName);

  const active = await tx
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(eq(departments.status, "active"))
    .orderBy(departments.name);
  const leaders = active.length
    ? await tx
        .select({
          departmentId: userDepartments.departmentId,
          type: userDepartments.representativeType,
          name: users.displayName,
        })
        .from(userDepartments)
        .innerJoin(users, eq(users.id, userDepartments.userId))
        .where(
          inArray(
            userDepartments.departmentId,
            active.map((a) => a.id),
          ),
        )
    : [];
  const noBackup = active
    .filter((dept) => !leaders.some((l) => l.departmentId === dept.id && l.type === "backup"))
    .map((dept) => ({
      ...dept,
      primary:
        leaders.find((l) => l.departmentId === dept.id && l.type === "primary")?.name ?? null,
    }));

  // A sync problem stays listed until a later sync succeeds or the department is unlinked.
  const problems = await tx
    .select({
      departmentId: departments.id,
      name: departments.name,
      at: auditEvents.eventTimestamp,
      reason: auditEvents.reason,
      lastSynced: departments.pcoLastSyncedAt,
      linked: departments.pcoSourceType,
    })
    .from(auditEvents)
    .innerJoin(departments, eq(departments.id, auditEvents.departmentId))
    .where(
      and(
        eq(auditEvents.eventType, "admin.pco_mapping_sync_problem"),
        gte(auditEvents.eventTimestamp, weekAgo),
        eq(departments.status, "active"),
        sql`${departments.pcoSourceType} in ('services_team', 'groups_group', 'groups_tag')`,
      ),
    )
    .orderBy(desc(auditEvents.eventTimestamp));
  const seen = new Set<string>();
  const syncProblems = problems.filter((p) => {
    if (seen.has(p.departmentId)) return false;
    seen.add(p.departmentId);
    return !p.lastSynced || p.lastSynced < p.at;
  });

  return {
    signInsByDay: days.map((day) => byDay.get(day)!),
    failed: {
      last24h: failed.filter((e) => e.at >= dayAgo).length,
      last7d: failed.length,
      recent: failed.slice(0, RECENT),
    },
    denied: { last7d: denied.length, recent: denied.slice(0, RECENT) },
    suspended,
    noBackup,
    syncProblems: syncProblems.map(({ departmentId, name, at, reason }) => ({
      departmentId,
      name,
      at,
      reason,
    })),
  };
}
