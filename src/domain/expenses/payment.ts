import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { expensesCopy } from "@/copy/expenses";
import { expensePayments, spendingEntries } from "@/db/schema";
import type { Tx } from "@/db/types";
import { actorOf, parseKey, parseVersion, previousResult } from "@/domain/annual/service";
import { ConflictError, parseInput, RuleError, ValidationError } from "@/domain/errors";
import { getChurchTimeZone } from "@/domain/settings";
import { activeSigners } from "@/domain/signers/service";
import { writeAudit } from "@/lib/audit";
import { assertCan, type Subject } from "@/lib/authz";
import { parseCAD } from "@/lib/money";
import { zonedDate } from "@/lib/time-zone";
import { checkSpendingAlerts } from "@/domain/spending/alerts";
import { assertSpendingOpen } from "@/domain/spending/service";
import { queueExpenseEmails } from "./emails";
import { isIsoDate } from "./schema";
import {
  auditBase,
  authzContextOf,
  loadExpense,
  nextExpenseOrRefuse,
  storeIdempotent,
  updateExpense,
  type ExpenseRow,
} from "./service";
import { canTransitionExpense, transitionExpense, type ExpenseStatus } from "./status";

/**
 * Processing and payment (6B.5): after both approvals the Church Administrator (or the
 * accountant) pays or buys outside the app and records how. Nobody records a payment to
 * themselves. Recording it finishes the expense, and the spending ledger shows what was
 * actually paid (FR-24, FR-42).
 */

const e = expensesCopy.errors;
type Options = { now?: Date };

export const PAYMENT_METHODS = [
  "cheque",
  "church_card",
  "cash",
  "e_transfer",
  "supplier_eft",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** A purchase request the requester buys themselves isn't processed here: their claim is. */
export function isProcessable(row: Pick<ExpenseRow, "type" | "howBought">): boolean {
  return !(row.type === "purchase_request" && row.howBought === "requester_claims");
}

function assertProcessable(row: ExpenseRow) {
  if (!isProcessable(row)) throw new RuleError(e.boughtByRequester);
}

// ---------------------------------------------------------------- start processing

export type ProcessingResult = { expenseId: string; status: ExpenseStatus };

/** Start processing (6B.5 step 2): the requester is told it's being processed. */
export async function startProcessing(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown; idempotencyKey: unknown },
  options: Options = {},
): Promise<ProcessingResult> {
  const key = parseKey(input.idempotencyKey);
  const repeat = await previousResult<ProcessingResult>(
    tx,
    key,
    actor,
    "expenses.start_processing",
  );
  if (repeat) return repeat;
  const now = options.now ?? new Date();
  const row = await loadExpense(tx, input.id, true);
  const { actingRole } = assertCan(actor, "expense.pay", authzContextOf(row));
  const version = parseVersion(input.version);
  if (row.version !== version) throw new ConflictError({ type: "expense_submission", id: row.id });
  assertProcessable(row);
  const next = nextExpenseOrRefuse(row, "start_processing", e.notProcessable);
  await updateExpense(tx, row, version, { status: next });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "expenses",
    eventType: "expenses.processing_started",
    ...auditBase(row),
    details: { before: { status: row.status }, after: { status: next } },
  });
  await queueExpenseEmails(tx, row.id, actor.id, { kind: "processing_started" }, { now });
  return storeIdempotent(tx, key, actor, "expenses.start_processing", row.id, {
    expenseId: row.id,
    status: next,
  });
}

// ---------------------------------------------------------------- record payment

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, e.paymentTextTooLong)
    .optional()
    .transform((v) => v || null);

const paymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS, { error: e.paymentMethodRequired }),
  methodOther: text(100),
  paidOn: z.string().trim().refine(isIsoDate, e.paidOnInvalid),
  amount: z.union([z.string(), z.number()]).transform((value, ctx) => {
    const cents = parseCAD(String(value));
    if (cents === null || cents <= 0) {
      ctx.addIssue({ code: "custom", message: e.paidAmountInvalid });
      return z.NEVER;
    }
    return cents;
  }),
  differenceNote: text(1_000),
  reference: text(120),
  chequeSigner1Id: text(60),
  chequeSigner2Id: text(60),
  cardLast4: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^\d{4}$/.test(v), e.cardLast4Invalid),
  purchasedBy: text(120),
  cashReceivedBy: text(120),
  receiptSigned: z.boolean().optional().default(false),
  notes: text(1_000),
});
export type PaymentInput = z.input<typeof paymentSchema>;

