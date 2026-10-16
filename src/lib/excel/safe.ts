/**
 * Spreadsheet safety (FR-20, AC-96, CLAUDE.md "Excel"). Text someone typed (a title, an
 * item name, a note) could start with a character that Excel or another spreadsheet
 * reads as a formula, such as "=HYPERLINK(...)". Such text is prefixed with an
 * apostrophe so it shows as plain text and never runs.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function safeText(value: string | null | undefined): string {
  if (value == null) return "";
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/** Cents to the dollars Excel stores; display only, every figure was summed in cents. */
export function centsToDollars(cents: number): number {
  return cents / 100;
}

/** "$1,148.00", negatives in brackets, in Excel's own number format. */
export const CAD_FORMAT = '"$"#,##0.00;("$"#,##0.00)';

/** "12.00%" for a stored rate such as "0.1200". */
export const RATE_FORMAT = "0.00%";

/**
 * One part of a file name: letters, digits and dashes, words joined with "_"
 * ("Women's Fellowship Team" → "Womens_Fellowship_Team").
 */
export function fileNamePart(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/['’]/g, "")
      .replace(/[^A-Za-z0-9-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "Export"
  );
}
