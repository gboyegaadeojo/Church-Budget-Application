import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  customType,
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
import { EXPENSE_STATUSES, EXPENSE_TYPES } from "@/domain/expenses/status";
import { REPRESENTATIVE_TYPES, ROLES } from "@/lib/roles";

/*
 * Database schema (Requirements section 9, and 6B.10 for Part B expenses). Budget
 * amendments (9.16) arrive with Stage 4.
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
    /**
     * The person's mobile number from Planning Center (E.164, "+12045550123"), for
     * reminder texts. Refreshed at sign-in and nightly; null when Planning Center has none.
     */
    phoneE164: text("phone_e164"),
    phoneCheckedAt: timestamp("phone_checked_at", { withTimezone: true }),
    accessStatus: accessStatusEnum("access_status").notNull().default("pending_department"),
    active: boolean("active").notNull().default(true),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_lower_key").on(sql`lower(${t.email})`)],
);

/**
 * A person's own settings (9.18): an approver's Away dates (FR-33), Away from `away_from`
 * until just before `away_until` (open-ended when null). There are no email preferences:
 * every email always goes (docs/decisions.md, 2026-10-16).
 */
export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id),
    awayFrom: timestamp("away_from", { withTimezone: true }),
    awayUntil: timestamp("away_until", { withTimezone: true }),
    version: version(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "user_preferences_away_dates",
      sql`(${t.awayFrom} is not null or ${t.awayUntil} is null)
        and (${t.awayUntil} is null or ${t.awayUntil} > ${t.awayFrom})`,
    ),
  ],
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

/**
 * Expense submitters (6B.2): someone who isn't a department representative (for example a
 * volunteer who buys for Media) may submit expenses for the departments they're given.
 * A removal is recorded, not deleted, so past assignments stay in the history.
 */