/** What each method needs (6B.5 table, AC-76), keyed like the form. */
function methodErrors(p: z.output<typeof paymentSchema>): Record<string, string> {
  const errors: Record<string, string> = {};
  switch (p.method) {
    case "cheque":
      if (!p.reference) errors.reference = e.chequeNumberRequired;
      if (!p.chequeSigner1Id) errors.chequeSigner1Id = e.signerRequired;
      if (!p.chequeSigner2Id) errors.chequeSigner2Id = e.signerRequired;
      if (p.chequeSigner1Id && p.chequeSigner1Id === p.chequeSigner2Id) {
        errors.chequeSigner2Id = e.signersDifferent;
      }
      break;
    case "church_card":
      if (!p.cardLast4) errors.cardLast4 = e.cardLast4Invalid;
      if (!p.reference) errors.reference = e.transactionReferenceRequired;
      if (!p.purchasedBy) errors.purchasedBy = e.purchasedByRequired;
      break;
    case "cash":
      if (!p.cashReceivedBy) errors.cashReceivedBy = e.cashReceivedByRequired;
      break;
    case "e_transfer":
      if (!p.reference) errors.reference = e.eTransferReferenceRequired;
      break;
    case "supplier_eft":
      if (!p.reference) errors.reference = e.invoiceNumberRequired;
      if (!p.purchasedBy) errors.purchasedBy = e.supplierRequired;
      break;
    case "other":
      if (!p.methodOther) errors.methodOther = e.methodOtherRequired;
      break;
  }
  return errors;
}

export type PaymentResult = { expenseId: string; status: ExpenseStatus; paymentId: string };

/**
 * Record payment (6B.5 steps 3-4): how, when and how much was paid, with the fields the
 * method needs (AC-76). A cheque needs its number and two different active signing
 * authorities (AC-135). An amount other than the approved one needs a note. An Approved
 * expense is put in Processing first. The claim becomes Paid (or, on the church card,
 * Closed: nothing was owed); a purchase request becomes Purchased.
 */
export async function recordPayment(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown; idempotencyKey: unknown; payment: unknown },
  options: Options = {},
): Promise<PaymentResult> {
  const key = parseKey(input.idempotencyKey);
  const repeat = await previousResult<PaymentResult>(tx, key, actor, "expenses.record_payment");
  if (repeat) return repeat;
  const now = options.now ?? new Date();
  const row = await loadExpense(tx, input.id, true);
  const { actingRole } = assertCan(actor, "expense.pay", authzContextOf(row));
  const version = parseVersion(input.version);
  if (row.version !== version) throw new ConflictError({ type: "expense_submission", id: row.id });
  assertProcessable(row);
  const p = parseInput(paymentSchema, input.payment);
  const errors = methodErrors(p);
  const today = zonedDate(now, await getChurchTimeZone(tx));
  if (p.paidOn > today) errors.paidOn = e.paidOnFuture;
  const approvedCents = row.approvedTotalCents!;
  if (p.amount !== approvedCents && !p.differenceNote)
    errors.differenceNote = e.differenceNoteRequired;
  if (Object.keys(errors).length > 0) throw new ValidationError(errors);

  // AC-134, AC-135: the two signers must both be on the active list on the cheque's date.
  let signers: { id: string; name: string }[] = [];
  if (p.method === "cheque") {
    const active = await activeSigners(tx, p.paidOn);
    if (active.length < 2) throw new RuleError(e.notEnoughSigners);
    const chosen = [p.chequeSigner1Id, p.chequeSigner2Id].map((id) =>
      active.find((s) => s.id === id),
    );
    if (chosen.some((s) => !s)) throw new ValidationError({ chequeSigner1Id: e.signerInactive });
    signers = chosen as { id: string; name: string }[];
  }

  const from = canTransitionExpense(row.status, "start_processing", row.type)
    ? transitionExpense(row.status, "start_processing", row.type)
    : row.status;
  const event = row.type === "expense_claim" ? "pay" : "purchase";
  let next = nextExpenseOrRefuse({ ...row, status: from }, event, e.notProcessable);
  // A church-card claim owed nothing: once recorded, it's finished (FR-45 "Closed").
  if (row.type === "expense_claim" && row.payeeKind === "church_card") {
    next = transitionExpense(next, "close", row.type);
  }

  const reference =
    p.method === "church_card"
      ? `${expensesCopy.payment.cardEnding(p.cardLast4!)} · ${p.reference}`
      : p.reference;
  const [payment] = await tx
    .insert(expensePayments)
    .values({
      expenseSubmissionId: row.id,
      method: p.method,
      methodOther: p.method === "other" ? p.methodOther : null,
      paidOn: p.paidOn,
      amountCents: p.amount,
      differenceNote: p.amount !== approvedCents ? p.differenceNote : null,
      reference,
      chequeSigner1Id: signers[0]?.id ?? null,
      chequeSigner1Name: signers[0]?.name ?? null,
      chequeSigner2Id: signers[1]?.id ?? null,
      chequeSigner2Name: signers[1]?.name ?? null,
      purchasedBy: p.method === "church_card" || p.method === "supplier_eft" ? p.purchasedBy : null,
      cashReceivedBy: p.method === "cash" ? p.cashReceivedBy : null,
      receiptSigned: p.method === "cash" ? p.receiptSigned : null,
      notes: p.notes,
      recordedByUserId: actor.id,
      recordedAt: now,
    })
    .returning({ id: expensePayments.id });
  await updateExpense(tx, row, version, {
    status: next,
    ...(next === "closed" ? { closedAt: now } : {}),
  });
  await recordSpending(tx, actor, actingRole, row, p, reference, now);
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "expenses",
    eventType: row.type === "expense_claim" ? "expenses.paid" : "expenses.purchased",
    ...auditBase(row),
    details: {
      before: { status: row.status },
      after: { status: next },
      paymentId: payment.id,
      method: p.method,
      paidOn: p.paidOn,
      amountCents: p.amount,
      approvedTotalCents: approvedCents,
      ...(signers.length ? { signers: signers.map((s) => s.name) } : {}),
    },
  });
  await queueExpenseEmails(tx, row.id, actor.id, { kind: "paid" }, { now });
  // FR-28: a payment that differs from the approved amount can change where it stands.
  await checkSpendingAlerts(tx, row.budgetCycleId, row.departmentId, { now });
  return storeIdempotent(tx, key, actor, "expenses.record_payment", row.id, {
    expenseId: row.id,
    status: next,
    paymentId: payment.id,
  });
}

