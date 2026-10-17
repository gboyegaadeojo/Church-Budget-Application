import type { AnnualStatus } from "@/domain/annual/status";
import { isApproved } from "@/domain/annual/status";
import type { Role, Viewer } from "./roles";

/**
 * Every permission check in one place (CLAUDE.md constraint 4, Requirements 3.6).
 *
 * A person's permissions are the union of their roles. The System Administrator reads
 * everything but takes no money action without the matching role. Conflict of interest
 * (FR-33, 3.3) blocks deciding for a department you represent, or paying yourself.
 *
 * Hiding UI is not security: every route and server action calls `authorize` or
 * `assertCan` before doing anything.
 */

export type Subject = Pick<Viewer, "id" | "roles" | "departments" | "expenseDepartments">;

export type Action =
  // Annual budgets (Part A)
  | "annual.view"
  /** Pick a department on the form, joining it if needed (FR-03, FR-38). */
  | "annual.start"
  | "annual.edit_draft"
  | "annual.delete_draft"
  | "annual.submit"
  | "annual.revise"
  /** The accountant dashboard and review queue (FR-13, FR-14). */
  | "annual.review"
  | "annual.decide"
  | "annual.reopen"
  /** Give or refuse the second approval of a large budget (FR-34). */
  | "annual.second_approve"
  | "annual.export_all"
  /** Choose how decisions reach departments, and release held ones (FR-19a). */
  | "annual.release"
  /**
   * See a decision before it's released (FR-19a): the staff roles see it as soon as it's
   * made; a department sees In Review until release.
   */
  | "annual.view_held"
  /** Read a request's messages between the department and the accountant (FR-31). */
  | "annual.messages_view"
  /** Send one: the department's leaders, or the accountant's side once it's submitted. */
  | "annual.message_send"
  // Expenses (Part B)
  | "expense.view"
  /** Every department's expenses (All expenses), not just one's own. */
  | "expense.view_all"
  | "expense.submit"
  /** The accountant's review queue (6B.4 level 1). */
  | "expense.review_queue"
  | "expense.first_approve"
  /** The Board Chair's queue, "Awaiting my approval" (6B.4 level 2). */
  | "expense.board_queue"
  | "expense.final_approve"
  /** The Ready to process queue (6B.5). */
  | "expense.process_queue"
  | "expense.pay"
  /** Cancel an approved purchase request that won't go ahead (FR-44). */
  | "expense.cancel"
  | "expense.export"
  /** Write on an expense's thread (6B.4): the department, the approvers and the office. */
  | "expense.message_send"
  // Spending
  | "spending.view"
  | "spending.record"
  | "spending.amend"
  | "spending.lock"
  | "spending.export"
  // Administration
  | "admin.users"
  | "admin.departments"
  | "admin.cycles"
  | "admin.settings"
  /** Settings → Branding: the logo upload, names and accent colour (FR-30, AC-101). */
  | "admin.branding"
  | "admin.pco_mapping"
  | "admin.notifications"
  | "department.set_primary"
  | "department.set_backup"
  | "cycle.extend_deadline"
  /** Set one's own Away, so accountant emails go to the backup approvers (FR-33). */
  | "account.away" /** Set the department's Primary as Away, so the Backups cover (FR-38). */
  | "department.away"
  // Everyone
  | "home.view"
  | "analytics.view"
  /**
   * The administration log in Analytics & Audit: sign-ins and access denied, settings and
   * role changes, emails, and the Access tab (FR-52). Not other staff, even for their own.
   */
  | "analytics.admin_audit";

/** What the action is about. Pass whatever applies; rules that need a field treat it as missing. */
export type AuthzContext = {
  /** The department the item belongs to. */
  departmentId?: string;
  /** Annual request status, for roles that may only read approved budgets. */
  annualStatus?: AnnualStatus;
  /** The person an expense pays. */
  payeeUserId?: string;
  /** An expense has reached the Board Chair (they read only what is sent to them). */
  sentToBoard?: boolean;
  /** Who submitted the expense: nobody approves their own claim (FR-47). */
  requesterUserId?: string;
};

export type DenyReason =
  | "missing_role"
  | "not_department_representative"
  | "not_primary_requester"
  | "conflict_of_interest"
  | "not_approved"
  | "draft_private"
  | "not_sent_to_board";

export type Decision =
  { allowed: true; actingRole: Role; readOnly: boolean } | { allowed: false; reason: DenyReason };

type Check = (subject: Subject, ctx: AuthzContext) => DenyReason | null;

type Rule = {
  roles: readonly Role[];
  check?: Check;
  /** The role may look but not change anything (System Administrator, board reads). */
  readOnly?: boolean;
};

const ACCOUNTANTS: readonly Role[] = ["accountant", "backup_approver"];
const BOARD: readonly Role[] = ["board_chair", "vice_chair"];
const EVERY_ROLE: readonly Role[] = [
  "requester",
  "accountant",
  "backup_approver",
  "board_chair",
  "vice_chair",
  "church_admin",
  "system_admin",
];

