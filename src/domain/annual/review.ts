import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { annualCopy } from "@/copy/annual";
import {
  approvalAdjustments,
  approvalDecisions,
  approvedLineItems,
  budgetCycles,
  budgetRequests,
  departments,
  idempotencyKeys,
  requestRevisions,
} from "@/db/schema";
import type { Tx } from "@/db/types";
import { ConflictError, parseInput, RuleError, ValidationError } from "@/domain/errors";
import { writeAudit } from "@/lib/audit";
import { assertCan, authorize, type Subject } from "@/lib/authz";
import { formatCAD, type TaxBreakdown } from "@/lib/money";
import { approvedFigures, decisionSchema, DECISION_LIMITS, type DecisionKind } from "./decision";
import { queueAnnualEmails, type AnnualEmailEvent } from "./emails";
import { secondApprovalThreshold } from "@/domain/settings";
import { isHolding } from "./release";
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
import {
  canTransition,
  isApproved,
  transition,
  type AnnualEvent,
  type AnnualStatus,
} from "./status";
import { expenseUseOf } from "@/domain/expenses/budget";

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
  await queueAnnualEmails(tx, row.id, actor.id, { kind: "review_started" });
  return true;
}

// ---------------------------------------------------------------- decide (FR-15 to FR-18)

export type DecideResult = {
  requestId: string;
  kind: DecisionKind;
  status: AnnualStatus;
  approved: TaxBreakdown | null;
  decidedAt: string;
  /** Held for scheduled release: when the department hears (FR-19a). */
  heldUntil: string | null;
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

/** Which email a decision sends (FR-19, FR-21). Return and decline always carry a note. */
function emailEvent(decision: { kind: DecisionKind; note?: string | null }): AnnualEmailEvent {
  if (decision.kind === "return") return { kind: "returned", question: decision.note ?? "" };
  if (decision.kind === "decline") return { kind: "declined", reason: decision.note ?? "" };
  return { kind: "approved" };
}

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
  let next = nextOrRefuse(from, EVENT[decision.kind], e.notDecidable);
  const requestRevisionId = await latestRevisionId(tx, row);
  // FR-19a: in Hold mode an approval or decline waits for the release; a question never does.
  const [cycle] = await tx
    .select({
      decisionEmailMode: budgetCycles.decisionEmailMode,
      decisionReleaseAt: budgetCycles.decisionReleaseAt,
    })
    .from(budgetCycles)
    .where(eq(budgetCycles.id, row.budgetCycleId));
  const held = decision.kind !== "return" && isHolding(cycle, now);
  const base = {
    budgetRequestId: row.id,
    requestRevisionId,
    approverUserId: actor.id,
    actingRole,
    releasedAt: held ? null : now,
  };

  let approved: TaxBreakdown | null = null;
  let auditDetails: Record<string, unknown> = {};
  /** FR-34: an approval at or above the threshold waits for a second accountant. */
  let pendingSecond = false;

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
    // AC-15: a budget is approved only for a department on the list (FR-03).
    const [{ status: departmentStatus }] = await tx
      .select({ status: departments.status })
      .from(departments)
      .where(eq(departments.id, row.departmentId));
    if (departmentStatus === "proposed") throw new RuleError(e.proposedDepartment);
    const lines = await lineRowsOf(tx, row.id);
    const figures = approvedFigures(lines, row.taxRate!, decision);
    if ("error" in figures) {
      if (figures.error === e.linesMismatch) throw new RuleError(figures.error);
      throw new ValidationError({ form: figures.error });
    }
    approved = figures.totals;
    const threshold = await secondApprovalThreshold(tx);
    pendingSecond = threshold !== null && approved.total >= threshold;
    if (pendingSecond) next = nextOrRefuse(from, "approve_pending_second", e.notDecidable);

    const [created] = await tx
      .insert(approvalDecisions)
      .values({
        ...base,
        // The first of two approvals isn't the final decision, so it's never held (FR-19a).
        releasedAt: pendingSecond ? now : base.releasedAt,
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
    // Until the second approval, the request carries no approved amount (FR-34).
    await updateRequest(
      tx,
      row,
      version,
      pendingSecond
        ? { status: next, declinedAt: null }
        : {
            status: next,
            approvedSubtotalCents: approved.subtotal,
            approvedTaxCents: approved.tax,
            approvedTotalCents: approved.total,
            approvedAt: now,
            declinedAt: null,
          },
    );
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
      ...(pendingSecond ? { stage: "first", secondApprovalThreshold: threshold } : {}),
    };
  }
  const finalHeld = held && !pendingSecond;

  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "annual",
    eventType: pendingSecond ? "annual.first_approved" : AUDIT_EVENT[decision.kind],
    ...auditBase(row),
    reason: decision.note ?? undefined,
    details: {
      before: { status: row.status },
      after: { status: next },
      requestedTotalCents: row.requestedTotalCents,
      versionNumber: row.versionNumber,
      ...auditDetails,
      ...(finalHeld ? { heldUntil: cycle.decisionReleaseAt!.toISOString() } : {}),
    },
  });
  // While decisions are held, the department isn't told it's awaiting sign-off either.
  await queueAnnualEmails(
    tx,
    row.id,
    actor.id,
    pendingSecond ? { kind: "awaiting_second" } : emailEvent(decision),
    { now, ...(held ? { hold: { releaseAt: cycle.decisionReleaseAt! } } : {}) },
  );

  const result: DecideResult = {
    requestId: row.id,
    kind: decision.kind,
    status: next,
    approved,
    decidedAt: now.toISOString(),
    heldUntil: finalHeld ? cycle.decisionReleaseAt!.toISOString() : null,
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
  input: {
    id: string;
    version: unknown;
    idempotencyKey: unknown;
    reason: unknown;
    /** The accountant confirmed the warning that expenses rely on this budget (FR-18a). */
    confirmExpenses?: unknown;
  },
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
  // Expenses rely on an approved budget: reopening takes its Available away until it's
  // approved again, so the accountant must confirm the warning first (FR-18a).
  const use = isApproved(row.status)
    ? await expenseUseOf(tx, row.budgetCycleId, row.departmentId)
    : null;
  if (use && input.confirmExpenses !== true) {
    throw new RuleError(
      e.reopenHasExpenses(formatCAD(use.committed), formatCAD(use.spent), formatCAD(use.pending)),
    );
  }

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
  await queueAnnualEmails(tx, row.id, actor.id, { kind: "reopened", reason }, { now });

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

// ---------------------------------------------------------------- second approval (FR-34)

const secondSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("approve") }),
  z.object({
    kind: z.literal("refuse"),
    note: z
      .string({ error: e.refuseReasonRequired })
      .trim()
      .min(1, e.refuseReasonRequired)
      .max(DECISION_LIMITS.note, e.noteTooLong),
  }),
]);

