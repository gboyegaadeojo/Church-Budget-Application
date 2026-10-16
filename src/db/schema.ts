import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { ANNUAL_STATUSES } from "@/domain/annual/status";
import { REPRESENTATIVE_TYPES, ROLES } from "@/lib/roles";

/*
 * Database schema for Part A (Requirements section 9). Part B tables (6B.10) and
 * spending (9.15, 9.16) arrive with their stages.
 *
 * Rules carried by every table:
 * - Money is integer cents in BIGINT (`*_cents`); tax rates are NUMERIC(5,4).
 * - Timestamps are UTC (timestamptz); dates are plain dates.
 * - Editable rows carry `version` for optimistic concurrency.
 * - Financial history is never deleted: revisions, decisions, approved lines,
 *   adjustments and audit events are append-only (enforced by triggers in migrations).
 */

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const version = () => integer("version").notNull().default(1);
const cents = (name: string) => bigint(name, { mode: "number" });
const taxRate = (name: string) => numeric(name, { precision: 5, scale: 4 });

// ---------------------------------------------------------------- enums

export const roleEnum = pgEnum("role", ROLES);
export const accessStatusEnum = pgEnum("access_status", [
  "active",
  "suspended_not_leader",
  "pending_department",
  "inactive",
]);
export const departmentStatusEnum = pgEnum("department_status", [
  "active",
  "inactive",
  "proposed",
  "rejected",
]);
export const representativeTypeEnum = pgEnum("representative_type", REPRESENTATIVE_TYPES);
export const representativeSourceEnum = pgEnum("representative_source", [
  "manual",
  "form_pick",
  "pco_mapping",
]);
export const pcoMatchStatusEnum = pgEnum("pco_match_status", [
  "suggested",
  "confirmed",
  "no_longer_leader",
  "ignored",
]);
export const pcoSourceTypeEnum = pgEnum("pco_source_type", [
  "services_team",
  "groups_group",
  "groups_tag",
  "people_field_value",
]);
export const pcoMappingModeEnum = pgEnum("pco_mapping_mode", ["suggest", "automatic"]);
export const cycleStatusEnum = pgEnum("cycle_status", ["draft", "open", "closed"]);
export const decisionEmailModeEnum = pgEnum("decision_email_mode", ["immediate", "scheduled"]);
export const annualStatusEnum = pgEnum("annual_status", ANNUAL_STATUSES);
export const revisionKindEnum = pgEnum("revision_kind", [
  "submission",
  "revision",
  "clarification_response",
]);
export const decisionEnum = pgEnum("decision", [
  "approved",
  "returned",
  "declined",
  "reopened",
  "second_approved",
  "second_refused",
]);
export const approvalMethodEnum = pgEnum("approval_method", [
  "as_requested",
  "different_amount",
  "line_changes",
]);
export const decisionStageEnum = pgEnum("decision_stage", ["first", "second"]);
export const auditAreaEnum = pgEnum("audit_area", [
  "annual",
  "expenses",
  "spending",
  "admin",
  "access",
]);
export const actorKindEnum = pgEnum("actor_kind", ["user", "system", "job"]);

// ---------------------------------------------------------------- people (9.1, 9.2)

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    googleSubjectId: text("google_subject_id").unique(),
    pcoPersonId: text("pco_person_id").unique(),
    pcoLeaderVerified: boolean("pco_leader_verified").notNull().default(false),
    pcoVerifiedAt: timestamp("pco_verified_at", { withTimezone: true }),
    pcoFieldValueSnapshot: text("pco_field_value_snapshot"),
    /**
     * The Ministry Department field's values as last read from Planning Center, kept so
     * an outage leaves the last known answer in force (FR-01a, FR-39). Null: never read.
     */
    pcoMinistryDepartments: jsonb("pco_ministry_departments").$type<string[]>(),
    pcoDepartmentsCheckedAt: timestamp("pco_departments_checked_at", { withTimezone: true }),
    accessStatus: accessStatusEnum("access_status").notNull().default("pending_department"),
    active: boolean("active").notNull().default(true),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_lower_key").on(sql`lower(${t.email})`)],
);

/** A person's roles; permissions are the union (Requirements 3.6). */
export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: roleEnum("role").notNull(),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

// ---------------------------------------------------------------- departments (9.3, 9.4)