export const expenseSubmitters = pgTable(
  "expense_submitters",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id),
    assignedByUserId: uuid("assigned_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedByUserId: uuid("removed_by_user_id").references(() => users.id),
  },
  (t) => [
    uniqueIndex("expense_submitters_active_key")
      .on(t.userId, t.departmentId)
      .where(sql`${t.removedAt} is null`),
    index("expense_submitters_department_idx").on(t.departmentId),
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

/**
 * Leaders Planning Center suggests for a mapped department in Suggest mode (FR-39). Kept
 * apart from user_departments on purpose: a suggestion gives no access and gets no email
 * until the administrator adds the person. Only people who already have an account are
 * suggested (FR-39 imports no other Planning Center data). Never deleted:
 * - suggested: waiting for the administrator;
 * - added: the administrator added them (they're now a user_departments row);
 * - ignored: the administrator said no; later syncs leave it ignored;
 * - withdrawn: no longer a leader in Planning Center before anyone decided.
 */
export const pcoLeaderSuggestions = pgTable(
  "pco_leader_suggestions",
  {
    id: id(),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    status: text("status").notNull().default("suggested"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    version: version(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("pco_leader_suggestions_department_user_key").on(t.departmentId, t.userId),
    check(
      "pco_leader_suggestions_status",
      sql`${t.status} in ('suggested', 'added', 'ignored', 'withdrawn')`,
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
    // A cycle is the budget year: Closed means its spending is locked, and only then
    // (docs/decisions.md 2026-10-18).
    check(
      "budget_cycles_closed_is_locked",
      sql`(${t.status} = 'closed') = (${t.spendingLockedAt} is not null)`,
    ),
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

/**
 * Emailed sign-in codes (FR-01b, 9.18c). Only a keyed hash of the code is stored. A row
 * is written for every request, including addresses with no account (which get no
 * email), so rate limits and answers are the same either way and reveal nothing.
 */
export const emailLoginCodes = pgTable(
  "email_login_codes",
  {
    id: id(),
    /** Lower case, as typed. */
    email: text("email").notNull(),
    /** The account the code was emailed to; null when no email went (unknown address). */
    userId: uuid("user_id").references(() => users.id),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    usedAt: timestamp("used_at", { withTimezone: true }),
    /** Set on the 5th wrong code: no codes for this address are sent or accepted until then. */
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    requestIpHash: text("request_ip_hash"),
    createdAt: createdAt(),
  },
  (t) => [
    index("email_login_codes_email_idx").on(t.email, t.createdAt),
    index("email_login_codes_ip_idx").on(t.requestIpHash, t.createdAt),
    check("email_login_codes_attempts_non_negative", sql`${t.attempts} >= 0`),
  ],
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

// ---------------------------------------------------------------- messages (9.17, FR-31)

/**
 * A plain-text message between a department and the accountant on a request (FR-31).
 * Append-only: messages can't be edited or deleted after sending.
 */
export const requestMessages = pgTable(
  "request_messages",
  {
    id: id(),
    budgetRequestId: uuid("budget_request_id")
      .notNull()
      .references(() => budgetRequests.id),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id),
    /** Which side wrote it: the department (requester) or the accountant's side. */
    actingRole: roleEnum("acting_role").notNull(),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("request_messages_request_idx").on(t.budgetRequestId, t.createdAt),
    index("request_messages_author_idx").on(t.authorUserId, t.createdAt),
    check(
      "request_messages_body_length",
      sql`btrim(${t.body}) <> '' and char_length(${t.body}) <= 2000`,
    ),
  ],
);

/** When each person last read a request's messages, for unread counts (DRD 6.11a). */
export const requestMessageReads = pgTable(
  "request_message_reads",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    budgetRequestId: uuid("budget_request_id")
      .notNull()
      .references(() => budgetRequests.id),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.budgetRequestId] })],
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

// ---------------------------------------------------------------- email outbox (9.14, FR-21)

export const emailStatusEnum = pgEnum("email_status", ["pending", "sending", "sent", "failed"]);
/** Who an email is for, so a request's history can show the department only its own. */
export const emailAudienceEnum = pgEnum("email_audience", [
  "requester",
  "accountant",
  "church_admin",
  "administrator",
  "person",
  /** The Board Chair or Vice-Chair (expense final approval, 6B.4). */
  "board",
]);

/**
 * Every email the app sends (CLAUDE.md constraint 7, Requirements 9.14). Services write
 * a row in the same transaction as the change; it is sent after commit and retried with
 * backoff. The rendered subject and bodies are kept, so the history shows exactly what
 * went out. Rows are never deleted (the migration blocks it).
 */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: id(),
    /** e.g. "annual.submitted.receipt". */
    template: text("template").notNull(),
    audience: emailAudienceEnum("audience").notNull(),
    toEmail: text("to_email").notNull(),
    toUserId: uuid("to_user_id").references(() => users.id),
    subject: text("subject").notNull(),
    textBody: text("text_body").notNull(),
    htmlBody: text("html_body").notNull(),
    budgetRequestId: uuid("budget_request_id").references(() => budgetRequests.id),
    expenseSubmissionId: uuid("expense_submission_id").references(
      (): AnyPgColumn => expenseSubmissions.id,
    ),
    cycleId: uuid("cycle_id").references(() => budgetCycles.id),
    status: emailStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    providerMessageId: text("provider_message_id"),
    lastError: text("last_error"),
    /**
     * Set for emails that must go once only, such as a deadline reminder or the daily
     * failure digest: a second row with the same key and address is skipped.
     */
    dedupeKey: text("dedupe_key"),
    /** Not sent after this time (a sign-in code that has run out); marked failed instead. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /**
     * The body holds a secret (a sign-in code): it is cleared once the email is sent,
     * fails or expires, and the email is never sent again.
     */
    sensitive: boolean("sensitive").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("email_outbox_dedupe_key")
      .on(t.dedupeKey, sql`lower(${t.toEmail})`)
      .where(sql`${t.dedupeKey} is not null`),
    index("email_outbox_due_idx").on(t.status, t.nextAttemptAt),
    index("email_outbox_request_idx").on(t.budgetRequestId, t.createdAt),
    index("email_outbox_expense_idx").on(t.expenseSubmissionId, t.createdAt),
    check("email_outbox_sent_has_time", sql`(${t.status} = 'sent') = (${t.sentAt} is not null)`),
    check("email_outbox_attempts_non_negative", sql`${t.attempts} >= 0`),
  ],
);

/**
 * Reminder texts (docs/decisions.md 2026-10-18), queued beside the reminder email in the
 * same transaction and sent after commit like the email outbox. Texts go only in church
 * daytime, under a monthly cap; a person stops them by replying STOP (the provider
 * enforces it). Rows are never deleted.
 */
export const smsOutbox = pgTable(
  "sms_outbox",
  {
    id: id(),
    /** The reminder it goes with, e.g. "expenses.reminder.payment". */
    template: text("template").notNull(),
    toPhone: text("to_phone").notNull(),
    toUserId: uuid("to_user_id").references(() => users.id),
    body: text("body").notNull(),
    expenseSubmissionId: uuid("expense_submission_id").references(
      (): AnyPgColumn => expenseSubmissions.id,
    ),
    cycleId: uuid("cycle_id").references(() => budgetCycles.id),
    status: emailStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    providerMessageId: text("provider_message_id"),
    lastError: text("last_error"),
    /** Same key as the reminder email: a repeat run queues nothing new. */
    dedupeKey: text("dedupe_key"),
    /** A reminder text is stale after a day; it's marked failed instead of sent late. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("sms_outbox_dedupe_key")
      .on(t.dedupeKey, t.toPhone)
      .where(sql`${t.dedupeKey} is not null`),
    index("sms_outbox_due_idx").on(t.status, t.nextAttemptAt),
    index("sms_outbox_sent_idx").on(t.sentAt),
    check("sms_outbox_sent_has_time", sql`(${t.status} = 'sent') = (${t.sentAt} is not null)`),
    check("sms_outbox_attempts_non_negative", sql`${t.attempts} >= 0`),
  ],
);

export const notificationAreaEnum = pgEnum("notification_area", [
  "annual",
  "expenses",
  "spending",
  "cycles",
  "people",
]);

/**
 * In-app notifications (the bell, docs/decisions.md 2026-10-19): one row for each person
 * an email goes to, written by `enqueueEmail` in the same transaction, so the bell and
 * the inbox always agree. Only the person it belongs to can see or mark it.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** The email template it came from, e.g. "expenses.board_needed". */
    template: text("template").notNull(),
    area: notificationAreaEnum("area").notNull(),
    /** Asks the person to do something (approve, answer, finish, pay). */
    actionNeeded: boolean("action_needed").notNull().default(false),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** An app path such as "/expenses/…"; never an outside address. */
    href: text("href").notNull(),
    budgetRequestId: uuid("budget_request_id").references(() => budgetRequests.id),
    expenseSubmissionId: uuid("expense_submission_id").references(
      (): AnyPgColumn => expenseSubmissions.id,
    ),
    cycleId: uuid("cycle_id").references(() => budgetCycles.id),
    readAt: timestamp("read_at", { withTimezone: true }),
    /** Waiting to pop up on the person's phones and computers (web push, 2026-10-22). */
    pushPending: boolean("push_pending").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt),
    index("notifications_unread_idx")
      .on(t.userId)
      .where(sql`${t.readAt} is null`),
    index("notifications_push_idx")
      .on(t.createdAt)
      .where(sql`${t.pushPending}`),
  ],
);

