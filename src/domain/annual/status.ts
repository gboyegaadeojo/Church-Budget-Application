/**
 * Annual budget request status machine (Requirements 12, FR-12, FR-17, FR-18a, FR-34).
 * Every status change goes through `transition`; the server rejects anything else.
 */

export const ANNUAL_STATUSES = [
  "draft",
  "submitted",
  "updated",
  "in_review",
  "returned",
  "awaiting_second_approval",
  "approved",
  "declined",
  "closed",
] as const;

export type AnnualStatus = (typeof ANNUAL_STATUSES)[number];

export type AnnualEvent =
  /** Requester confirms the preview (FR-10). */
  | "submit"
  /** Requester saves one of the two post-submission edits (FR-12). */
  | "revise"
  /** Requester answers a return for clarification; does not use an edit (FR-17). */
  | "respond"
  /** Accountant opens the request for review. */
  | "start_review"
  | "return"
  | "approve"
  /** Approval at or above the second-approval threshold (FR-34). */
  | "approve_pending_second"
  | "second_approve"
  | "second_refuse"
  | "decline"
  /** Accountant reconsiders a decided request (FR-18a). */
  | "reopen"
  /** Administrator rejects the proposed department (FR-03): back to Draft. */
  | "department_rejected"
  /** The approved budget's year has ended. */
  | "close";

const TRANSITIONS: Record<AnnualEvent, Partial<Record<AnnualStatus, AnnualStatus>>> = {
  submit: { draft: "submitted" },
  revise: { submitted: "updated", updated: "updated", in_review: "updated" },
  respond: { returned: "updated" },
  start_review: { submitted: "in_review", updated: "in_review" },
  return: { in_review: "returned" },
  approve: { in_review: "approved" },
  approve_pending_second: { in_review: "awaiting_second_approval" },
  second_approve: { awaiting_second_approval: "approved" },
  second_refuse: { awaiting_second_approval: "in_review" },
  decline: { in_review: "declined" },
  reopen: { approved: "returned", declined: "returned" },
  department_rejected: {
    submitted: "draft",
    updated: "draft",
    in_review: "draft",
    returned: "draft",
  },
  // Only approved budgets close at year end; a declined request stays Declined.
  close: { approved: "closed" },
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: AnnualStatus,
    readonly event: AnnualEvent,
  ) {
    super(`Cannot ${event} an annual budget request that is ${from}`);
    this.name = "InvalidTransitionError";
  }
}

export function nextStatus(from: AnnualStatus, event: AnnualEvent): AnnualStatus | undefined {
  return TRANSITIONS[event][from];
}

export function canTransition(from: AnnualStatus, event: AnnualEvent): boolean {
  return nextStatus(from, event) !== undefined;
}

/** The status after `event`, or throws InvalidTransitionError. */
export function transition(from: AnnualStatus, event: AnnualEvent): AnnualStatus {
  const to = nextStatus(from, event);
  if (!to) throw new InvalidTransitionError(from, event);
  return to;
}

/** Requests the requester can still change (Requirements 12: never after a decision). */
export function isRequesterEditable(status: AnnualStatus): boolean {
  return canTransition(status, "revise") || status === "draft" || status === "returned";
}

/** Requests that count as submitted (FR-14: a draft never counts). */
export function isSubmitted(status: AnnualStatus): boolean {
  return status !== "draft";
}

/** Approved budgets, which others may read (Requirements 3.6). */
export function isApproved(status: AnnualStatus): boolean {
  return status === "approved" || status === "closed";
}