export const departments = pgTable(
  "departments",
  {
    id: id(),
    name: text("name").notNull(),
    description: text("description"),
    status: departmentStatusEnum("status").notNull().default("active"),
    proposedByUserId: uuid("proposed_by_user_id").references(() => users.id),
    mergedIntoDepartmentId: uuid("merged_into_department_id").references(
      (): AnyPgColumn => departments.id,
    ),
    pcoSourceType: pcoSourceTypeEnum("pco_source_type"),
    pcoSourceId: text("pco_source_id"),
    pcoSourceName: text("pco_source_name"),
    pcoMappingMode: pcoMappingModeEnum("pco_mapping_mode").notNull().default("suggest"),
    pcoLeadersCountAsGroupLeaders: boolean("pco_leaders_count_as_group_leaders")
      .notNull()
      .default(false),
    pcoLastSyncedAt: timestamp("pco_last_synced_at", { withTimezone: true }),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Names are unique among departments still in play; rejected names may come back.
    uniqueIndex("departments_name_lower_key")
      .on(sql`lower(${t.name})`)
      .where(sql`${t.status} <> 'rejected'`),
    check("departments_name_length", sql`char_length(${t.name}) between 1 and 80`),
    check(
      "departments_pco_source_complete",
      sql`(${t.pcoSourceType} is null) = (${t.pcoSourceId} is null)`,
    ),
  ],
);

/** Who represents which department, as Primary, Backup or Representative (FR-38). */
export const userDepartments = pgTable(
  "user_departments",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id),
    representativeType: representativeTypeEnum("representative_type")
      .notNull()
      .default("representative"),
    /** 1 or 2 for a Backup (Backup 1 takes over first), null otherwise (FR-38). */
    backupRank: smallint("backup_rank"),
    source: representativeSourceEnum("source").notNull().default("manual"),
    pcoStatus: pcoMatchStatusEnum("pco_status"),
    pcoLastSeenAt: timestamp("pco_last_seen_at", { withTimezone: true }),
    awayFrom: timestamp("away_from", { withTimezone: true }),
    awayUntil: timestamp("away_until", { withTimezone: true }),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id),
    version: version(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("user_departments_user_department_key").on(t.userId, t.departmentId),
    uniqueIndex("user_departments_one_primary")
      .on(t.departmentId)
      .where(sql`${t.representativeType} = 'primary'`),
    // Up to two Backups per department, ranked 1 and 2.
    uniqueIndex("user_departments_backup_rank")
      .on(t.departmentId, t.backupRank)
      .where(sql`${t.representativeType} = 'backup'`),
    check(
      "user_departments_backup_rank_valid",
      sql`(${t.representativeType} = 'backup') = (${t.backupRank} is not null)
        and (${t.backupRank} is null or ${t.backupRank} in (1, 2))`,
    ),
    index("user_departments_department_idx").on(t.departmentId),
    check(
      "user_departments_away_primary_only",
      sql`(${t.awayFrom} is null and ${t.awayUntil} is null) or ${t.representativeType} = 'primary'`,
    ),
  ],
);

// ---------------------------------------------------------------- cycles and settings (9.5, 9.6, 9.18b)

export const budgetCycles = pgTable(
  "budget_cycles",
  {
    id: id(),
    name: text("name").notNull(),
    budgetYear: integer("budget_year").notNull().unique(),
    startDate: date("start_date").notNull(),
    submissionDeadline: timestamp("submission_deadline", { withTimezone: true }).notNull(),
    status: cycleStatusEnum("status").notNull().default("draft"),
    currency: char("currency", { length: 3 }).notNull().default("CAD"),
    defaultTaxRate: taxRate("default_tax_rate").notNull(),
    decisionEmailMode: decisionEmailModeEnum("decision_email_mode").notNull().default("immediate"),
    decisionReleaseAt: timestamp("decision_release_at", { withTimezone: true }),
    releaseMessage: text("release_message"),
    boardTotalCents: cents("board_total_cents"),
    boardReference: text("board_reference"),
    spendingPeriodEnd: date("spending_period_end"),
    spendingLockedAt: timestamp("spending_locked_at", { withTimezone: true }),
    spendingLockedByUserId: uuid("spending_locked_by_user_id").references(() => users.id),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("budget_cycles_currency_cad", sql`${t.currency} = 'CAD'`),
    check(
      "budget_cycles_tax_rate_range",
      sql`${t.defaultTaxRate} >= 0 and ${t.defaultTaxRate} <= 1`,
    ),
    check(
      "budget_cycles_board_total_positive",
      sql`${t.boardTotalCents} is null or ${t.boardTotalCents} >= 0`,
    ),
    check(
      "budget_cycles_scheduled_release_has_time",
      sql`${t.decisionEmailMode} = 'immediate' or ${t.decisionReleaseAt} is not null`,
    ),
  ],
);

