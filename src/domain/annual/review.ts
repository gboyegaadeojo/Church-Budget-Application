import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { annualCopy } from "@/copy/annual";
import {
  approvalAdjustments,
  approvalDecisions,
  approvedLineItems,
  budgetRequests,
  idempotencyKeys,
  requestRevisions,
} from "@/db/schema";
import type { Tx } from "@/db/types";
import { ConflictError, parseInput, RuleError, ValidationError } from "@/domain/errors";
import { writeAudit } from "@/lib/audit";
import { assertCan, authorize, type Subject } from "@/lib/authz";
import type { TaxBreakdown } from "@/lib/money";
import { approvedFigures, decisionSchema, DECISION_LIMITS, type DecisionKind } from "./decision";
import {
  actorOf,
  lineRowsOf,
  loadRequest,
  nextOrRefuse,
  parseKey,
  parseVersion,
  previousResult,
  updateRequest,
  type RequestRow,
} from "./service";
import { canTransition, transition, type AnnualEvent, type AnnualStatus } from "./status";

/**
 * Annual budget requests, the accountant's side (FR-13 to FR-18a). Same order as the
 * requester's services: permission → validation → state machine → write → audit, in the
 * caller's transaction. Every approved figure is recalculated here from the stored lines
 * at the request's snapshotted rate; nothing the browser totals is trusted.
 *
 * Decisions, approved lines and adjustments are append-only history (Requirements 9.10
 * to 9.12): a reopen adds a decision rather than removing one.
 */

const e = annualCopy.errors;
type Options = { now?: Date };

/** The submitted version a decision is about (9.12): always the latest one. */
async function latestRevisionId(tx: Tx, row: RequestRow): Promise<string> {
  const [revision] = await tx
    .select({ id: requestRevisions.id })
    .from(requestRevisions)
    .where(
      and(
        eq(requestRevisions.budgetRequestId, row.id),
        eq(requestRevisions.revisionNumber, row.versionNumber),
      ),
    )
    .limit(1);
  if (!revision) throw new RuleError(e.notDecidable);
  return revision.id;
}

const auditBase = (row: RequestRow) => ({
  entity: { type: "budget_request", id: row.id },
  budgetRequestId: row.id,
  departmentId: row.departmentId,
  cycleId: row.budgetCycleId,
});

// ---------------------------------------------------------------- start review

/**
 * Marks a Submitted or Updated request In Review when an accountant who may decide it
 * opens it (Requirements 12). The content is unchanged, so the version stays and a
 * representative editing at the same time is not interrupted. Returns whether it moved.
 */
export async function startReview(tx: Tx, actor: Subject, input: { id: string }): Promise<boolean> {
  const row = await loadRequest(tx, input.id, true);
  const decision = authorize(actor, "annual.decide", {
    departmentId: row.departmentId,
    annualStatus: row.status,
  });
  if (!decision.allowed || !canTransition(row.status, "start_review")) return false;
  const next = transition(row.status, "start_review");
  await tx
    .update(budgetRequests)
    .set({ status: next, updatedAt: new Date() })
    .where(and(eq(budgetRequests.id, row.id), eq(budgetRequests.status, row.status)));
  await writeAudit(tx, {
    actor: actorOf(actor, decision.actingRole),
    area: "annual",
    eventType: "annual.review_started",
    ...auditBase(row),
    details: { before: { status: row.status }, after: { status: next } },
  });
  return true;
}

// ---------------------------------------------------------------- decide (FR-15 to FR-18)

export type DecideResult = {
  requestId: string;
  kind: DecisionKind;
  status: AnnualStatus;
  approved: TaxBreakdown | null;
  decidedAt: string;
};

const EVENT: Record<DecisionKind, AnnualEvent> = {
  approve_as_requested: "approve",
  approve_different_amount: "approve",
  approve_line_changes: "approve",
  return: "return",
  decline: "decline",
};

