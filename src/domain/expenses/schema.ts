import { z } from "zod";
import { expensesCopy } from "@/copy/expenses";
import { isHttpUrl } from "@/domain/annual/schema";
import {
  lineTotal,
  MAX_QUANTITY,
  MAX_UNIT_PRICE_CENTS,
  parseCAD,
  sumCents,
  totalForward,
  type TaxBreakdown,
} from "@/lib/money";
import type { ExpenseType } from "./status";

/**
 * The expense form's input (FR-40), shared by the browser and the server. Amounts arrive
 * as typed text and are parsed into integer cents here; the server parses again and
 * never trusts a total the browser sends (FR-41).
 *
 * A draft may hold unfinished rows, but whatever is typed must be valid, because rows
 * are stored in their own tables. Submission adds what's required (`submissionErrors`).
 */

const e = expensesCopy.errors;

export const LIMITS = {
  title: 120,
  justification: 2_000,
  itemName: 200,
  link: 2_000,
  vendor: 120,
  description: 300,
  receiptNumber: 60,
  payeeName: 120,
  explanation: 1_000,
  lines: 100,
} as const;

export const HOW_BOUGHT = ["church_account", "requester_claims", "supplier_invoice"] as const;
export type HowBought = (typeof HOW_BOUGHT)[number];
export const PAYEE_KINDS = ["self", "other", "church_card"] as const;
export type PayeeKind = (typeof PAYEE_KINDS)[number];
export const PAYMENT_PREFERENCES = ["cheque", "e_transfer"] as const;
export type PaymentPreference = (typeof PAYMENT_PREFERENCES)[number] | "none";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return (
    date.getUTCFullYear() === Number(m[1]) &&
    date.getUTCMonth() === Number(m[2]) - 1 &&
    date.getUTCDate() === Number(m[3])
  );
}

/** Whole days from one YYYY-MM-DD date to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function parseQuantity(text: string): number | null {
  const t = text.trim().replaceAll(",", "");
  if (t === "") return 1;
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n >= 1 && n <= MAX_QUANTITY ? n : null;
}

function parsePrice(text: string): number | null {
  const cents = text.trim() === "" ? 0 : parseCAD(text);
  return cents !== null && cents <= MAX_UNIT_PRICE_CENTS ? cents : null;
}

/** One of `values`, or blank; any other text is refused with `message`. */
const choice = <T extends string>(values: readonly T[], message: string) =>
  z
    .string()
    .default("")
    .refine((v): v is T | "" => v === "" || (values as readonly string[]).includes(v), message)
    .transform((v) => v as T | "");

const text = (max: number, message: string) => z.string().trim().max(max, message).default("");
const uuidOrBlank = z
  .string()
  .trim()
  .default("")
  .refine((v) => v === "" || z.uuid().safeParse(v).success, e.annualLineInvalid);

const itemSchema = z
  .object({
    name: text(LIMITS.itemName, e.itemNameTooLong),
    quantity: z.union([z.string(), z.number()]).default(""),
    unitPrice: z.union([z.string(), z.number()]).default(""),
    link: text(LIMITS.link, e.linkInvalid),
    annualLineItemId: uuidOrBlank,
  })
  .transform((item, ctx) => {
    const qtyText = String(item.quantity).trim();
    const priceText = String(item.unitPrice).trim();
    const quantity = parseQuantity(qtyText);
    const unitPriceCents = parsePrice(priceText);
    if (quantity === null) {
      ctx.addIssue({ code: "custom", path: ["quantity"], message: e.quantityInvalid });
    }
    if (unitPriceCents === null) {
      ctx.addIssue({ code: "custom", path: ["unitPrice"], message: e.unitPriceInvalid });
    }
    if (item.link !== "" && !isHttpUrl(item.link)) {
      ctx.addIssue({ code: "custom", path: ["link"], message: e.linkInvalid });
    }
    return {
      name: item.name,
      quantity: quantity ?? 1,
      unitPriceCents: unitPriceCents ?? 0,
      link: item.link === "" ? null : item.link,
      annualLineItemId: item.annualLineItemId === "" ? null : item.annualLineItemId,
      blank: item.name === "" && qtyText === "" && priceText === "" && item.link === "",
    };
  });

