/**
 * Money helpers (CLAUDE.md "Money and tax"). Amounts are integer cents; never floats.
 * This first slice only formats. The tax functions arrive with the next step.
 */

const CAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents)) {
    throw new TypeError(`Money must be a whole number of cents, got ${cents}`);
  }
}

/** Formats cents as "$1,148.00". Negative amounts use a true minus sign (DRD 3.7). */
export function formatCAD(cents: number): string {
  assertCents(cents);
  const abs = Math.abs(cents);
  const dollars = Math.trunc(abs / 100);
  const rem = abs % 100;
  // Intl only ever sees whole dollars (exact as integers); the cents are put into the
  // fraction part as text, so no float rounding can leak in at any size.
  const formatted = CAD.formatToParts(dollars)
    .map((part) => (part.type === "fraction" ? String(rem).padStart(2, "0") : part.value))
    .join("");
  return cents < 0 ? `−${formatted}` : formatted;
}