function represents(subject: Subject, departmentId: string | undefined): boolean {
  return departmentId !== undefined && subject.departments.some((d) => d.id === departmentId);
}

const ownDepartment: Check = (s, ctx) =>
  represents(s, ctx.departmentId) ? null : "not_department_representative";

/**
 * 6B.2: a representative, or an Expense submitter for the department. A submitter acts
 * only on what they submitted (a new expense has no submitter yet).
 */
const submitsFor: Check = (s, ctx) => {
  if (represents(s, ctx.departmentId)) return null;
  const given = s.expenseDepartments?.some((d) => d.id === ctx.departmentId) ?? false;
  const theirs = ctx.requesterUserId === undefined || ctx.requesterUserId === s.id;
  return given && theirs ? null : "not_department_representative";
};

const primaryOfDepartment: Check = (s, ctx) =>
  s.departments.some((d) => d.id === ctx.departmentId && d.representativeType === "primary")
    ? null
    : "not_primary_requester";

/** FR-33: nobody decides for a department they represent. Unknown department → deny. */
const notOwnDepartment: Check = (s, ctx) =>
  ctx.departmentId === undefined || represents(s, ctx.departmentId) ? "conflict_of_interest" : null;

/** 3.3, FR-47: nobody approves an expense that pays themselves or that they submitted. */
const notOwnDepartmentOrPayee: Check = (s, ctx) =>
  notOwnDepartment(s, ctx) ??
  (ctx.payeeUserId === s.id || ctx.requesterUserId === s.id ? "conflict_of_interest" : null);

const notPayee: Check = (s, ctx) => (ctx.payeeUserId === s.id ? "conflict_of_interest" : null);

const approvedOnly: Check = (_s, ctx) =>
  ctx.annualStatus && isApproved(ctx.annualStatus) ? null : "not_approved";

/** The accountant sees submitted requests; a draft's contents stay with the department. */
const notDraft: Check = (_s, ctx) =>
  ctx.annualStatus && ctx.annualStatus !== "draft" ? null : "draft_private";

const sentToBoard: Check = (_s, ctx) => (ctx.sentToBoard ? null : "not_sent_to_board");

/**
 * Rules per action, in priority order: the first rule a person passes decides their
 * acting role, so roles that can act come before read-only ones.
 */