const lineSchema = z
  .object({
    date: z.string().trim().default(""),
    vendor: text(LIMITS.vendor, e.vendorTooLong),
    description: text(LIMITS.description, e.descriptionTooLong),
    amount: z.union([z.string(), z.number()]).default(""),
    receiptNumber: text(LIMITS.receiptNumber, e.receiptNumberTooLong),
  })
  .transform((line, ctx) => {
    const amountText = String(line.amount).trim();
    const blank =
      line.date === "" &&
      line.vendor === "" &&
      line.description === "" &&
      amountText === "" &&
      line.receiptNumber === "";
    // A row is stored as soon as anything is typed, so its date and amount must be valid.
    if (!blank && !isIsoDate(line.date)) {
      ctx.addIssue({
        code: "custom",
        path: ["date"],
        message: line.date === "" ? e.dateRequired : e.dateInvalid,
      });
    }
    const amountCents = amountText === "" ? null : parseCAD(amountText);
    if (!blank) {
      if (amountCents === null || amountCents > MAX_UNIT_PRICE_CENTS) {
        ctx.addIssue({ code: "custom", path: ["amount"], message: e.amountInvalid });
      } else if (amountCents === 0) {
        ctx.addIssue({ code: "custom", path: ["amount"], message: e.amountZero });
      }
    }
    return {
      date: line.date,
      vendor: line.vendor,
      description: line.description,
      amountCents: amountCents ?? 0,
      receiptNumber: line.receiptNumber === "" ? null : line.receiptNumber,
      blank,
    };
  });

const keepBreaks = (max: number, message: string) =>
  z
    .string()
    .transform((v) => v.replace(/\s+$/, ""))
    .pipe(z.string().max(max, message))
    .default("");

/** A row as stored: the "nothing typed" marker is only for dropping empty rows. */
function withoutBlank<T extends { blank: boolean }>(row: T): Omit<T, "blank"> {
  const copy: Partial<T> = { ...row };
  delete copy.blank;
  return copy as Omit<T, "blank">;
}

export const expenseContentSchema = z
  .object({
    title: text(LIMITS.title, e.titleTooLong),
    justification: keepBreaks(LIMITS.justification, e.justificationTooLong),
    items: z.array(itemSchema).max(LIMITS.lines, e.tooManyLines).default([]),
    howBought: choice(HOW_BOUGHT, e.howBoughtRequired),
    lines: z.array(lineSchema).max(LIMITS.lines, e.tooManyLines).default([]),
    linkedPurchaseRequestId: z
      .string()
      .trim()
      .default("")
      .refine((v) => v === "" || z.uuid().safeParse(v).success, e.linkedRequestInvalid),
    payeeKind: choice(PAYEE_KINDS, e.payeeRequired),
    payeeName: text(LIMITS.payeeName, e.payeeNameTooLong),
    payeeEmail: z
      .string()
      .trim()
      .toLowerCase()
      .default("")
      .refine((v) => v === "" || z.email().safeParse(v).success, e.payeeEmailInvalid),
    paymentPreference: choice(PAYMENT_PREFERENCES, e.paymentPreferenceRequired),
    noReceipt: z.boolean().default(false),
    noReceiptReason: keepBreaks(LIMITS.explanation, e.explanationTooLong),
    overBudgetExplanation: keepBreaks(LIMITS.explanation, e.explanationTooLong),
    lateExplanation: keepBreaks(LIMITS.explanation, e.explanationTooLong),
  })
  .transform((c) => ({
    title: c.title,
    justification: c.justification,
    items: c.items.filter((i) => !i.blank).map(withoutBlank),
    howBought: c.howBought === "" ? null : c.howBought,
    lines: c.lines.filter((l) => !l.blank).map(withoutBlank),
    linkedPurchaseRequestId: c.linkedPurchaseRequestId === "" ? null : c.linkedPurchaseRequestId,
    payeeKind: c.payeeKind === "" ? null : c.payeeKind,
    payeeName: c.payeeName === "" ? null : c.payeeName,
    payeeEmail: c.payeeEmail === "" ? null : c.payeeEmail,
    paymentPreference: c.paymentPreference === "" ? null : c.paymentPreference,
    noReceiptReason: c.noReceipt ? c.noReceiptReason || null : null,
    noReceipt: c.noReceipt,
    overBudgetExplanation: c.overBudgetExplanation || null,
    lateExplanation: c.lateExplanation || null,
  }));

export type ExpenseContentInput = z.input<typeof expenseContentSchema>;
export type ExpenseContent = z.output<typeof expenseContentSchema>;
export type ItemContent = ExpenseContent["items"][number];
export type ReceiptLineContent = ExpenseContent["lines"][number];

/** Purchase request: tax once on the subtotal (FR-41). Claim: the amounts paid, no tax added. */
export function expenseTotals(
  type: ExpenseType,
  content: Pick<ExpenseContent, "items" | "lines">,
  rate: string,
): TaxBreakdown {
  if (type === "purchase_request") {
    return totalForward(
      sumCents(content.items.map((i) => lineTotal(i.quantity, i.unitPriceCents))),
      rate,
    );
  }
  const total = sumCents(content.lines.map((l) => l.amountCents));
  return { subtotal: total, tax: 0, total };
}