/**
 * A phone or computer where someone turned on alerts (web push, docs/decisions.md
 * 2026-10-22). The endpoint is the push service's address for that browser; signing in
 * as someone else on the same device moves it to them. Removed when the person turns
 * alerts off or the push service says the device is gone: it holds no financial history.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    /** "iPhone", "Android phone", "Windows computer": shown so people can tell devices apart. */
    device: text("device").notNull(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

/** Raw bytes; PGlite and node-postgres both hand back a Uint8Array/Buffer. */
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});

/**
 * The church's logo and square icon (FR-30, DRD 3.8). The only administrator upload.
 * Kept in Postgres rather than R2: at most 1 MB each, and the R2 card-on-file decision
 * is still open (docs/decisions.md). Append-only: a replacement is a new row and the
 * settings `logo_asset_id` / `icon_asset_id` point at the current one.
 */
export const brandAssets = pgTable(
  "brand_assets",
  {
    id: id(),
    kind: text("kind").notNull(),
    contentType: text("content_type").notNull(),
    bytes: bytea("bytes").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    sha256: char("sha256", { length: 64 }).notNull(),
    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    check("brand_assets_kind", sql`${t.kind} in ('logo', 'icon')`),
    check(
      "brand_assets_type",
      sql`${t.contentType} in ('image/png', 'image/jpeg', 'image/svg+xml')`,
    ),
    check("brand_assets_size", sql`${t.byteSize} > 0 and ${t.byteSize} <= 1048576`),
  ],
);

// ---------------------------------------------------------------- Part B: expenses (6B.10)