/**
 * The ledger shows what was actually paid (FR-24, FR-42). A claim's entry was made at
 * final approval: it gains the method and reference, and the amount paid if different.
 * A purchase bought on the church's account gets its entry now, and its commitment ends.
 */
async function recordSpending(
  tx: Tx,
  actor: Subject,
  actingRole: Parameters<typeof actorOf>[1],
  row: ExpenseRow,
  p: z.output<typeof paymentSchema>,
  reference: string | null,
  now: Date,
) {
  await assertSpendingOpen(tx, row.budgetCycleId);
  const base = { departmentId: row.departmentId, cycleId: row.budgetCycleId };
  if (row.type === "expense_claim") {
    const [entry] = await tx
      .select()
      .from(spendingEntries)
      .where(
        and(
          eq(spendingEntries.expenseSubmissionId, row.id),
          eq(spendingEntries.status, "recorded"),
        ),
      );
    if (!entry) return;
    await tx
      .update(spendingEntries)
      .set({
        paymentMethod: p.method,
        referenceNumber: reference ?? entry.referenceNumber,
        amountCents: p.amount,
        updatedByUserId: actor.id,
        updatedAt: now,
        version: entry.version + 1,
      })
      .where(eq(spendingEntries.id, entry.id));
    await writeAudit(tx, {
      actor: actorOf(actor, actingRole),
      area: "spending",
      eventType: "spending.entry_paid",
      entity: { type: "spending_entry", id: entry.id },
      ...base,
      details: {
        before: { amountCents: entry.amountCents, paymentMethod: entry.paymentMethod },
        after: { amountCents: p.amount, paymentMethod: p.method },
        expenseSubmissionId: row.id,
      },
    });
    return;
  }
  const [entry] = await tx
    .insert(spendingEntries)
    .values({
      budgetCycleId: row.budgetCycleId,
      departmentId: row.departmentId,
      expenseSubmissionId: row.id,
      entryType: "expense",
      spentOn: p.paidOn,
      payee: p.purchasedBy ?? expensesCopy.payment.churchAccount,
      description: `${row.referenceNumber} · ${row.title}`,
      amountCents: p.amount,
      paymentMethod: p.method,
      referenceNumber: reference,
      createdByUserId: actor.id,
    })
    .returning({ id: spendingEntries.id });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "spending",
    eventType: "spending.entry_from_expense",
    entity: { type: "spending_entry", id: entry.id },
    ...base,
    details: { expenseSubmissionId: row.id, amountCents: p.amount },
  });
}

/** The cheque signers to offer on a date: the active list (AC-134). */
export async function signerOptions(tx: Tx, onDate: string) {
  return (await activeSigners(tx, onDate)).map((s) => ({ id: s.id, name: s.name }));
}

/** A recorded payment, for the expense page and the paid email. */
export async function paymentOf(tx: Tx, expenseId: string) {
  const [payment] = await tx
    .select()
    .from(expensePayments)
    .where(eq(expensePayments.expenseSubmissionId, expenseId));
  return payment ?? null;
}