export type SubmissionContext = {
  /** Today in the church's time zone, YYYY-MM-DD. */
  today: string;
  claimDeadlineDays: number;
  /** Receipt files attached (claims). */
  receiptCount: number;
  /** How far Remaining would go below zero; 0 when within budget (FR-43). */
  overBy: number;
};

/** The oldest receipt is past the claim deadline (FR-46). */
export function isLateClaim(
  lines: readonly Pick<ReceiptLineContent, "date">[],
  today: string,
  claimDeadlineDays: number,
): boolean {
  return lines.some((l) => isIsoDate(l.date) && daysBetween(l.date, today) > claimDeadlineDays);
}

/**
 * What must be true before an expense is submitted (FR-40, FR-43, FR-46, 6B.9). Keys
 * match the form ("items.2.name"). The server runs this with the live budget figures.
 */
export function submissionErrors(
  type: ExpenseType,
  content: ExpenseContent,
  ctx: SubmissionContext,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (content.title === "") errors.title = e.titleRequired;
  if (content.justification.trim() === "") errors.justification = e.justificationRequired;

  if (type === "purchase_request") {
    if (content.items.length === 0) errors.items = e.itemsRequired;
    content.items.forEach((item, i) => {
      if (item.name === "") errors[`items.${i}.name`] = e.itemNameRequired;
    });
    if (!content.howBought) errors.howBought = e.howBoughtRequired;
  } else {
    if (content.lines.length === 0) errors.lines = e.linesRequired;
    content.lines.forEach((line, i) => {
      if (line.vendor === "") errors[`lines.${i}.vendor`] = e.vendorRequired;
      if (line.description === "") errors[`lines.${i}.description`] = e.descriptionRequired;
      if (isIsoDate(line.date) && line.date > ctx.today) errors[`lines.${i}.date`] = e.dateFuture;
    });
    if (!content.payeeKind) errors.payeeKind = e.payeeRequired;
    if (content.payeeKind === "other" && !content.payeeName) errors.payeeName = e.payeeNameRequired;
    if (content.payeeKind && content.payeeKind !== "church_card") {
      if (!content.paymentPreference) errors.paymentPreference = e.paymentPreferenceRequired;
      if (content.paymentPreference === "e_transfer" && !content.payeeEmail) {
        errors.payeeEmail = e.eTransferEmailRequired;
      }
    }
    if (content.noReceipt) {
      if (!content.noReceiptReason) errors.noReceiptReason = e.noReceiptReasonRequired;
    } else if (ctx.receiptCount === 0) {
      errors.receipts = e.receiptRequired;
    }
    if (isLateClaim(content.lines, ctx.today, ctx.claimDeadlineDays) && !content.lateExplanation) {
      errors.lateExplanation = e.lateExplanationRequired(ctx.claimDeadlineDays);
    }
  }
  if (ctx.overBy > 0 && !content.overBudgetExplanation) {
    errors.overBudgetExplanation = e.overBudgetExplanationRequired;
  }
  return errors;
}

/** Problems with what's typed, for the browser to show early; the server's check counts. */
export function formatErrors(input: ExpenseContentInput): Record<string, string> {
  const parsed = expenseContentSchema.safeParse(input);
  if (parsed.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) errors[issue.path.join(".") || "form"] ??= issue.message;
  return errors;
}

/** Live totals while typing; unfinished rows count as $0.00. */
export function liveTotals(
  type: ExpenseType,
  input: Pick<ExpenseContentInput, "items" | "lines">,
  rate: string,
): TaxBreakdown {
  if (type === "purchase_request") {
    const totals = (input.items ?? []).map((i) => {
      const q = parseQuantity(String(i.quantity ?? ""));
      const p = parsePrice(String(i.unitPrice ?? ""));
      return q === null || p === null ? 0 : lineTotal(q, p);
    });
    return totalForward(sumCents(totals), rate);
  }
  const total = sumCents(
    (input.lines ?? []).map((l) => {
      const cents = parseCAD(String(l.amount ?? ""));
      return cents !== null && cents <= MAX_UNIT_PRICE_CENTS ? cents : 0;
    }),
  );
  return { subtotal: total, tax: 0, total };
}

/** One item's line total while typing, or null until its quantity and price are valid. */
export function itemTotalOf(quantity: string, unitPrice: string): number | null {
  const q = parseQuantity(quantity);
  const p = parsePrice(unitPrice);
  return q === null || p === null ? null : lineTotal(q, p);
}
