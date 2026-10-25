import { z } from "zod";
import { expensesCopy } from "@/copy/expenses";
import { parseCAD, splitInclusive, type TaxBreakdown } from "@/lib/money";
import type { ExpenseType } from "./status";

/**
 * Decisions on an expense (6B.4), shared by the review screens and the server. Amounts
 * arrive as typed text and become integer cents here; the server recalculates with
 * `approvedFiguresFor` and ignores any total the browser sends (constraint 3).
 */

const e = expensesCopy.errors;

export const DECISION_LIMITS = { note: 2_000, maxTotalCents: 10_000_000_000 } as const;

const note = (message: string) =>
  z.string({ error: message }).trim().min(1, message).max(DECISION_LIMITS.note, e.noteTooLong);

const optionalNote = z
  .string()
  .trim()
  .max(DECISION_LIMITS.note, e.noteTooLong)
  .optional()
  .transform((v) => v || null);

const amount = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const cents = parseCAD(String(value));
  if (cents === null || cents > DECISION_LIMITS.maxTotalCents) {
    ctx.addIssue({ code: "custom", message: e.amountInvalidDecision });
    return z.NEVER;
  }
  if (cents === 0) {
    ctx.addIssue({ code: "custom", message: e.amountZeroDecision });
    return z.NEVER;
  }
  return cents;
});

/** Level 1, the accountant (6B.4 step 3). */
export const accountantDecisionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("approve"), note: optionalNote }),
  z.object({
    kind: z.literal("approve_different_amount"),
    amount,
    note: note(e.differentAmountNoteRequired),
  }),
  z.object({ kind: z.literal("return"), note: note(e.returnNoteRequired) }),
  z.object({ kind: z.literal("decline"), note: note(e.declineReasonRequired) }),
]);
export type AccountantDecisionInput = z.input<typeof accountantDecisionSchema>;
export type AccountantDecision = z.output<typeof accountantDecisionSchema>;

/** Level 2, the Board Chair or Vice-Chair (6B.4 step 6). */
export const boardDecisionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("approve"), note: optionalNote }),
  z.object({
    kind: z.literal("approve_smaller"),
    amount,
    note: note(e.differentAmountNoteRequired),
  }),
  z.object({ kind: z.literal("return"), note: note(e.boardReturnNoteRequired) }),
  z.object({ kind: z.literal("decline"), note: note(e.declineReasonRequired) }),
]);
export type BoardDecisionInput = z.input<typeof boardDecisionSchema>;
export type BoardDecision = z.output<typeof boardDecisionSchema>;

export const VERBAL_LIMITS = { how: 500 } as const;

const verbalBase = {
  level: z.enum(["accountant", "board"]),
  approverUserId: z.uuid({ error: e.verbalApproverRequired }),
  /** When and how the approver gave it, e.g. "By phone, Oct 24". */
  how: z
    .string({ error: e.verbalHowRequired })
    .trim()
    .min(1, e.verbalHowRequired)
    .max(VERBAL_LIMITS.how, e.verbalHowTooLong),
  /** The Church Administrator confirms the approver told them they approve it. */
  confirmed: z.literal(true, { error: e.verbalConfirmRequired }),
};

/**
 * An approval given verbally, recorded by the Church Administrator on the approver's
 * behalf (decided by the church 2026-10-24). Approvals only: a question or a decline is
 * the approver's own to make in the app.
 */
export const verbalApprovalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("approve"), note: optionalNote, ...verbalBase }),
  z.object({
    kind: z.literal("approve_smaller"),
    amount,
    note: note(e.differentAmountNoteRequired),
    ...verbalBase,
  }),
]);
export type VerbalApprovalInput = z.input<typeof verbalApprovalSchema>;
export type VerbalApproval = z.output<typeof verbalApprovalSchema>;

/**
 * An approved total including tax as stored (FR-41): a purchase request works out the
 * tax inside it (FR-16, AC-69: $500.00 → $446.43 + $53.57); a claim adds no tax.
 */
export function approvedFiguresFor(
  type: ExpenseType,
  totalCents: number,
  rate: string,
): TaxBreakdown {
  return type === "purchase_request"
    ? splitInclusive(totalCents, rate)
    : { subtotal: totalCents, tax: 0, total: totalCents };
}