export const expenseTypeEnum = pgEnum("expense_type", EXPENSE_TYPES);
export const expenseStatusEnum = pgEnum("expense_status", EXPENSE_STATUSES);
/** FR-40 "How it will be bought" (purchase requests). */
export const howBoughtEnum = pgEnum("expense_how_bought", [
  "church_account",
  "requester_claims",
  "supplier_invoice",
]);
/** Who is paid for a claim (6B.3 step 6). */
export const payeeKindEnum = pgEnum("expense_payee_kind", ["self", "other", "church_card"]);
export const paymentPreferenceEnum = pgEnum("expense_payment_preference", [
  "cheque",
  "e_transfer",
  "none",
]);
export const expenseRevisionKindEnum = pgEnum("expense_revision_kind", [
  "submission",
  "edit",
  "clarification_response",
]);
export const expenseDecisionLevelEnum = pgEnum("expense_decision_level", ["accountant", "board"]);
export const expenseDecisionEnum = pgEnum("expense_decision", [
  "approved",
  "approved_different_amount",
  "returned",
  "declined",
]);
/** 6B.5 "How it was paid". */
export const paymentMethodEnum = pgEnum("expense_payment_method", [
  "cheque",
  "church_card",
  "cash",
  "e_transfer",
  "supplier_eft",
  "other",
]);

/**
 * A purchase request (before buying) or an expense claim (after buying), 6B.1. Amounts
 * are integer cents. A purchase request adds tax to its items (FR-41); a claim's lines
 * already include tax, so its subtotal equals its total and its tax is zero. The tax rate
 * is snapshotted at submission.
 */
