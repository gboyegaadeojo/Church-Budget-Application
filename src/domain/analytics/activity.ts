import {
  aliasedTable,
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lt,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import {
  ACTIVITY_GROUPS,
  eventTypesIn,
  MONEY_EVENT_TYPES,
  type ActivityGroup,
} from "@/copy/activity";
import { auditEvents, budgetCycles, budgetRequests, departments, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { getChurchTimeZone } from "@/domain/settings";
import type { Subject } from "@/lib/authz";
import { ROLES, type Role } from "@/lib/roles";
import { zonedDate, zonedLocalToUtc } from "@/lib/time-zone";

/**
 * The activity log (FR-22, FR-52 Activity tab, AC-125, AC-126). Read-only. Every query is
 * filtered on the server by what the person's roles may see (Requirements 3.6, FR-52):
 * - System Administrator: everything, including sign-ins, settings and access changes.
 * - Accountant and backup approver: the financial log (Annual Budget, Expenses, Spending).
 * - Church Administrator: the spending log.
 * - Requester: their own departments' activity (no internal exports). Only the budget's
 *   own "Activity on this budget" page uses this now: Analytics & Audit and Home's Recent
 *   activity are for staff (`analytics.view`, docs/decisions.md 2026-10-16).
 * - Everyone: what they did themselves.
 * Several roles see the union. Filters only ever narrow this scope.
 */

export const AUDIT_AREAS = ["annual", "expenses", "spending", "admin", "access"] as const;
export type AuditAreaName = (typeof AUDIT_AREAS)[number];

export const QUICK_VIEWS = [
  "today",
  "decisionsWeek",
  "money",
  "access",
  "settings",
  "emails",
] as const;
export type QuickView = (typeof QUICK_VIEWS)[number];

export const ACTIVITY_PAGE_SIZE = 50;

export type ActivityFilters = {
  q?: string;
  personId?: string;
  role?: string;
  area?: string;
  group?: string;
  departmentId?: string;
  cycleId?: string;
  /** Church-local dates, "2026-10-16". */
  from?: string;
  to?: string;
  quick?: string;
  page?: number;
  /** One budget's own history (FR-52 "History tab"). */
  requestId?: string;
  /** Home's Recent activity (FR-37): changes only, without sign-ins, emails or autosaves. */
  recent?: boolean;
};

export type ActivityItem = {
  id: string;
  at: Date;
  actor: { id: string; name: string } | null;
  actorKind: "user" | "system" | "job";
  actingRole: Role | null;
  area: AuditAreaName;
  eventType: string;
  entityType: string;
  entityId: string | null;
  request: { id: string; reference: string | null; title: string } | null;
  department: { id: string; name: string } | null;
  cycle: string | null;
  reason: string | null;
  details: Record<string, unknown> | null;
};

export type ActivityPage = {
  items: ActivityItem[];
  total: number;
  page: number;
  pages: number;
};

const FINANCIAL_AREAS: AuditAreaName[] = ["annual", "expenses", "spending"];
const ACCOUNTANT_ROLES: Role[] = ["accountant", "backup_approver"];
/** Internal events a department doesn't see about its own budget. */
const NOT_FOR_DEPARTMENTS = ["annual.exported"];
const FAILED_ACCESS = [
  "access.sign_in_failed",
  "access.denied",
  "access.sign_in_code_wrong",
  "access.sign_in_code_locked",
  "access.sign_in_code_limited",
];

/** Left out of Home's Recent activity: frequent and not news to anyone. */
const RECENT_NOISE = [
  "annual.draft_saved",
  "notifications.email_sent",
  "notifications.email_failed",
  "admin.activity_exported",
  "admin.pco_person_searched",
  "admin.pco_person_tested",
];

const uuid = z.uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const request = aliasedTable(budgetRequests, "activity_request");
const department = aliasedTable(departments, "activity_department");
const cycle = aliasedTable(budgetCycles, "activity_cycle");
const actorUser = aliasedTable(users, "activity_actor");

/** The budget an event is about: its link, or a draft named only by its entity id. */
const requestJoin = or(
  eq(request.id, auditEvents.budgetRequestId),
  and(
    eq(auditEvents.entityType, "budget_request"),
    eq(sql`${request.id}::text`, auditEvents.entityId),
  ),
);
const departmentId = sql<
  string | null
>`coalesce(${auditEvents.departmentId}, ${request.departmentId})`;
const cycleId = sql<string | null>`coalesce(${auditEvents.cycleId}, ${request.budgetCycleId})`;

/** What this person may see; null means everything. */
export function activityScope(actor: Subject): SQL | null {
  if (actor.roles.includes("system_admin")) return null;
  const allowed: SQL[] = [eq(auditEvents.actorUserId, actor.id)];
  if (actor.roles.some((r) => ACCOUNTANT_ROLES.includes(r))) {
    allowed.push(inArray(auditEvents.area, FINANCIAL_AREAS));
  }
  if (actor.roles.includes("church_admin")) allowed.push(eq(auditEvents.area, "spending"));
  const mine = actor.departments.map((d) => d.id);
  if (actor.roles.includes("requester") && mine.length > 0) {
    allowed.push(
      and(
        inArray(departmentId, mine),
        inArray(auditEvents.area, FINANCIAL_AREAS),
        notInArray(auditEvents.eventType, NOT_FOR_DEPARTMENTS),
      )!,
    );
  }
  return or(...allowed)!;
}

function typesOf(group: ActivityGroup): string[] {
  return group === "money" ? MONEY_EVENT_TYPES : eventTypesIn(group);
}

async function conditions(tx: Tx, actor: Subject, f: ActivityFilters, now: Date): Promise<SQL[]> {
  const zone = await getChurchTimeZone(tx);
  const where: SQL[] = [];
  const scope = activityScope(actor);
  if (scope) where.push(scope);

  if (f.requestId && uuid.safeParse(f.requestId).success) {
    where.push(
      or(
        eq(auditEvents.budgetRequestId, f.requestId),
        and(eq(auditEvents.entityType, "budget_request"), eq(auditEvents.entityId, f.requestId)),
      )!,
    );
  }
  if (f.recent) {
    where.push(notInArray(auditEvents.area, ["access"]));
    where.push(notInArray(auditEvents.eventType, RECENT_NOISE));
  }
  if (f.personId && uuid.safeParse(f.personId).success) {
    where.push(eq(auditEvents.actorUserId, f.personId));
  }
  const role = ROLES.find((r) => r === f.role);
  if (role) where.push(eq(auditEvents.actingRole, role));
  const area = AUDIT_AREAS.find((a) => a === f.area);
  if (area) where.push(eq(auditEvents.area, area));
  const group = ACTIVITY_GROUPS.find((g) => g === f.group);
  if (group) where.push(inArray(auditEvents.eventType, typesOf(group)));
  if (f.departmentId && uuid.safeParse(f.departmentId).success) {
    where.push(eq(departmentId, f.departmentId));
  }
  if (f.cycleId && uuid.safeParse(f.cycleId).success) where.push(eq(cycleId, f.cycleId));

  const startOf = (day: string) => zonedLocalToUtc(`${day}T00:00`, zone);
  const from = date.safeParse(f.from).success ? startOf(f.from!) : null;
  if (from) where.push(gte(auditEvents.eventTimestamp, from));
  if (date.safeParse(f.to).success) {
    const end = new Date(`${f.to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    const until = startOf(end.toISOString().slice(0, 10));
    if (until) where.push(lt(auditEvents.eventTimestamp, until));
  }

  switch (QUICK_VIEWS.find((v) => v === f.quick)) {
    case "today": {
      const today = startOf(zonedDate(now, zone));
      if (today) where.push(gte(auditEvents.eventTimestamp, today));
      break;
    }
    case "decisionsWeek":
      where.push(inArray(auditEvents.eventType, typesOf("decisions")));
      where.push(gte(auditEvents.eventTimestamp, new Date(now.getTime() - 7 * 86_400_000)));
      break;
    case "money":
      where.push(inArray(auditEvents.eventType, typesOf("money")));
      break;
    case "access":
      where.push(inArray(auditEvents.eventType, FAILED_ACCESS));
      break;
    case "settings":
      where.push(inArray(auditEvents.eventType, typesOf("settings")));
      break;
    case "emails":
      where.push(eq(auditEvents.eventType, "notifications.email_failed"));
      break;
  }

  const q = f.q?.trim();
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(
      or(
        ilike(request.referenceNumber, pattern),
        ilike(request.title, pattern),
        ilike(actorUser.displayName, pattern),
        ilike(actorUser.email, pattern),
        ilike(department.name, pattern),
        ilike(auditEvents.reason, pattern),
        ilike(auditEvents.eventType, pattern),
      )!,
    );
  }
  return where;
}

function base(tx: Tx) {
  return tx
    .select({
      id: auditEvents.id,
      at: auditEvents.eventTimestamp,
      actorId: auditEvents.actorUserId,
      actorName: actorUser.displayName,
      actorKind: auditEvents.actorKind,
      actingRole: auditEvents.actingRole,
      area: auditEvents.area,
      eventType: auditEvents.eventType,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      requestId: request.id,
      reference: request.referenceNumber,
      title: request.title,
      departmentId: department.id,
      departmentName: department.name,
      cycleName: cycle.name,
      reason: auditEvents.reason,
      details: auditEvents.details,
    })
    .from(auditEvents)
    .leftJoin(actorUser, eq(actorUser.id, auditEvents.actorUserId))
    .leftJoin(request, requestJoin)
    .leftJoin(department, eq(department.id, departmentId))
    .leftJoin(cycle, eq(cycle.id, cycleId));
}

type Row = Awaited<ReturnType<typeof base>>[number];

function toItem(r: Row): ActivityItem {
  return {
    id: r.id,
    at: r.at,
    actor: r.actorId ? { id: r.actorId, name: r.actorName ?? "" } : null,
    actorKind: r.actorKind,
    actingRole: r.actingRole,
    area: r.area,
    eventType: r.eventType,
    entityType: r.entityType,
    entityId: r.entityId,
    request: r.requestId ? { id: r.requestId, reference: r.reference, title: r.title ?? "" } : null,
    department: r.departmentId ? { id: r.departmentId, name: r.departmentName ?? "" } : null,
    cycle: r.cycleName,
    reason: r.reason,
    details: (r.details as Record<string, unknown> | null) ?? null,
  };
}

/** One page of the log, newest first (DRD 6.13: pages of 50 with page numbers). */
export async function listActivity(
  tx: Tx,
  actor: Subject,
  filters: ActivityFilters = {},
  { now = new Date(), pageSize = ACTIVITY_PAGE_SIZE }: { now?: Date; pageSize?: number } = {},
): Promise<ActivityPage> {
  const where = and(...(await conditions(tx, actor, filters, now)));
  const [{ total }] = await tx
    .select({ total: count() })
    .from(auditEvents)
    .leftJoin(actorUser, eq(actorUser.id, auditEvents.actorUserId))
    .leftJoin(request, requestJoin)
    .leftJoin(department, eq(department.id, departmentId))
    .where(where);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Math.floor(filters.page ?? 1) || 1), pages);
  const rows = await base(tx)
    .where(where)
    .orderBy(desc(auditEvents.eventTimestamp), desc(auditEvents.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { items: rows.map(toItem), total, page, pages };
}

/** Every matching event for the Excel export (capped, newest first). */
export async function allActivity(
  tx: Tx,
  actor: Subject,
  filters: ActivityFilters,
  { now = new Date(), limit = 10_000 }: { now?: Date; limit?: number } = {},
): Promise<ActivityItem[]> {
  const where = and(...(await conditions(tx, actor, filters, now)));
  const rows = await base(tx)
    .where(where)
    .orderBy(desc(auditEvents.eventTimestamp), desc(auditEvents.id))
    .limit(limit);
  return rows.map(toItem);
}

/** People who appear in this person's log, for the Person filter. */
export async function activityPeople(
  tx: Tx,
  actor: Subject,
): Promise<{ id: string; name: string }[]> {
  const scope = activityScope(actor);
  return tx
    .selectDistinct({ id: users.id, name: users.displayName })
    .from(auditEvents)
    .innerJoin(users, eq(users.id, auditEvents.actorUserId))
    .leftJoin(request, requestJoin)
    .where(scope ?? undefined)
    .orderBy(users.displayName)
    .limit(300);
}

/** The filters from the address (the page and the export read the same ones). */
export function activityFiltersFrom(get: (key: string) => string | undefined): ActivityFilters {
  return {
    q: get("q") || undefined,
    personId: get("person") || undefined,
    role: get("role") || undefined,
    area: get("area") || undefined,
    group: get("group") || undefined,
    departmentId: get("department") || undefined,
    cycleId: get("cycle") || undefined,
    from: get("from") || undefined,
    to: get("to") || undefined,
    quick: get("quick") || undefined,
    page: Number(get("page") ?? 1) || 1,
  };
}

/** The address query for these filters, without the page. */
export function activityQuery(f: ActivityFilters): string {
  const entries: [string, string | undefined][] = [
    ["q", f.q],
    ["person", f.personId],
    ["role", f.role],
    ["area", f.area],
    ["group", f.group],
    ["department", f.departmentId],
    ["cycle", f.cycleId],
    ["from", f.from],
    ["to", f.to],
    ["quick", f.quick],
  ];
  return new URLSearchParams(
    entries.filter((e): e is [string, string] => Boolean(e[1])),
  ).toString();
}