const METHOD = {
  approve_as_requested: "as_requested",
  approve_different_amount: "different_amount",
  approve_line_changes: "line_changes",
} as const;

const AUDIT_EVENT: Record<DecisionKind, string> = {
  approve_as_requested: "annual.approved",
  approve_different_amount: "annual.approved",
  approve_line_changes: "annual.approved",
  return: "annual.returned",
  decline: "annual.declined",
};

/**
 * Records the accountant's decision on the latest submitted version. A request still
 * Submitted or Updated is put In Review first, so opening it isn't a separate step the
 * decision depends on. Approval and decline lock the request (AC-46). A repeated
 * idempotency key returns the first result (FR-10).
 */
export async function decideRequest(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown; idempotencyKey: unknown; decision: unknown },
  options: Options = {},
): Promise<DecideResult> {
  const key = parseKey(input.idempotencyKey);
  const repeat = await previousResult<DecideResult>(tx, key, actor, "annual.decide");
  if (repeat) return repeat;

  const now = options.now ?? new Date();
  const row = await loadRequest(tx, input.id, true);
  const { actingRole } = assertCan(actor, "annual.decide", {
    departmentId: row.departmentId,
    annualStatus: row.status,
  });
  const version = parseVersion(input.version);
  if (row.version !== version) throw new ConflictError({ type: "budget_request", id: row.id });
  const decision = parseInput(decisionSchema, input.decision);

  const from = canTransition(row.status, "start_review")
    ? transition(row.status, "start_review")
    : row.status;
  const next = nextOrRefuse(from, EVENT[decision.kind], e.notDecidable);
  const requestRevisionId = await latestRevisionId(tx, row);
  const base = {
    budgetRequestId: row.id,
    requestRevisionId,
    approverUserId: actor.id,
    actingRole,
    // Decisions go out at once until scheduled release arrives (FR-19a, Stage 2).
    releasedAt: now,
  };

  let approved: TaxBreakdown | null = null;
  let auditDetails: Record<string, unknown> = {};

  if (decision.kind === "return" || decision.kind === "decline") {
    await tx.insert(approvalDecisions).values({
      ...base,
      decision: decision.kind === "return" ? "returned" : "declined",
      decisionReason: decision.note,
    });
    await updateRequest(tx, row, version, {
      status: next,
      ...(decision.kind === "decline" ? { declinedAt: now } : {}),
    });
  } else {
    const lines = await lineRowsOf(tx, row.id);
    const figures = approvedFigures(lines, row.taxRate!, decision);
    if ("error" in figures) {
      if (figures.error === e.linesMismatch) throw new RuleError(figures.error);
      throw new ValidationError({ form: figures.error });
    }
    approved = figures.totals;

    const [created] = await tx
      .insert(approvalDecisions)
      .values({
        ...base,
        decision: "approved",
        method: METHOD[decision.kind],
        approvedSubtotalCents: approved.subtotal,
        approvedTaxCents: approved.tax,
        approvedTotalCents: approved.total,
        decisionReason: decision.note,
        boardReference: decision.boardReference,
      })
      .returning({ id: approvalDecisions.id });
    await tx.insert(approvedLineItems).values(
      figures.lines.map((l) => ({
        approvalDecisionId: created.id,
        budgetLineItemId: l.lineId,
        approvedQuantity: l.quantity,
        approvedUnitPriceCents: l.unitPriceCents,
        approvedLineTotalCents: l.lineTotalCents,
        adjustmentReason: l.reason,
      })),
    );
    // One total entered: the gap to the lines is its own entry, so they reconcile (FR-16).
    if (decision.kind === "approve_different_amount") {
      await tx.insert(approvalAdjustments).values({
        approvalDecisionId: created.id,
        amountCents: figures.adjustmentCents,
        reason: decision.note,
        createdByUserId: actor.id,
      });
    }
    await updateRequest(tx, row, version, {
      status: next,
      approvedSubtotalCents: approved.subtotal,
      approvedTaxCents: approved.tax,
      approvedTotalCents: approved.total,
      approvedAt: now,
      declinedAt: null,
    });
    const changedLines = figures.lines.filter(
      (l, i) => l.quantity !== lines[i].quantity || l.unitPriceCents !== lines[i].unitPriceCents,
    );
    auditDetails = {
      method: METHOD[decision.kind],
      approved,
      adjustmentCents:
        decision.kind === "approve_different_amount" ? figures.adjustmentCents : undefined,
      boardReference: decision.boardReference ?? undefined,
      changedLines: changedLines.length > 0 ? changedLines : undefined,
    };
  }

  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "annual",
    eventType: AUDIT_EVENT[decision.kind],
    ...auditBase(row),
    reason: decision.note ?? undefined,
    details: {
      before: { status: row.status },
      after: { status: next },
      requestedTotalCents: row.requestedTotalCents,
      versionNumber: row.versionNumber,
      ...auditDetails,
    },
  });
  // TODO(step 7): outbox the approval, clarification or decline email (FR-19, FR-21, AC-56).

  const result: DecideResult = {
    requestId: row.id,
    kind: decision.kind,
    status: next,
    approved,
    decidedAt: now.toISOString(),
  };
  await tx.insert(idempotencyKeys).values({
    key,
    userId: actor.id,
    action: "annual.decide",
    entityId: row.id,
    result,
  });
  return result;
}

