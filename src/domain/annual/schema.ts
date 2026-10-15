import { z } from "zod";
import { annualCopy } from "@/copy/annual";
import { MAX_QUANTITY, MAX_UNIT_PRICE_CENTS, parseCAD } from "@/lib/money";

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
    const qtyText = String(line.quantity).trim().replaceAll(",", "");
    const quantity = qtyText === "" ? 1 : /^\d+$/.test(qtyText) ? Number(qtyText) : Number.NaN;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      ctx.addIssue({ code: "custom", path: ["quantity"], message: e.quantityInvalid });
    }
    const priceText = String(line.unitPrice).trim();
    const unitPriceCents = priceText === "" ? 0 : parseCAD(priceText);
    if (unitPriceCents === null || unitPriceCents > MAX_UNIT_PRICE_CENTS) {
      ctx.addIssue({ code: "custom", path: ["unitPrice"], message: e.unitPriceInvalid });
    }
    if (line.link !== "" && !isHttpUrl(line.link)) {
      ctx.addIssue({ code: "custom", path: ["link"], message: e.linkInvalid });
    }
    return {
      name: line.name,
      quantity,
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