export const expenseSubmissions = pgTable(
  "expense_submissions",
  {
    id: id(),
    referenceNumber: text("reference_number").unique(),
    type: expenseTypeEnum("type").notNull(),
    budgetCycleId: uuid("budget_cycle_id")
      .notNull()
      .references(() => budgetCycles.id),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id),
    departmentNameSnapshot: text("department_name_snapshot").notNull(),
    requesterUserId: uuid("requester_user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull().default(""),
    justification: text("justification").notNull().default(""),
    status: expenseStatusEnum("status").notNull().default("draft"),
    taxRate: taxRate("tax_rate"),
    subtotalCents: cents("subtotal_cents"),
    taxCents: cents("tax_cents"),
    totalCents: cents("total_cents"),
    approvedSubtotalCents: cents("approved_subtotal_cents"),
    approvedTaxCents: cents("approved_tax_cents"),
    approvedTotalCents: cents("approved_total_cents"),
    approvalNote: text("approval_note"),
    overBudgetExplanation: text("over_budget_explanation"),
    /** FR-46: a claim submitted long after the purchase explains why. */
    lateClaimExplanation: text("late_claim_explanation"),
    howBought: howBoughtEnum("how_bought"),
    linkedPurchaseRequestId: uuid("linked_purchase_request_id").references(
      (): AnyPgColumn => expenseSubmissions.id,
    ),
    payeeKind: payeeKindEnum("payee_kind"),
    payeeName: text("payee_name"),
    payeeEmail: text("payee_email"),
    payeeUserId: uuid("payee_user_id").references(() => users.id),
    paymentPreference: paymentPreferenceEnum("payment_preference"),
    /** 6B.9: no receipt, and why (the accountant sees it). */
    noReceiptReason: text("no_receipt_reason"),
    /**
     * FR-46: an approved purchase request carried into the next year's budget at the
     * year-end lock. `budgetCycleId` is then the new year; this keeps the one it left.
     */
    carriedOverFromCycleId: uuid("carried_over_from_cycle_id").references(
      (): AnyPgColumn => budgetCycles.id,
    ),
    carryOverReason: text("carry_over_reason"),
    carriedOverAt: timestamp("carried_over_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("expense_submissions_cycle_department_idx").on(t.budgetCycleId, t.departmentId),
    index("expense_submissions_status_idx").on(t.status, t.submittedAt),
    check(
      "expense_submissions_amounts_reconcile",
      sql`(${t.subtotalCents} is null and ${t.taxCents} is null and ${t.totalCents} is null)
        or (${t.subtotalCents} >= 0 and ${t.taxCents} >= 0
            and ${t.totalCents} = ${t.subtotalCents} + ${t.taxCents})`,
    ),
    check(
      "expense_submissions_approved_reconcile",
      sql`(${t.approvedSubtotalCents} is null and ${t.approvedTaxCents} is null and ${t.approvedTotalCents} is null)
        or (${t.approvedSubtotalCents} >= 0 and ${t.approvedTaxCents} >= 0
            and ${t.approvedTotalCents} = ${t.approvedSubtotalCents} + ${t.approvedTaxCents})`,
    ),
    check(
      "expense_submissions_submitted_has_snapshot",
      sql`${t.status} = 'draft' or (${t.totalCents} is not null
        and ${t.referenceNumber} is not null and ${t.submittedAt} is not null)`,
    ),
    check(
      "expense_submissions_claim_adds_no_tax",
      sql`${t.type} <> 'expense_claim' or ${t.taxCents} is null or ${t.taxCents} = 0`,
    ),
    check(
      "expense_submissions_charged_has_amount",
      sql`${t.status} not in ('approved', 'processing', 'paid', 'purchased', 'closed', 'cancelled')
        or ${t.approvedTotalCents} is not null`,
    ),
    check(
      "expense_submissions_tax_rate_range",
      sql`${t.taxRate} is null or (${t.taxRate} >= 0 and ${t.taxRate} <= 1)`,
    ),
  ],
);

/** A purchase request's items, before tax (FR-40). */
export const expenseItems = pgTable(
  "expense_items",
  {
    id: id(),
    expenseSubmissionId: uuid("expense_submission_id")
      .notNull()
      .references(() => expenseSubmissions.id),
    itemName: text("item_name").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceCents: cents("unit_price_cents").notNull(),
    lineTotalCents: cents("line_total_cents").notNull(),
    productUrl: text("product_url"),
    annualLineItemId: uuid("annual_line_item_id").references(() => budgetLineItems.id),
    sortOrder: integer("sort_order").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("expense_items_submission_idx").on(t.expenseSubmissionId, t.sortOrder),
    check("expense_items_quantity_range", sql`${t.quantity} between 1 and 10000`),
    check("expense_items_unit_price_range", sql`${t.unitPriceCents} between 0 and 100000000`),
    check(
      "expense_items_total_reconciles",
      sql`${t.lineTotalCents} = ${t.quantity}::bigint * ${t.unitPriceCents}`,
    ),
    check(
      "expense_items_url_http",
      sql`${t.productUrl} is null or ${t.productUrl} ~* '^https?://'`,
    ),
  ],
);

/** An expense claim's receipt lines, as paid, including tax (FR-40). */
export const expenseReceiptLines = pgTable(
  "expense_receipt_lines",
  {
    id: id(),
    expenseSubmissionId: uuid("expense_submission_id")
      .notNull()
      .references(() => expenseSubmissions.id),
    purchaseDate: date("purchase_date").notNull(),
    vendor: text("vendor").notNull(),
    description: text("description").notNull(),
    amountCents: cents("amount_cents").notNull(),
    receiptNumber: text("receipt_number"),
    sortOrder: integer("sort_order").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("expense_receipt_lines_submission_idx").on(t.expenseSubmissionId, t.sortOrder),
    check("expense_receipt_lines_amount_range", sql`${t.amountCents} between 1 and 100000000`),
  ],
);

/**
 * Receipt photos and PDFs on claims (6B.9), stored privately in R2. Never deleted:
 * removing one sets `removed_at`, and the file stays for the retention period.
 */
export const expenseReceiptFiles = pgTable(
  "expense_receipt_files",
  {
    id: id(),
    expenseSubmissionId: uuid("expense_submission_id")
      .notNull()
      .references(() => expenseSubmissions.id),
    storageKey: text("storage_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => users.id),
    uploadedAt: createdAt(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedByUserId: uuid("removed_by_user_id").references(() => users.id),
  },
  (t) => [
    index("expense_receipt_files_submission_idx").on(t.expenseSubmissionId),
    check(
      "expense_receipt_files_type",
      sql`${t.contentType} in ('image/jpeg', 'image/png', 'application/pdf')`,
    ),
    check("expense_receipt_files_size", sql`${t.sizeBytes} > 0 and ${t.sizeBytes} <= 10485760`),
  ],
);

/** Every submitted version, frozen (FR-44 "every version is preserved"). Append-only. */
/**
 * Messages on an expense (6B.4) between the department, the accountant, the board and the
 * office. Plain text, append-only: a message never changes the expense.
 */
export const expenseMessages = pgTable(
  "expense_messages",
  {
    id: id(),
    expenseSubmissionId: uuid("expense_submission_id")
      .notNull()
      .references(() => expenseSubmissions.id),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id),
    actingRole: roleEnum("acting_role").notNull(),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("expense_messages_expense_idx").on(t.expenseSubmissionId, t.createdAt),
    index("expense_messages_author_idx").on(t.authorUserId, t.createdAt),
    check(
      "expense_messages_body_length",
      sql`btrim(${t.body}) <> '' and char_length(${t.body}) <= 2000`,
    ),
  ],
);

export const expenseRevisions = pgTable(
  "expense_revisions",
  {
    id: id(),
    expenseSubmissionId: uuid("expense_submission_id")
      .notNull()
      .references(() => expenseSubmissions.id),
    revisionNumber: integer("revision_number").notNull(),
    kind: expenseRevisionKindEnum("kind").notNull(),
    editedByUserId: uuid("edited_by_user_id")
      .notNull()
      .references(() => users.id),
    taxRate: taxRate("tax_rate"),
    subtotalCents: cents("subtotal_cents").notNull(),
    taxCents: cents("tax_cents").notNull(),
    totalCents: cents("total_cents").notNull(),
    /** Every field and line exactly as submitted. */
    snapshot: jsonb("snapshot").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("expense_revisions_submission_number_key").on(t.expenseSubmissionId, t.revisionNumber),
    check(
      "expense_revisions_reconciles",
      sql`${t.subtotalCents} >= 0 and ${t.taxCents} >= 0 and ${t.totalCents} = ${t.subtotalCents} + ${t.taxCents}`,
    ),
  ],
);

/** Each decision at each level (6B.4), with the version decided on. Append-only. */
export const expenseDecisions = pgTable(
  "expense_decisions",
  {
    id: id(),
    expenseSubmissionId: uuid("expense_submission_id")
      .notNull()
      .references(() => expenseSubmissions.id),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => expenseRevisions.id),
    level: expenseDecisionLevelEnum("level").notNull(),
    decision: expenseDecisionEnum("decision").notNull(),
    approvedSubtotalCents: cents("approved_subtotal_cents"),
    approvedTaxCents: cents("approved_tax_cents"),
    approvedTotalCents: cents("approved_total_cents"),
    reason: text("reason"),
    /** FR-43: the department's Remaining after this decision, worked out when it was made. */
    remainingAfterCents: cents("remaining_after_cents"),
    decidedByUserId: uuid("decided_by_user_id")
      .notNull()
      .references(() => users.id),
    actingRole: roleEnum("acting_role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("expense_decisions_submission_idx").on(t.expenseSubmissionId, t.createdAt),
    check(
      "expense_decisions_amounts_reconcile",
      sql`(${t.approvedSubtotalCents} is null and ${t.approvedTaxCents} is null and ${t.approvedTotalCents} is null)
        or (${t.approvedSubtotalCents} >= 0 and ${t.approvedTaxCents} >= 0
            and ${t.approvedTotalCents} = ${t.approvedSubtotalCents} + ${t.approvedTaxCents})`,
    ),
    check(
      "expense_decisions_approval_has_amount",
      sql`${t.decision} not in ('approved', 'approved_different_amount') or ${t.approvedTotalCents} is not null`,
    ),
  ],
);

/** How an approved expense was paid or bought (6B.5). Append-only. */
export const expensePayments = pgTable(
  "expense_payments",
  {
    id: id(),
    expenseSubmissionId: uuid("expense_submission_id")
      .notNull()
      .unique()
      .references(() => expenseSubmissions.id),
    method: paymentMethodEnum("method").notNull(),
    methodOther: text("method_other"),
    paidOn: date("paid_on").notNull(),
    amountCents: cents("amount_cents").notNull(),
    differenceNote: text("difference_note"),
    reference: text("reference"),
    chequeSigner1Id: uuid("cheque_signer_1_id").references(() => signingAuthorities.id),
    chequeSigner1Name: text("cheque_signer_1_name"),
    chequeSigner2Id: uuid("cheque_signer_2_id").references(() => signingAuthorities.id),
    chequeSigner2Name: text("cheque_signer_2_name"),
    purchasedBy: text("purchased_by"),
    cashReceivedBy: text("cash_received_by"),
    receiptSigned: boolean("receipt_signed"),
    notes: text("notes"),
    recordedByUserId: uuid("recorded_by_user_id")
      .notNull()
      .references(() => users.id),
    recordedAt: createdAt(),
  },
  (t) => [
    check("expense_payments_amount_positive", sql`${t.amountCents} > 0`),
    check(
      "expense_payments_cheque_signers",
      sql`${t.method} <> 'cheque' or (${t.chequeSigner1Id} is not null and ${t.chequeSigner2Id} is not null
        and ${t.chequeSigner1Id} <> ${t.chequeSigner2Id} and ${t.reference} is not null)`,
    ),
    check(
      "expense_payments_other_named",
      sql`${t.method} <> 'other' or ${t.methodOther} is not null`,
    ),
  ],
);

// ---------------------------------------------------------------- spending (9.15)

export const spendingEntryTypeEnum = pgEnum("spending_entry_type", ["expense", "refund"]);
export const spendingEntryStatusEnum = pgEnum("spending_entry_status", ["recorded", "voided"]);

/**
 * Money actually spent against a department's budget (FR-24), including tax. Stage 3
 * creates entries from approved claims and purchases (FR-42); Stage 4 adds the ledger
 * where they're entered, corrected and voided. Never deleted: voided with a reason.
 */
export const spendingEntries = pgTable(
  "spending_entries",
  {
    id: id(),
    budgetCycleId: uuid("budget_cycle_id")
      .notNull()
      .references(() => budgetCycles.id),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id),
    budgetRequestId: uuid("budget_request_id").references(() => budgetRequests.id),
    expenseSubmissionId: uuid("expense_submission_id").references(() => expenseSubmissions.id),
    /** The approved line this was spent on (FR-25 "Spending by line item"); null is "General". */
    budgetLineItemId: uuid("budget_line_item_id").references(() => budgetLineItems.id),
    /** Recorded for a department with no approved budget, after a warning (FR-24). */
    unbudgeted: boolean("unbudgeted").notNull().default(false),
    entryType: spendingEntryTypeEnum("entry_type").notNull(),
    spentOn: date("spent_on").notNull(),
    payee: text("payee").notNull(),
    description: text("description").notNull(),
    amountCents: cents("amount_cents").notNull(),
    paymentMethod: text("payment_method"),
    referenceNumber: text("reference_number"),
    notes: text("notes"),
    overspendNote: text("overspend_note"),
    status: spendingEntryStatusEnum("status").notNull().default("recorded"),
    voidReason: text("void_reason"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("spending_entries_cycle_department_idx").on(t.budgetCycleId, t.departmentId),
    // One automatic entry per approved claim or purchase (FR-42).
    uniqueIndex("spending_entries_one_per_expense")
      .on(t.expenseSubmissionId)
      .where(sql`${t.expenseSubmissionId} is not null and ${t.status} = 'recorded'`),
    check("spending_entries_amount_positive", sql`${t.amountCents} > 0`),
    check(
      "spending_entries_void_has_reason",
      sql`${t.status} <> 'voided' or ${t.voidReason} is not null`,
    ),
  ],
);

/**
 * Budget amendments (FR-27, 9.16): the accountant raises or lowers a department's
 * available budget, including tax, with a reason. The original approval never changes;
 * each amendment is its own append-only record (database trigger), and the budget is the
 * approved total plus every amendment.
 */
export const budgetAmendments = pgTable(
  "budget_amendments",
  {
    id: id(),
    budgetRequestId: uuid("budget_request_id")
      .notNull()
      .references(() => budgetRequests.id),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id),
    budgetCycleId: uuid("budget_cycle_id")
      .notNull()
      .references(() => budgetCycles.id),
    /** Before tax; negative for a reduction. */
    amountBeforeTaxCents: integer("amount_before_tax_cents").notNull(),
    taxCents: integer("tax_cents").notNull(),
    /** Including tax: what the budget changes by. */
    amountCents: integer("amount_cents").notNull(),
    taxRate: taxRate("tax_rate").notNull(),
    reason: text("reason").notNull(),
    boardReference: text("board_reference"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("budget_amendments_cycle_department_idx").on(t.budgetCycleId, t.departmentId),
    check(
      "budget_amendments_amounts_reconcile",
      sql`${t.amountCents} <> 0 and ${t.amountBeforeTaxCents} + ${t.taxCents} = ${t.amountCents}`,
    ),
    check("budget_amendments_reason", sql`btrim(${t.reason}) <> ''`),
  ],
);
