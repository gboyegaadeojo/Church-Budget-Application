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
  // Intl gets a value with at most two decimals, so no float rounding can leak in.
  const formatted = CAD.format(Number(`${dollars}.${String(rem).padStart(2, "0")}`));
  return cents < 0 ? `−${formatted}` : formatted;
}
