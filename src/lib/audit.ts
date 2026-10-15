import { auditEvents } from "@/db/schema";
import type { Tx } from "@/db/types";
import type { Role } from "./roles";

/**
 * The audit trail (FR-22, Requirements 9.13). Services call `writeAudit` inside the same
 * transaction as the change it records, so a change and its audit event commit or roll
 * back together. The table is append-only in the database.
 */

export type AuditArea = (typeof auditEvents.area.enumValues)[number];

export type AuditActor =
  { kind: "user"; userId: string; actingRole?: Role } | { kind: "system" } | { kind: "job" };

/** Before and after values (changed fields only), or a short safe summary. */
export type AuditDetails = {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  summary?: string;
  [key: string]: unknown;
};

export type AuditEventInput = {
  actor: AuditActor;
  area: AuditArea;
  /** Dotted, lower case: "annual.submitted", "admin.tax_rate_changed". */
  eventType: string;
  entity: { type: string; id?: string };
  budgetRequestId?: string;
  departmentId?: string;
  cycleId?: string;
  reason?: string;
  details?: AuditDetails;
  /** Hashed client address, for sign-in and access events only. */
  requestIpHash?: string;
};

const EVENT_TYPE = /^[a-z]+(?:\.[a-z0-9_]+)+$/;

/** Records one audit event and returns its id. */
export async function writeAudit(tx: Tx, event: AuditEventInput): Promise<string> {
  if (!EVENT_TYPE.test(event.eventType)) {
    throw new TypeError(`Audit event type must look like "area.event_name": ${event.eventType}`);
  }
  const reason = event.reason?.trim() || null;
  const [row] = await tx
    .insert(auditEvents)
    .values({
      actorKind: event.actor.kind,
      actorUserId: event.actor.kind === "user" ? event.actor.userId : null,
      actingRole: event.actor.kind === "user" ? (event.actor.actingRole ?? null) : null,
      area: event.area,
      eventType: event.eventType,
      entityType: event.entity.type,
      entityId: event.entity.id ?? null,
      budgetRequestId: event.budgetRequestId ?? null,
      departmentId: event.departmentId ?? null,
      cycleId: event.cycleId ?? null,
      reason,
      details: event.details ?? null,
      requestIpHash: event.requestIpHash ?? null,
    })
    .returning({ id: auditEvents.id });
  return row.id;
}

/**
 * The fields that changed between two versions of a record, for `details`.
 * Compares by JSON value, so dates, arrays and nested objects compare by content.
 */
export function changedFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { before: Partial<T>; after: Partial<T> } | null {
  const was: Partial<T> = {};
  const now: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (after[key] === undefined) continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      was[key] = before[key];
      now[key] = after[key];
    }
  }
  return Object.keys(now).length > 0 ? { before: was, after: now } : null;
}