export type SecondDecisionInput = z.input<typeof secondSchema>;
export type SecondDecideResult = {
  requestId: string;
  kind: "approve" | "refuse";
  status: AnnualStatus;
  heldUntil: string | null;
};

/** The first-stage approval a request awaiting a second approval is waiting on. */
export async function pendingFirstApproval(tx: Tx, requestId: string) {
  const [first] = await tx
    .select()
    .from(approvalDecisions)
    .where(
      and(
        eq(approvalDecisions.budgetRequestId, requestId),
        eq(approvalDecisions.decision, "approved"),
      ),
    )
    .orderBy(desc(approvalDecisions.createdAt))
    .limit(1);
  return first ?? null;
}

/**
 * The second approval of a large budget (FR-34): a different accountant or backup
 * approver, who doesn't represent the department, gives it (the request becomes Approved
 * for the first approver's amount and the department is told) or refuses it with a
 * reason (back to In Review). Recorded as its own decision; nothing earlier changes.
 */
export async function secondDecideRequest(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown; idempotencyKey: unknown; decision: unknown },
  options: Options = {},
): Promise<SecondDecideResult> {
  const key = parseKey(input.idempotencyKey);
  const repeat = await previousResult<SecondDecideResult>(tx, key, actor, "annual.second_decide");
  if (repeat) return repeat;

  const now = options.now ?? new Date();
  const row = await loadRequest(tx, input.id, true);
  const { actingRole } = assertCan(actor, "annual.second_approve", {
    departmentId: row.departmentId,
    annualStatus: row.status,
  });
  const version = parseVersion(input.version);
  if (row.version !== version) throw new ConflictError({ type: "budget_request", id: row.id });
  const decision = parseInput(secondSchema, input.decision);
  if (row.status !== "awaiting_second_approval") throw new RuleError(e.notAwaitingSecond);
  const first = await pendingFirstApproval(tx, row.id);
  if (!first) throw new RuleError(e.notAwaitingSecond);
  if (first.approverUserId === actor.id) throw new RuleError(e.sameApprover);
  const requestRevisionId = await latestRevisionId(tx, row);

  let next: AnnualStatus;
  let heldUntil: Date | null = null;
  if (decision.kind === "approve") {
    next = transition(row.status, "second_approve");
    const [cycle] = await tx
      .select({
        decisionEmailMode: budgetCycles.decisionEmailMode,
        decisionReleaseAt: budgetCycles.decisionReleaseAt,
      })
      .from(budgetCycles)
      .where(eq(budgetCycles.id, row.budgetCycleId));
    if (isHolding(cycle, now)) heldUntil = cycle.decisionReleaseAt;
    await tx.insert(approvalDecisions).values({
      budgetRequestId: row.id,
      requestRevisionId,
      decision: "second_approved",
      decisionStage: "second",
      approvedSubtotalCents: first.approvedSubtotalCents,
      approvedTaxCents: first.approvedTaxCents,
      approvedTotalCents: first.approvedTotalCents,
      approverUserId: actor.id,
      actingRole,
      // FR-19a: the final decision waits for the release like any other.
      releasedAt: heldUntil ? null : now,
    });
    await updateRequest(tx, row, version, {
      status: next,
      approvedSubtotalCents: first.approvedSubtotalCents,
      approvedTaxCents: first.approvedTaxCents,
      approvedTotalCents: first.approvedTotalCents,
      approvedAt: now,
    });
    await writeAudit(tx, {
      actor: actorOf(actor, actingRole),
      area: "annual",
      eventType: "annual.second_approved",
      ...auditBase(row),
      details: {
        before: { status: row.status },
        after: { status: next },
        firstApproverUserId: first.approverUserId,
        approvedTotalCents: first.approvedTotalCents,
        ...(heldUntil ? { heldUntil: heldUntil.toISOString() } : {}),
      },
    });
    await queueAnnualEmails(
      tx,
      row.id,
      first.approverUserId,
      { kind: "approved" },
      {
        now,
        ...(heldUntil ? { hold: { releaseAt: heldUntil } } : {}),
      },
    );
  } else {
    next = transition(row.status, "second_refuse");
    await tx.insert(approvalDecisions).values({
      budgetRequestId: row.id,
      requestRevisionId,
      decision: "second_refused",
      decisionStage: "second",
      decisionReason: decision.note,
      approverUserId: actor.id,
      actingRole,
      releasedAt: now,
    });
    await updateRequest(tx, row, version, { status: next });
    await writeAudit(tx, {
      actor: actorOf(actor, actingRole),
      area: "annual",
      eventType: "annual.second_refused",
      ...auditBase(row),
      reason: decision.note,
      details: {
        before: { status: row.status },
        after: { status: next },
        firstApproverUserId: first.approverUserId,
      },
    });
    await queueAnnualEmails(
      tx,
      row.id,
      actor.id,
      { kind: "second_refused", reason: decision.note, firstApproverId: first.approverUserId },
      { now },
    );
  }

  const result: SecondDecideResult = {
    requestId: row.id,
    kind: decision.kind,
    status: next,
    heldUntil: heldUntil?.toISOString() ?? null,
  };
  await tx.insert(idempotencyKeys).values({
    key,
    userId: actor.id,
    action: "annual.second_decide",
    entityId: row.id,
    result,
  });
  return result;
}