/** One department's own deadline (4.3). Changes are new rows; the old one is superseded. */
export const deadlineExtensions = pgTable(
  "deadline_extensions",
  {
    id: id(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => budgetCycles.id),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id),
    newDeadline: timestamp("new_deadline", { withTimezone: true }).notNull(),
    reason: text("reason").notNull(),
    grantedByUserId: uuid("granted_by_user_id")
      .notNull()
      .references(() => users.id),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("deadline_extensions_one_active")
      .on(t.cycleId, t.departmentId)
      .where(sql`${t.supersededAt} is null`),
  ],
);

/** Key/value settings (9.6). Values are text so rates stay exact ("0.1200"). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  version: version(),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
  updatedAt: updatedAt(),
});

/**
 * People who can sign church cheques (FR-53, 9.18a). Kept by the administrator; they
 * need no app account. Never deleted: removing sets `active_until`, and payments keep
 * the signer's id and a name snapshot.
 */
export const signingAuthorities = pgTable(
  "signing_authorities",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email"),
    activeFrom: date("active_from").notNull(),
    activeUntil: date("active_until"),
    removedReason: text("removed_reason"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("signing_authorities_name_length", sql`char_length(${t.name}) between 1 and 100`),
    check(
      "signing_authorities_dates",
      sql`${t.activeUntil} is null or ${t.activeUntil} >= ${t.activeFrom}`,
    ),
  ],
);

/** Per-year counters for IFC-{year}-0001 and EXP-{year}-0001 (CLAUDE.md conventions). */
export const referenceSequences = pgTable(
  "reference_sequences",
  {
    kind: text("kind").notNull(),
    year: integer("year").notNull(),
    lastValue: integer("last_value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.kind, t.year] })],
);

/**
 * Idempotency keys for submit, approve and pay actions (FR-10, CLAUDE.md conventions).
 * The key comes from the form; a repeat (double click, retry) returns the first result.
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    key: uuid("key").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** e.g. "annual.submit". */
    action: text("action").notNull(),
    entityId: uuid("entity_id").notNull(),
    /** What the first call returned, so a repeat returns the same. */
    result: jsonb("result").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("idempotency_keys_created_idx").on(t.createdAt)],
);

// ---------------------------------------------------------------- annual budget requests (9.7, 9.8)

export const budgetRequests = pgTable(
  "budget_requests",
  {
    id: id(),
    referenceNumber: text("reference_number").unique(),
    budgetCycleId: uuid("budget_cycle_id")
      .notNull()
      .references(() => budgetCycles.id),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id),
    requesterUserId: uuid("requester_user_id")
      .notNull()
      .references(() => users.id),
    departmentNameSnapshot: text("department_name_snapshot").notNull(),
    title: text("title").notNull(),
    justification: text("justification").notNull().default(""),
    status: annualStatusEnum("status").notNull().default("draft"),
    taxRate: taxRate("tax_rate"),
    requestedSubtotalCents: cents("requested_subtotal_cents"),
    requestedTaxCents: cents("requested_tax_cents"),
    requestedTotalCents: cents("requested_total_cents"),
    approvedSubtotalCents: cents("approved_subtotal_cents"),
    approvedTaxCents: cents("approved_tax_cents"),
    approvedTotalCents: cents("approved_total_cents"),
    editCount: integer("edit_count").notNull().default(0),
    extraEditsAllowed: integer("extra_edits_allowed").notNull().default(0),
    versionNumber: integer("version_number").notNull().default(0),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // One request per department per cycle (Requirements 11, rule 1; 9.19).
    unique("budget_requests_cycle_department_key").on(t.budgetCycleId, t.departmentId),
    index("budget_requests_cycle_status_idx").on(t.budgetCycleId, t.status),
    check(
      "budget_requests_requested_reconciles",
      sql`(${t.requestedSubtotalCents} is null and ${t.requestedTaxCents} is null and ${t.requestedTotalCents} is null)
        or (${t.requestedSubtotalCents} >= 0 and ${t.requestedTaxCents} >= 0
            and ${t.requestedTotalCents} = ${t.requestedSubtotalCents} + ${t.requestedTaxCents})`,
    ),
    check(
      "budget_requests_approved_reconciles",
      sql`(${t.approvedSubtotalCents} is null and ${t.approvedTaxCents} is null and ${t.approvedTotalCents} is null)
        or (${t.approvedSubtotalCents} >= 0 and ${t.approvedTaxCents} >= 0
            and ${t.approvedTotalCents} = ${t.approvedSubtotalCents} + ${t.approvedTaxCents})`,
    ),
    // Submitted requests carry their snapshotted rate and amounts; drafts carry neither.
    check(
      "budget_requests_submitted_has_snapshot",
      sql`${t.status} = 'draft' or (${t.taxRate} is not null and ${t.requestedTotalCents} is not null
        and ${t.referenceNumber} is not null and ${t.submittedAt} is not null)`,
    ),
    check(
      "budget_requests_approved_has_amounts",
      sql`${t.status} not in ('approved', 'closed') or ${t.approvedTotalCents} is not null`,
    ),
    check(
      "budget_requests_tax_rate_range",
      sql`${t.taxRate} is null or (${t.taxRate} >= 0 and ${t.taxRate} <= 1)`,
    ),
    check(
      "budget_requests_edit_limit",
      sql`${t.editCount} >= 0 and ${t.extraEditsAllowed} >= 0 and ${t.editCount} <= 2 + ${t.extraEditsAllowed}`,
    ),
  ],
);

