/**
 * Expense submission status machine (FR-45). Every status change goes through
 * `transition`; the server rejects anything else. Purchase requests and expense claims
 * share the machine; a few events are for one type only (`EVENT_TYPES`).
 *
 * The two approvals run side by side (decided 2026-10-16): the accountant and the Board
 * Chair are both asked at submission and either may decide first. The first approval
 * moves it to "waiting for the other"; the second makes it Approved.
 */

export const EXPENSE_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "returned",
  "awaiting_board",
  "awaiting_accountant",
  "approved",
  "processing",
  "paid",
  "purchased",
  "closed",
  "cancelled",
  "withdrawn",
  "declined",
] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const EXPENSE_TYPES = ["purchase_request", "expense_claim"] as const;
export type ExpenseType = (typeof EXPENSE_TYPES)[number];

export type ExpenseEvent =
  /** The requester confirms the preview. */
  | "submit"
  /** The requester answers a return for clarification. */
  | "respond"
  /** The requester withdraws it before any approval (FR-44). */
  | "withdraw"
  /** Either approver opens it for review; editing stops (FR-44). */
  | "start_review"
  /** Either approver asks the requester a question; both approve again afterwards. */
  | "return"
  /** The accountant's approval: final if the Board Chair has already approved. */
  | "accountant_approve"
  /** The Board Chair's (or Vice-Chair's) approval: final if the accountant has approved. */
  | "board_approve"
  /** Either level declines, with a reason. */
  | "decline"
  /** The Church Administrator starts the payment or purchase (6B.5). */
  | "start_processing"
  /** Expense claim: the payee was paid. */
  | "pay"
  /** Purchase request: bought on the church's account. */
  | "purchase"
  /** Finished: paid or purchased, or a purchase request closed by its linked claim. */
  | "close"
  /** An approved purchase request that won't go ahead; its commitment is released. */
  | "cancel";

const TRANSITIONS: Record<ExpenseEvent, Partial<Record<ExpenseStatus, ExpenseStatus>>> = {
  submit: { draft: "submitted" },
  respond: { returned: "submitted" },
  withdraw: { submitted: "withdrawn", returned: "withdrawn" },
  start_review: { submitted: "in_review" },
  return: { in_review: "returned", awaiting_board: "returned", awaiting_accountant: "returned" },
  accountant_approve: { in_review: "awaiting_board", awaiting_accountant: "approved" },
  board_approve: { in_review: "awaiting_accountant", awaiting_board: "approved" },
  decline: { in_review: "declined", awaiting_board: "declined", awaiting_accountant: "declined" },
  start_processing: { approved: "processing" },
  pay: { processing: "paid" },
  purchase: { processing: "purchased" },
  close: { paid: "closed", purchased: "closed", approved: "closed", processing: "closed" },
  cancel: { approved: "cancelled" },
};

/** Events that only one type of submission has. */
const EVENT_TYPES: Partial<Record<ExpenseEvent, ExpenseType>> = {
  pay: "expense_claim",
  purchase: "purchase_request",
  cancel: "purchase_request",
};

export class InvalidExpenseTransitionError extends Error {
  constructor(
    readonly from: ExpenseStatus,
    readonly event: ExpenseEvent,
    readonly type: ExpenseType,
  ) {
    super(`Cannot ${event} a ${type.replace("_", " ")} that is ${from}`);
    this.name = "InvalidExpenseTransitionError";
  }
}

export function nextExpenseStatus(
  from: ExpenseStatus,
  event: ExpenseEvent,
  type: ExpenseType,
): ExpenseStatus | undefined {
  const only = EVENT_TYPES[event];
  if (only && only !== type) return undefined;
  // A claim is closed by being paid; only a purchase request closes from Approved or
  // Processing, when the claim it led to is approved (FR-42, FR-45).
  if (
    event === "close" &&
    (from === "approved" || from === "processing") &&
    type !== "purchase_request"
  ) {
    return undefined;
  }
  return TRANSITIONS[event][from];
}

export function canTransitionExpense(
  from: ExpenseStatus,
  event: ExpenseEvent,
  type: ExpenseType,
): boolean {
  return nextExpenseStatus(from, event, type) !== undefined;
}

/** The status after `event`, or throws InvalidExpenseTransitionError. */
export function transitionExpense(
  from: ExpenseStatus,
  event: ExpenseEvent,
  type: ExpenseType,
): ExpenseStatus {
  const to = nextExpenseStatus(from, event, type);
  if (!to) throw new InvalidExpenseTransitionError(from, event, type);
  return to;
}

/** The requester may still change it: a draft, before review starts, or when returned (FR-44). */
export function isExpenseEditable(status: ExpenseStatus): boolean {
  return status === "draft" || status === "submitted" || status === "returned";
}

/** Waiting for someone to decide: shown as Pending on the budget, not deducted (FR-42). */
export const PENDING_STATUSES: readonly ExpenseStatus[] = [
  "submitted",
  "in_review",
  "returned",
  "awaiting_board",
  "awaiting_accountant",
];

/** Still waiting for the accountant's approval in this round. */
export const ACCOUNTANT_WAITING: readonly ExpenseStatus[] = [
  "submitted",
  "in_review",
  "awaiting_accountant",
];

/** Still waiting for the Board Chair's (or Vice-Chair's) approval in this round. */
export const BOARD_WAITING: readonly ExpenseStatus[] = ["submitted", "in_review", "awaiting_board"];

/** Both approvals given, at any later step. */
export const FULLY_APPROVED: readonly ExpenseStatus[] = [
  "approved",
  "processing",
  "paid",
  "purchased",
  "closed",
  "cancelled",
];

/** Whether this level has approved in the current round. */
export function levelApproved(status: ExpenseStatus, level: "accountant" | "board"): boolean {
  if (FULLY_APPROVED.includes(status)) return true;
  return level === "accountant" ? status === "awaiting_board" : status === "awaiting_accountant";
}

/** Both approvals given, not yet finished: an open purchase request is Committed (FR-25). */
export const COMMITTED_STATUSES: readonly ExpenseStatus[] = ["approved", "processing"];

/** Gone without touching the budget. */
export const ENDED_WITHOUT_CHARGE: readonly ExpenseStatus[] = [
  "withdrawn",
  "declined",
  "cancelled",
];