// ---------------------------------------------------------------- reopen (FR-18a)

const reopenSchema = z.object({
  reason: z
    .string({ error: e.reopenReasonRequired })
    .trim()
    .min(1, e.reopenReasonRequired)
    .max(DECISION_LIMITS.note, e.noteTooLong),
});

export type ReopenResult = { requestId: string; status: AnnualStatus; reopenedAt: string };

/**
 * Sends an Approved or Declined request back to Returned for Clarification so the
 * department can change and resubmit it; no edit is used (FR-18a). The earlier decision
 * stays in history and the current approved amount is cleared until the next decision.
 */
export async function reopenRequest(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown; idempotencyKey: unknown; reason: unknown },
  options: Options = {},
): Promise<ReopenResult> {
  const key = parseKey(input.idempotencyKey);
  const repeat = await previousResult<ReopenResult>(tx, key, actor, "annual.reopen");
  if (repeat) return repeat;

  const now = options.now ?? new Date();
  const row = await loadRequest(tx, input.id, true);
  const { actingRole } = assertCan(actor, "annual.reopen", {
    departmentId: row.departmentId,
    annualStatus: row.status,
  });
  const version = parseVersion(input.version);
  if (row.version !== version) throw new ConflictError({ type: "budget_request", id: row.id });
  const { reason } = parseInput(reopenSchema, { reason: input.reason });
  const next = nextOrRefuse(row.status, "reopen", e.notReopenable);
  // TODO(Stage 3): warn and require confirmation while approved expenses exist (FR-18a).

  await tx.insert(approvalDecisions).values({
    budgetRequestId: row.id,
    requestRevisionId: await latestRevisionId(tx, row),
    decision: "reopened",
    decisionReason: reason,
    approverUserId: actor.id,
    actingRole,
    releasedAt: now,
  });
  await updateRequest(tx, row, version, {
    status: next,
    approvedSubtotalCents: null,
    approvedTaxCents: null,
    approvedTotalCents: null,
    approvedAt: null,
    declinedAt: null,
  });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "annual",
    eventType: "annual.reopened",
    ...auditBase(row),
    reason,
    details: {
      before: { status: row.status, approvedTotalCents: row.approvedTotalCents },
      after: { status: next, approvedTotalCents: null },
    },
  });
  // TODO(step 7): outbox "Request reopened" to the representatives and accountant (FR-21).

  const result: ReopenResult = { requestId: row.id, status: next, reopenedAt: now.toISOString() };
  await tx.insert(idempotencyKeys).values({
    key,
    userId: actor.id,
    action: "annual.reopen",
    entityId: row.id,
    result,
  });
  return result;
}
