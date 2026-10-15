import { z } from "zod";
import { annualCopy } from "@/copy/annual";
import {
  lineTotal,
  MAX_QUANTITY,
  MAX_UNIT_PRICE_CENTS,
  parseCAD,
  sumCents,
  totalForward,
  type TaxBreakdown,
} from "@/lib/money";

/**
 * The annual budget form's input (FR-04 to FR-09), shared by the browser and the server.
 * Amounts arrive as typed text ("1,025.00") and are parsed into integer cents here, so
 * no float ever touches money. The server parses again and never trusts a client total.
 */

const e = annualCopy.errors;

export const LIMITS = {
  title: 120,
  justification: 2_000,
  itemName: 200,
  notes: 1_000,
  link: 2_000,
  lines: 200,
} as const;

/** http and https only, with a host (FR-08). */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "";
  } catch {
    return false;
  }
}

/**
 * One line as saved. A draft may hold unfinished lines: a missing quantity counts as 1
 * and a missing price as $0.00, so autosave never fails mid-typing. Values that are
 * present must be valid. Submission adds its own checks (`submissionErrors`).
 */
const lineSchema = z
  .object({
    name: z.string().trim().max(LIMITS.itemName, e.itemNameTooLong).default(""),
    quantity: z.union([z.string(), z.number()]).default(""),
    unitPrice: z.union([z.string(), z.number()]).default(""),
    link: z.string().trim().max(LIMITS.link, e.linkInvalid).default(""),
    notes: z.string().trim().max(LIMITS.notes, e.notesTooLong).default(""),
  })
  .transform((line, ctx) => {
    const qtyText = String(line.quantity).trim();
    const quantity = parseQuantity(qtyText);
    if (quantity === null) {
      ctx.addIssue({ code: "custom", path: ["quantity"], message: e.quantityInvalid });
    }
    const priceText = String(line.unitPrice).trim();
    const unitPriceCents = parsePrice(priceText);
    if (unitPriceCents === null) {
      ctx.addIssue({ code: "custom", path: ["unitPrice"], message: e.unitPriceInvalid });
    }
    if (line.link !== "" && !isHttpUrl(line.link)) {
      ctx.addIssue({ code: "custom", path: ["link"], message: e.linkInvalid });
    }
    return {
      name: line.name,
      quantity: quantity ?? 1,
      unitPriceCents: unitPriceCents ?? 0,
      link: line.link === "" ? null : line.link,
      notes: line.notes === "" ? null : line.notes,
      /** Nothing typed at all: dropped rather than saved. */
      blank:
        line.name === "" &&
        qtyText === "" &&
        priceText === "" &&
        line.link === "" &&
        line.notes === "",
    };
  });

export type LineContent = {
  name: string;
  quantity: number;
  unitPriceCents: number;
  link: string | null;
  notes: string | null;
};

export const requestContentSchema = z
  .object({
    title: z.string().trim().max(LIMITS.title, e.titleTooLong).default(""),
    // Line breaks are kept (FR-09); only trailing space is trimmed.
    justification: z
      .string()
      .transform((v) => v.replace(/\s+$/, ""))
      .pipe(z.string().max(LIMITS.justification, e.justificationTooLong))
      .default(""),
    lines: z.array(lineSchema).max(LIMITS.lines, e.tooManyLines).default([]),
  })
  .transform((content) => ({
    title: content.title,
    justification: content.justification,
    lines: content.lines
      .filter((l) => !l.blank)
      .map((l): LineContent => ({
        name: l.name,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        link: l.link,
        notes: l.notes,
      })),
  }));

export type RequestContentInput = z.input<typeof requestContentSchema>;
export type RequestContent = z.output<typeof requestContentSchema>;

/**
 * What must be true before a request is submitted or revised (FR-05, FR-06, FR-09,
 * Requirements 11 rules 5 and 8). Field keys match the form ("lines.2.name").
 */
export function submissionErrors(content: RequestContent): Record<string, string> {
  const errors: Record<string, string> = {};
  if (content.title === "") errors.title = e.titleRequired;
  if (content.justification.trim() === "") errors.justification = e.justificationRequired;
  if (content.lines.length === 0) errors.lines = e.linesRequired;
  content.lines.forEach((line, i) => {
    if (line.name === "") errors[`lines.${i}.name`] = e.itemNameRequired;
    if (line.unitPriceCents === 0 && !line.notes) errors[`lines.${i}.notes`] = e.zeroPriceNeedsNote;
  });
  return errors;
}

/** Subtotal, tax once on the subtotal, and total (FR-07). The server's figures always win. */
export function totalsOf(lines: readonly LineContent[], rate: string): TaxBreakdown {
  return totalForward(sumCents(lines.map((l) => lineTotal(l.quantity, l.unitPriceCents))), rate);
}

/** A typed quantity: blank counts as 1; otherwise a whole number from 1 to 10,000. */
function parseQuantity(text: string): number | null {
  const t = text.trim().replaceAll(",", "");
  if (t === "") return 1;
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n >= 1 && n <= MAX_QUANTITY ? n : null;
}

/** A typed unit price before tax: blank counts as $0.00; at most $1,000,000.00. */
function parsePrice(text: string): number | null {
  const cents = text.trim() === "" ? 0 : parseCAD(text);
  return cents !== null && cents <= MAX_UNIT_PRICE_CENTS ? cents : null;
}

/** A line total as the form shows it while typing: null until quantity and price are valid. */
export function lineTotalOf(quantity: string, unitPrice: string): number | null {
  const qty = parseQuantity(quantity);
  const price = parsePrice(unitPrice);
  return qty === null || price === null ? null : lineTotal(qty, price);
}

/**
 * Every problem with the form as typed, keyed like the form ("lines.2.name"): format
 * first, then, when `forSubmission`, what submitting needs. The browser shows these
 * early; the server runs the same checks and is the one that counts.
 */
export function formErrors(
  input: RequestContentInput,
  forSubmission: boolean,
): Record<string, string> {
  const parsed = requestContentSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues)
      errors[issue.path.join(".") || "form"] ??= issue.message;
    return errors;
  }
  return forSubmission ? submissionErrors(parsed.data) : {};
}

/** Cents as the form's price field shows them: 102500 → "1025.00" (no float). */
export function centsToInput(cents: number): string {
  const digits = String(cents).padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