const RULES: Record<Action, readonly Rule[]> = {
  "annual.view": [
    { roles: ["requester"], check: ownDepartment },
    { roles: ACCOUNTANTS, check: notDraft },
    { roles: ["church_admin"], check: approvedOnly, readOnly: true },
    { roles: BOARD, check: approvedOnly, readOnly: true },
    { roles: ["system_admin"], readOnly: true },
  ],
  // Any requester may pick any department on the form; picking it makes them a representative.
  "annual.start": [{ roles: ["requester"] }],
  "annual.edit_draft": [{ roles: ["requester"], check: ownDepartment }],
  "annual.delete_draft": [{ roles: ["requester"], check: ownDepartment }],
  "annual.submit": [{ roles: ["requester"], check: ownDepartment }],
  "annual.revise": [{ roles: ["requester"], check: ownDepartment }],
  "annual.review": [{ roles: ACCOUNTANTS }, { roles: ["system_admin"], readOnly: true }],
  "annual.decide": [{ roles: ACCOUNTANTS, check: notOwnDepartment }],
  "annual.reopen": [{ roles: ACCOUNTANTS, check: notOwnDepartment }],
  // The service also refuses the person who gave the first approval.
  "annual.second_approve": [{ roles: ACCOUNTANTS, check: notOwnDepartment }],
  "annual.export_all": [{ roles: [...ACCOUNTANTS, "system_admin"] }],
  // Reading the release overview is "annual.review"; this is for changing it.
  "annual.release": [{ roles: ACCOUNTANTS }],
  // FR-31: the thread is between the department and the accountant's side; a leader who is
  // also an accountant writes as the department. The administrator reads every message
  // (AC-110); the board and Church Administrator aren't part of it.
  "annual.messages_view": [
    { roles: ["requester"], check: ownDepartment },
    { roles: ACCOUNTANTS, check: notDraft },
    { roles: ["system_admin"], readOnly: true },
  ],
  "annual.message_send": [
    { roles: ["requester"], check: ownDepartment },
    { roles: ACCOUNTANTS, check: notDraft },
  ],
  "annual.view_held": [
    { roles: ACCOUNTANTS },
    { roles: ["church_admin", ...BOARD, "system_admin"], readOnly: true },
  ],

  "expense.view": [
    { roles: ["requester"], check: submitsFor },
    { roles: [...ACCOUNTANTS, "church_admin"] },
    { roles: BOARD, check: sentToBoard, readOnly: true },
    { roles: ["system_admin"], readOnly: true },
  ],
  "expense.view_all": [
    { roles: [...ACCOUNTANTS, "church_admin"] },
    { roles: ["system_admin"], readOnly: true },
  ],
  "expense.submit": [{ roles: ["requester"], check: submitsFor }],
  "expense.review_queue": [{ roles: ACCOUNTANTS }, { roles: ["system_admin"], readOnly: true }],
  "expense.first_approve": [{ roles: ACCOUNTANTS, check: notOwnDepartmentOrPayee }],
  "expense.board_queue": [{ roles: BOARD }, { roles: ["system_admin"], readOnly: true }],
  // The service also lets the Vice-Chair act only while the Chair is Away or conflicted.
  "expense.final_approve": [{ roles: BOARD, check: notOwnDepartmentOrPayee }],
  "expense.process_queue": [
    { roles: [...ACCOUNTANTS, "church_admin"] },
    { roles: ["system_admin"], readOnly: true },
  ],
  "expense.pay": [{ roles: [...ACCOUNTANTS, "church_admin"], check: notPayee }],
  "expense.cancel": [{ roles: ["requester"], check: ownDepartment }, { roles: ACCOUNTANTS }],
  "expense.export": [{ roles: [...ACCOUNTANTS, "church_admin", "system_admin"] }],
  "expense.message_send": [
    { roles: ["requester"], check: ownDepartment },
    { roles: ACCOUNTANTS },
    { roles: BOARD, check: sentToBoard },
    { roles: ["church_admin"] },
  ],

  "spending.view": [
    { roles: [...ACCOUNTANTS, "church_admin"] },
    { roles: ["requester"], check: ownDepartment, readOnly: true },
    { roles: [...BOARD, "system_admin"], readOnly: true },
  ],
  "spending.record": [{ roles: [...ACCOUNTANTS, "church_admin"] }],
  "spending.amend": [{ roles: ACCOUNTANTS }],
  "spending.lock": [{ roles: ACCOUNTANTS }],
  "spending.export": [{ roles: [...ACCOUNTANTS, "church_admin", "system_admin"] }],

  "admin.users": [{ roles: ["system_admin"] }],
  "admin.departments": [{ roles: ["system_admin"] }],
  "admin.cycles": [{ roles: ["system_admin"] }],
  "admin.settings": [{ roles: ["system_admin"] }],
  "admin.branding": [{ roles: ["system_admin"] }],
  "admin.pco_mapping": [{ roles: ["system_admin"] }],
  /** Admin → Notifications & Audit: the email log and retrying failed emails (FR-21). */
  "admin.notifications": [{ roles: ["system_admin"] }],
  "department.set_primary": [{ roles: ["system_admin"] }],
  "department.set_backup": [
    { roles: ["system_admin"] },
    { roles: ["requester"], check: primaryOfDepartment },
  ],
  "cycle.extend_deadline": [{ roles: ["system_admin", ...ACCOUNTANTS] }],
  // The Board Chair's Away routes expense final approvals to the Vice-Chair (3.3, AC-112).
  "account.away": [{ roles: [...ACCOUNTANTS, ...BOARD] }],
  "department.away": [
    { roles: ["requester"], check: primaryOfDepartment },
    { roles: ["system_admin"] },
  ],

  "home.view": [{ roles: EVERY_ROLE }],
  // Staff only, by the church's decision (docs/decisions.md, 2026-10-16): a requester sees
  // their own budget's history on the budget, not the dashboard.
  "analytics.view": [
    { roles: [...ACCOUNTANTS, "church_admin", "system_admin"] },
    { roles: BOARD, readOnly: true },
  ],
  "analytics.admin_audit": [{ roles: ["system_admin"] }],
};

/** Decides whether `subject` may perform `action` on the item described by `ctx`. */
export function authorize(subject: Subject, action: Action, ctx: AuthzContext = {}): Decision {
  let denial: DenyReason | null = null;
  for (const rule of RULES[action]) {
    const role = rule.roles.find((r) => subject.roles.includes(r));
    if (!role) continue;
    const reason = rule.check?.(subject, ctx) ?? null;
    if (reason === null) return { allowed: true, actingRole: role, readOnly: !!rule.readOnly };
    denial ??= reason;
  }
  return { allowed: false, reason: denial ?? "missing_role" };
}

export function can(subject: Subject, action: Action, ctx?: AuthzContext): boolean {
  return authorize(subject, action, ctx).allowed;
}

export class ForbiddenError extends Error {
  constructor(
    readonly action: Action,
    readonly reason: DenyReason,
  ) {
    super(`Not allowed: ${action} (${reason})`);
    this.name = "ForbiddenError";
  }
}

/**
 * Throws ForbiddenError unless allowed. Returns the role the person acted in, which
 * goes on the audit event (FR-22). The caller records access-denied events.
 */
export function assertCan(
  subject: Subject,
  action: Action,
  ctx?: AuthzContext,
): { actingRole: Role; readOnly: boolean } {
  const decision = authorize(subject, action, ctx);
  if (!decision.allowed) throw new ForbiddenError(action, decision.reason);
  return { actingRole: decision.actingRole, readOnly: decision.readOnly };
}
