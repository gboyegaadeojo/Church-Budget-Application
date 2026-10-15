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

export type Subject = Pick<Viewer, "id" | "roles" | "departments">;

export type Action =
  // Annual budgets (Part A)
  | "annual.view"
  | "annual.edit_draft"
  | "annual.submit"
  | "annual.revise"
  | "annual.decide"
  | "annual.reopen"
  | "annual.export_all"
  // Expenses (Part B)
  | "expense.view"
  | "expense.submit"
  | "expense.first_approve"
  | "expense.final_approve"
  | "expense.pay"
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
  | "admin.pco_mapping"
  | "department.set_primary"
  | "department.set_backup"
  | "cycle.extend_deadline"
  // Everyone
  | "home.view"
  | "analytics.view";

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

const primaryOfDepartment: Check = (s, ctx) =>
  s.departments.some((d) => d.id === ctx.departmentId && d.representativeType === "primary")
    ? null
    : "not_primary_requester";

/** FR-33: nobody decides for a department they represent. Unknown department → deny. */
const notOwnDepartment: Check = (s, ctx) =>
  ctx.departmentId === undefined || represents(s, ctx.departmentId) ? "conflict_of_interest" : null;

/** 3.3: the board also never approves an expense that pays themselves. */
const notOwnDepartmentOrPayee: Check = (s, ctx) =>
  notOwnDepartment(s, ctx) ?? (ctx.payeeUserId === s.id ? "conflict_of_interest" : null);

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
  "annual.edit_draft": [{ roles: ["requester"], check: ownDepartment }],
  "annual.submit": [{ roles: ["requester"], check: ownDepartment }],
  "annual.revise": [{ roles: ["requester"], check: ownDepartment }],
  "annual.decide": [{ roles: ACCOUNTANTS, check: notOwnDepartment }],
  "annual.reopen": [{ roles: ACCOUNTANTS, check: notOwnDepartment }],
  "annual.export_all": [{ roles: [...ACCOUNTANTS, "system_admin"] }],

  "expense.view": [
    { roles: ["requester"], check: ownDepartment },
    { roles: [...ACCOUNTANTS, "church_admin"] },
    { roles: BOARD, check: sentToBoard, readOnly: true },
    { roles: ["system_admin"], readOnly: true },
  ],
  "expense.submit": [{ roles: ["requester"], check: ownDepartment }],
  "expense.first_approve": [{ roles: ACCOUNTANTS, check: notOwnDepartmentOrPayee }],
  "expense.final_approve": [{ roles: BOARD, check: notOwnDepartmentOrPayee }],
  "expense.pay": [{ roles: [...ACCOUNTANTS, "church_admin"], check: notPayee }],

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
  "admin.pco_mapping": [{ roles: ["system_admin"] }],
  "department.set_primary": [{ roles: ["system_admin"] }],
  "department.set_backup": [
    { roles: ["system_admin"] },
    { roles: ["requester"], check: primaryOfDepartment },
  ],
  "cycle.extend_deadline": [{ roles: ["system_admin", ...ACCOUNTANTS] }],

  "home.view": [{ roles: EVERY_ROLE }],
  "analytics.view": [
    { roles: EVERY_ROLE.filter((r) => !BOARD.includes(r)) },
    { roles: BOARD, readOnly: true },
  ],
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