export const budgetLineItems = pgTable(
  "budget_line_items",
  {
    id: id(),
    budgetRequestId: uuid("budget_request_id")
      .notNull()
      .references(() => budgetRequests.id),
    itemName: text("item_name").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceCents: cents("unit_price_cents").notNull(),
    lineTotalCents: cents("line_total_cents").notNull(),
    productUrl: text("product_url"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull(),
    /**
     * Set when a revision replaces a line that an approval points to (FR-18a reopen):
     * the line stays for the history and drops out of the working lines.
     */
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("budget_line_items_request_idx").on(t.budgetRequestId, t.sortOrder),
    check("budget_line_items_quantity_range", sql`${t.quantity} between 1 and 10000`),
    check("budget_line_items_unit_price_range", sql`${t.unitPriceCents} between 0 and 100000000`),
    check(
      "budget_line_items_total_reconciles",
      sql`${t.lineTotalCents} = ${t.quantity}::bigint * ${t.unitPriceCents}`,
    ),
    check(
      "budget_line_items_url_http",
      sql`${t.productUrl} is null or ${t.productUrl} ~* '^https?://'`,
    ),
  ],
);

// ---------------------------------------------------------------- history and decisions (9.9 to 9.12)

/** Every submitted version, frozen (FR-12). Append-only. */
export const requestRevisions = pgTable(
  "request_revisions",
  {
    id: id(),
    budgetRequestId: uuid("budget_request_id")
      .notNull()
      .references(() => budgetRequests.id),
    revisionNumber: integer("revision_number").notNull(),
    kind: revisionKindEnum("kind").notNull(),
    editedByUserId: uuid("edited_by_user_id")
      .notNull()
      .references(() => users.id),
    changeSummary: text("change_summary"),
    taxRate: taxRate("tax_rate").notNull(),
    subtotalCents: cents("subtotal_cents").notNull(),
    taxCents: cents("tax_cents").notNull(),
    totalCents: cents("total_cents").notNull(),
    /** Title, justification and line items exactly as submitted. */
    requestSnapshot: jsonb("request_snapshot").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("request_revisions_request_number_key").on(t.budgetRequestId, t.revisionNumber),
    check(
      "request_revisions_reconciles",
      sql`${t.subtotalCents} >= 0 and ${t.taxCents} >= 0 and ${t.totalCents} = ${t.subtotalCents} + ${t.taxCents}`,
    ),
  ],
);

/** Each accountant decision, tied to the version decided on (9.12). Append-only. */
export const approvalDecisions = pgTable(
  "approval_decisions",
  {
    id: id(),
    budgetRequestId: uuid("budget_request_id")
      .notNull()
      .references(() => budgetRequests.id),
    requestRevisionId: uuid("request_revision_id")
      .notNull()
      .references(() => requestRevisions.id),
    decision: decisionEnum("decision").notNull(),
    method: approvalMethodEnum("method"),
    decisionStage: decisionStageEnum("decision_stage").notNull().default("first"),
    approvedSubtotalCents: cents("approved_subtotal_cents"),
    approvedTaxCents: cents("approved_tax_cents"),
    approvedTotalCents: cents("approved_total_cents"),
    decisionReason: text("decision_reason"),
    boardReference: text("board_reference"),
    approverUserId: uuid("approver_user_id")
      .notNull()
      .references(() => users.id),
    actingRole: roleEnum("acting_role").notNull(),
    /** Null while held for scheduled release (FR-19a). */
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("approval_decisions_request_idx").on(t.budgetRequestId, t.createdAt),
    check(
      "approval_decisions_amounts_reconcile",
      sql`(${t.approvedSubtotalCents} is null and ${t.approvedTaxCents} is null and ${t.approvedTotalCents} is null)
        or (${t.approvedSubtotalCents} >= 0 and ${t.approvedTaxCents} >= 0
            and ${t.approvedTotalCents} = ${t.approvedSubtotalCents} + ${t.approvedTaxCents})`,
    ),
    check(
      "approval_decisions_approval_has_amounts",
      sql`(${t.decision} in ('approved', 'second_approved')) = (${t.approvedTotalCents} is not null)`,
    ),
    check(
      "approval_decisions_approval_has_method",
      sql`(${t.decision} = 'approved') = (${t.method} is not null)`,
    ),
    // Returning, declining, reopening, refusing and approving a different amount need a note.
    check(
      "approval_decisions_reason_required",
      sql`${t.decision} in ('second_approved')
        or (${t.decision} = 'approved' and ${t.method} <> 'different_amount')
        or coalesce(btrim(${t.decisionReason}), '') <> ''`,
    ),
  ],
);

/** Approved values per line, separate from what was requested (9.9, FR-15). Append-only. */
export const approvedLineItems = pgTable(
  "approved_line_items",
  {
    id: id(),
    approvalDecisionId: uuid("approval_decision_id")
      .notNull()
      .references(() => approvalDecisions.id),
    budgetLineItemId: uuid("budget_line_item_id")
      .notNull()
      .references(() => budgetLineItems.id),
    approvedQuantity: integer("approved_quantity"),
    approvedUnitPriceCents: cents("approved_unit_price_cents"),
    approvedLineTotalCents: cents("approved_line_total_cents").notNull(),
    adjustmentReason: text("adjustment_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("approved_line_items_decision_line_key").on(t.approvalDecisionId, t.budgetLineItemId),
    check("approved_line_items_total_non_negative", sql`${t.approvedLineTotalCents} >= 0`),
    // Either quantity × price, or an explicit line amount with neither.
    check(
      "approved_line_items_total_reconciles",
      sql`(${t.approvedQuantity} is null and ${t.approvedUnitPriceCents} is null)
        or (${t.approvedQuantity} >= 0 and ${t.approvedUnitPriceCents} >= 0
            and ${t.approvedLineTotalCents} = ${t.approvedQuantity}::bigint * ${t.approvedUnitPriceCents})`,
    ),
  ],
);

/** The overall adjustment when the accountant enters one total (9.10, FR-16). Append-only. */
export const approvalAdjustments = pgTable(
  "approval_adjustments",
  {
    id: id(),
    approvalDecisionId: uuid("approval_decision_id")
      .notNull()
      .unique()
      .references(() => approvalDecisions.id),
    /** Pre-tax; may be negative. */
    amountCents: cents("amount_cents").notNull(),
    reason: text("reason").notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [check("approval_adjustments_reason_required", sql`btrim(${t.reason}) <> ''`)],
);

// ---------------------------------------------------------------- audit (9.13, FR-22)

/** Append-only: the migration blocks UPDATE and DELETE with a trigger. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    actorKind: actorKindEnum("actor_kind").notNull(),
    actingRole: roleEnum("acting_role"),
    area: auditAreaEnum("area").notNull(),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    budgetRequestId: uuid("budget_request_id").references(() => budgetRequests.id),
    departmentId: uuid("department_id").references(() => departments.id),
    cycleId: uuid("cycle_id").references(() => budgetCycles.id),
    eventTimestamp: timestamp("event_timestamp", { withTimezone: true }).notNull().defaultNow(),
    reason: text("reason"),
    details: jsonb("details"),
    requestIpHash: text("request_ip_hash"),
  },
  (t) => [
    index("audit_events_timestamp_idx").on(t.eventTimestamp),
    index("audit_events_area_type_idx").on(t.area, t.eventType),
    index("audit_events_department_cycle_idx").on(t.departmentId, t.cycleId),
    index("audit_events_actor_idx").on(t.actorUserId),
    index("audit_events_entity_idx").on(t.entityType, t.entityId),
    check(
      "audit_events_user_has_actor",
      sql`(${t.actorKind} = 'user') = (${t.actorUserId} is not null)`,
    ),
  ],
);
