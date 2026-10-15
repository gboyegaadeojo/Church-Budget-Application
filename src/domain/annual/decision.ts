import { z } from "zod";
import { annualCopy } from "@/copy/annual";
import {
  lineTotal,
  MAX_QUANTITY,
  MAX_UNIT_PRICE_CENTS,
  parseCAD,
  splitInclusive,
  sumCents,
  totalForward,
  type TaxBreakdown,
} from "@/lib/money";

/**
 * The accountant's decision on an annual request (FR-15 to FR-18), shared by the review
 * screen and the server. Amounts arrive as typed text and become integer cents here.
 * `approvedFigures` is the one calculation of what an approval stores: the screen uses
 * it for the live summary, and the server recalculates with it and ignores any total
 * the browser might send (CLAUDE.md constraint 3).
 */

const e = annualCopy.errors;

export const DECISION_LIMITS = {
  note: 2_000,
  boardReference: 200,
  adjustmentReason: 500,
  /** $100,000,000.00: far above any church budget, well inside safe integers. */
  maxApprovedTotalCents: 10_000_000_000,
} as const;

const requiredNote = (message: string) =>
  z.string({ error: message }).trim().min(1, message).max(DECISION_LIMITS.note, e.noteTooLong);

const optionalNote = z
  .string()
  .trim()
  .max(DECISION_LIMITS.note, e.noteTooLong)
  .optional()
  .transform((v) => v || null);

const boardReference = z
  .string()
  .trim()
  .max(DECISION_LIMITS.boardReference, e.boardReferenceTooLong)
  .optional()
  .transform((v) => v || null);

const approvedTotal = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const cents = parseCAD(String(value));
  if (cents === null) {
    ctx.addIssue({ code: "custom", message: e.approvedTotalInvalid });
    return z.NEVER;
  }
  if (cents === 0) {
    ctx.addIssue({ code: "custom", message: e.approvedTotalZero });
    return z.NEVER;
  }
  if (cents > DECISION_LIMITS.maxApprovedTotalCents) {
    ctx.addIssue({ code: "custom", message: e.approvedTotalTooLarge });
    return z.NEVER;
  }
  return cents;
});

/** One line as the accountant approves it: quantity 0 excludes it (FR-15). */
const approvedLine = z
  .object({
    lineId: z.uuid({ error: e.linesMismatch }),
    quantity: z.union([z.string(), z.number()]),
    unitPrice: z.union([z.string(), z.number()]),
    reason: z
      .string()
      .trim()
      .max(DECISION_LIMITS.adjustmentReason, e.adjustmentReasonTooLong)
      .optional()
      .transform((v) => v || null),
  })
  .transform((line, ctx) => {
    const qtyText = String(line.quantity).trim().replaceAll(",", "");
    const quantity = /^\d+$/.test(qtyText) ? Number(qtyText) : null;
    if (quantity === null || quantity > MAX_QUANTITY) {
      ctx.addIssue({ code: "custom", path: ["quantity"], message: e.approvedQuantityInvalid });
    }
    const unitPriceCents = parseCAD(String(line.unitPrice));
    if (unitPriceCents === null || unitPriceCents > MAX_UNIT_PRICE_CENTS) {
      ctx.addIssue({ code: "custom", path: ["unitPrice"], message: e.approvedPriceInvalid });
    }
    return {
      lineId: line.lineId,
      quantity: quantity ?? 0,
      unitPriceCents: unitPriceCents ?? 0,
      reason: line.reason,
    };
  });

export const decisionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("approve_as_requested"), note: optionalNote, boardReference }),
  z.object({
    kind: z.literal("approve_different_amount"),
    approvedTotal,
    note: requiredNote(e.noteRequired),
    boardReference,
  }),
  z.object({
    kind: z.literal("approve_line_changes"),
    lines: z.array(approvedLine),
    note: requiredNote(e.noteRequired),
    boardReference,
  }),
  z.object({ kind: z.literal("return"), note: requiredNote(e.returnNoteRequired) }),
  z.object({ kind: z.literal("decline"), note: requiredNote(e.declineReasonRequired) }),
]);

export type DecisionInput = z.input<typeof decisionSchema>;
export type Decision = z.output<typeof decisionSchema>;
export type DecisionKind = Decision["kind"];
export type ApprovalKind = Extract<DecisionKind, `approve_${string}`>;

/** A requested line as the review screen and the server both see it. */
export type RequestedLine = {
  id: string;
  quantity: number;
  unitPriceCents: number;
};

export type ApprovedLine = {
  lineId: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  reason: string | null;
};

export type ApprovedFigures = {
  totals: TaxBreakdown;
  lines: ApprovedLine[];
  /**
   * Pre-tax difference between the approved subtotal and the approved lines, stored as
   * the overall adjustment entry when one total is entered (FR-16). Zero otherwise.
   */
  adjustmentCents: number;
};

/**
 * What an approval stores, from the requested lines at the request's snapshotted rate:
 * - as requested: every line as asked, total forward (subtotal + tax).
 * - different amount: lines as asked; the total entered is split inclusive (AC-35), and
 *   the gap between the lines and the approved subtotal becomes the adjustment.
 * - line changes: the approved lines, total forward.
 * Lines must be the request's lines, each once; anything else is refused.
 */
export function approvedFigures(
  requested: readonly RequestedLine[],
  rate: string,
  decision: Extract<Decision, { kind: ApprovalKind }>,
): ApprovedFigures | { error: string } {
  const asRequested = requested.map((l): ApprovedLine => ({
    lineId: l.id,
    quantity: l.quantity,
    unitPriceCents: l.unitPriceCents,
    lineTotalCents: lineTotal(l.quantity, l.unitPriceCents),
    reason: null,
  }));
  const subtotalOf = (lines: ApprovedLine[]) => sumCents(lines.map((l) => l.lineTotalCents));

  switch (decision.kind) {
    case "approve_as_requested":
      return {
        totals: totalForward(subtotalOf(asRequested), rate),
        lines: asRequested,
        adjustmentCents: 0,
      };
    case "approve_different_amount": {
      const totals = splitInclusive(decision.approvedTotal, rate);
      return {
        totals,
        lines: asRequested,
        adjustmentCents: totals.subtotal - subtotalOf(asRequested),
      };
    }
    case "approve_line_changes": {
      const byId = new Map(decision.lines.map((l) => [l.lineId, l]));
      if (byId.size !== decision.lines.length || byId.size !== requested.length) {
        return { error: e.linesMismatch };
      }
      const lines: ApprovedLine[] = [];
      for (const l of requested) {
        const approved = byId.get(l.id);
        if (!approved) return { error: e.linesMismatch };
        lines.push({
          lineId: l.id,
          quantity: approved.quantity,
          unitPriceCents: approved.unitPriceCents,
          lineTotalCents: approvedLineTotal(approved.quantity, approved.unitPriceCents),
          reason: approved.reason,
        });
      }
      const changed = lines.some(
        (l, i) =>
          l.quantity !== requested[i].quantity || l.unitPriceCents !== requested[i].unitPriceCents,
      );
      if (!changed) return { error: e.noLineChanges };
      const subtotal = subtotalOf(lines);
      if (subtotal === 0) return { error: e.approvedTotalZero };
      return { totals: totalForward(subtotal, rate), lines, adjustmentCents: 0 };
    }
  }
}

/** An approved line total: quantity 0 excludes the item (FR-15), otherwise quantity × price. */
export function approvedLineTotal(quantity: number, unitPriceCents: number): number {
  return quantity === 0 ? 0 : lineTotal(quantity, unitPriceCents);
}
