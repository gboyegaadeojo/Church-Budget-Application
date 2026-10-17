import { z } from "zod";
import { spendingCopy } from "@/copy/spending";
import { parseCAD } from "@/lib/money";

/**
 * A spending entry as typed (FR-24), shared by the form and the server. Amounts are the
 * amount paid including tax, read as cents without floats; the app adds no tax.
 */

const e = spendingCopy.errors;

export const ENTRY_TYPES = ["expense", "refund"] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

/** FR-24's payment methods. Entries made from expenses keep their payment's method. */
export const PAYMENT_METHODS = [
  "cheque",
  "church_card",
  "e_transfer",
  "cash",
  "staff_reimbursement",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ENTRY_LIMITS = {
  payee: 200,
  description: 500,
  reference: 100,
  notes: 2_000,
  reason: 2_000,
  maxCents: 10_000_000_000,
} as const;

const text = (max: number, required: string) =>
  z.string({ error: required }).trim().min(1, required).max(max, e.tooLong(max));
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, e.tooLong(max))
    .optional()
    .transform((v) => v || null);
const flag = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === "true" || v === "on");

export const entrySchema = z.object({
  entryType: z.enum(ENTRY_TYPES, { error: e.typeRequired }),
  spentOn: z
    .string({ error: e.dateRequired })
    .regex(/^\d{4}-\d{2}-\d{2}$/, e.dateRequired)
    .refine((v) => {
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, e.dateRequired),
  payee: text(ENTRY_LIMITS.payee, e.payeeRequired),
  description: text(ENTRY_LIMITS.description, e.descriptionRequired),
  amount: z.union([z.string(), z.number()]).transform((value, ctx) => {
    const cents = parseCAD(String(value));
    if (cents === null || cents <= 0 || cents > ENTRY_LIMITS.maxCents) {
      ctx.addIssue({ code: "custom", message: e.amountInvalid });
      return z.NEVER;
    }
    return cents;
  }),
  paymentMethod: z.enum(PAYMENT_METHODS, { error: e.methodRequired }),
  referenceNumber: optional(ENTRY_LIMITS.reference),
  budgetLineItemId: z
    .string()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || z.uuid().safeParse(v).success, e.lineInvalid),
  notes: optional(ENTRY_LIMITS.notes),
  overspendNote: optional(ENTRY_LIMITS.notes),
  /** The person saw the warning and still wants to save (FR-24). */
  confirmDuplicate: flag,
  confirmUnbudgeted: flag,
  /** The accountant allows a date outside the budget year (FR-24). */
  allowOutsideYear: flag,
});
export type EntryInput = z.input<typeof entrySchema>;
export type Entry = z.output<typeof entrySchema>;

export const reasonSchema = text(ENTRY_LIMITS.reason, e.reasonRequired);
